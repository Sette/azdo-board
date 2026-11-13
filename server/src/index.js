import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAuth, patFingerprint } from './auth.js';
import { createAzdo } from './azdo.js';
import { closeClient, createMcpPool, getClient } from './mcp.js';
import { getProcess } from './process.js';
import { createRouter, errorHandler } from './routes.js';
import { createTaskboard } from './taskboard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
const port = Number(process.env.PORT || 3001);
// Em container/Cloud Run (K_SERVICE) escuta em 0.0.0.0; localmente fica restrito a 127.0.0.1.
const host = process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Cabeçalhos de segurança (COOP same-origin-allow-popups é necessário para o popup do Google Sign-In).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json({ limit: '2mb' }));

// AZDO_DEMO=1: fictional in-memory data, no Azure DevOps (see src/demo/).
const demo = process.env.AZDO_DEMO === '1';
const mcpPool = createMcpPool();
const auth = createAuth({
  onPatClear: (pat) => mcpPool.evictPat(pat),
});

let azdoTarget;
if (demo) {
  azdoTarget = (await import('./demo/index.js')).createDemoAzdo();
} else if (auth.authRequired) {
  const proc = getProcess();
  const sharedMetaCache = { current: null };
  const userServices = new Map();
  azdoTarget = (req) => {
    const email = req.user?.email || null;
    const pat = req.userPat;
    const cacheKey = `${email || 'pat'}:${patFingerprint(pat)}`;
    let svc = userServices.get(cacheKey);
    if (!svc) {
      if (userServices.size >= 24) userServices.delete(userServices.keys().next().value);
      const userEnv = { ...process.env, PERSONAL_ACCESS_TOKEN: pat, AZDO_ME: email || '' };
      svc = createAzdo({
        callTool: (name, args, opts) => mcpPool.callToolForPat(pat, name, args, opts),
        env: userEnv,
        proc,
        taskboard: createTaskboard({ env: userEnv }),
        userEmail: email,
        sharedMetaCache,
      });
      userServices.set(cacheKey, svc);
    }
    return svc;
  };
} else {
  azdoTarget = createAzdo();
}

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', auth.csrfGuard);
app.use('/api/auth', auth.createAuthRouter());
app.use('/api', auth.requireAuth, createRouter(azdoTarget));
app.use('/api', errorHandler);

// Em produção (npm run build && npm start) o próprio Express serve o front.
app.use(express.static(webDist));
app.get(/^\/(?!api\/).*/, (_req, res, next) => res.sendFile(path.join(webDist, 'index.html'), (err) => err && next()));

const server = app.listen(port, host, () => {
  const mode = demo
    ? ' [demo: fictional data, no Azure DevOps]'
    : auth.googleAuthEnabled
      ? ' [google oauth + per-user PAT]'
      : auth.patAuthRequired
        ? ' [per-user PAT]'
        : '';
  console.log(`[api] http://${host}:${port}${mode}`);
  if (demo || auth.authRequired) return;
  getClient().catch((err) => console.error('[mcp] falha ao conectar:', err.message));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close();
    if (!demo) {
      await Promise.all([closeClient(), mcpPool.closeAll()]);
    }
    process.exit(0);
  });
}
