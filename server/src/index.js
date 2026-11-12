import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAzdo } from './azdo.js';
import { closeClient, getClient } from './mcp.js';
import { createRouter, errorHandler } from './routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';

const app = express();
app.use(express.json({ limit: '2mb' }));
// AZDO_DEMO=1: fictional in-memory data, no Azure DevOps (see src/demo/).
const demo = process.env.AZDO_DEMO === '1';
const azdo = demo ? (await import('./demo/index.js')).createDemoAzdo() : createAzdo();
app.use('/api', createRouter(azdo));
app.use('/api', errorHandler);

// Em produção (npm run build && npm start) o próprio Express serve o front.
app.use(express.static(webDist));
app.get(/^\/(?!api\/).*/, (_req, res, next) => res.sendFile(path.join(webDist, 'index.html'), (err) => err && next()));

// Só localhost por padrão (o servidor usa o PAT de quem roda); em container usa HOST=0.0.0.0.
const server = app.listen(port, host, () => {
  console.log(`[api] http://${host}:${port}${demo ? ' [demo: fictional data, no Azure DevOps]' : ''}`);
  if (demo) return;
  getClient().catch((err) => console.error('[mcp] falha ao conectar:', err.message));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close();
    if (!demo) await closeClient();
    process.exit(0);
  });
}
