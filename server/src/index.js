import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAzdo } from './azdo.js';
import { closeClient, getClient } from './mcp.js';
import { createRouter, errorHandler } from './routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
const port = Number(process.env.PORT || 3001);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', createRouter(createAzdo()));
app.use('/api', errorHandler);

// Em produção (npm run build && npm start) o próprio Express serve o front.
app.use(express.static(webDist));
app.get(/^\/(?!api\/).*/, (_req, res, next) => res.sendFile(path.join(webDist, 'index.html'), (err) => err && next()));

// Só localhost: o servidor usa o PAT de quem roda.
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${port}`);
  getClient().catch((err) => console.error('[mcp] falha ao conectar:', err.message));
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close();
    await closeClient();
    process.exit(0);
  });
}
