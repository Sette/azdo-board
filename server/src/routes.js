// Rotas REST do front. Cada uma delega para o serviço do Azure DevOps (azdo.js),
// aceitando instância fixa (modo local/demo) ou função `(req) => azdo` (modo multi-usuário).
import express, { Router } from 'express';
import { describeMissing, msg, pickLang } from './i18n.js';

const MAX_ATTACHMENT_MB = 20;
const rawAttachment = express.raw({ type: 'application/octet-stream', limit: `${MAX_ATTACHMENT_MB}mb` });
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

function contentDisposition(disposition, fileName) {
  const ascii = String(fileName || 'attachment').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(String(fileName || 'attachment'));
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export function createRouter(azdo) {
  const r = Router();
  const svc = (req) => (typeof azdo === 'function' ? azdo(req) : azdo);
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => res.json(data)).catch(next);

  r.get('/meta', h((req) => svc(req).getMeta({ refresh: req.query.refresh === '1' })));
  r.get('/people', h((req) => svc(req).getPeople()));
  r.get('/sprints/:iterationId/items', h((req) => svc(req).getSprintItems(req.params.iterationId)));
  r.get('/parents', h((req) => svc(req).getParentCandidates(req.query.type || 'Feature')));
  r.get('/blocked', h((req) => svc(req).getBlocked()));
  r.get('/validation', h((req) => svc(req).getValidation()));
  r.get('/backlog', h((req) => svc(req).getBacklog()));
  r.get('/my', h((req) => svc(req).getMyItems({ includeCompleted: req.query.done === '1' })));
  r.get('/search', h((req) =>
    svc(req).search({ q: req.query.q, types: list(req.query.types), states: list(req.query.states), assignee: req.query.assignee }),
  ));
  r.get('/items/:id', h((req) => svc(req).getItem(req.params.id)));
  r.patch('/items/:id', h((req) => svc(req).updateItem(req.params.id, req.body || {})));
  r.post('/items', h((req) => svc(req).createItem(req.body || {})));
  r.post('/items/:id/comments', h((req) => svc(req).addComment(req.params.id, req.body?.text)));
  r.post('/attachments', rawAttachment, h((req) => svc(req).uploadAttachment({ fileName: req.query.fileName, buffer: req.body })));
  r.get('/attachments/:attachmentId', (req, res, next) => {
    Promise.resolve(svc(req).getAttachment(req.params.attachmentId, { fileName: req.query.fileName }))
      .then(({ buffer, mimeType, fileName, inlineAllowed }) => {
        const inline = inlineAllowed && req.query.download !== '1';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', fileName));
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.end(buffer);
      })
      .catch(next);
  });
  r.post(
    '/items/:id/attachments',
    rawAttachment,
    h((req) => svc(req).addAttachment(req.params.id, { fileName: req.query.fileName, comment: req.query.comment, buffer: req.body })),
  );
  r.delete('/items/:id/attachments/:attachmentId', h((req) => svc(req).removeAttachment(req.params.id, req.params.attachmentId)));

  return r;
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.too.large') {
    err.status = 413;
    err.code = 'attachmentTooLarge';
    err.params = { maxMb: MAX_ATTACHMENT_MB };
  }
  const status = err.status || 500;
  const lang = pickLang(req.get('x-lang'), process.env.APP_LANG || 'en');
  let message = err.message;
  if (err.code === 'requiredFields') message = msg(lang, 'requiredFields', { fields: describeMissing(err.params.missing, lang) });
  else if (err.code) message = msg(lang, err.code, err.params);
  if (status >= 500) console.error(`[api] ${req.method} ${req.path}:`, err.message);
  res.status(status).json({ error: message, code: err.code, tool: err.tool, missingFields: err.missingFields, additional: err.additional });
}
