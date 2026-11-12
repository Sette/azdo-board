// Rotas REST do front. Cada uma delega para o serviço do Azure DevOps (azdo.js).
import { Router } from 'express';
import { describeMissing, msg, pickLang } from './i18n.js';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

export function createRouter(azdo) {
  const r = Router();
  const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((data) => res.json(data)).catch(next);

  r.get('/meta', h((req) => azdo.getMeta({ refresh: req.query.refresh === '1' })));
  r.get('/people', h(() => azdo.getPeople()));
  r.get('/sprints/:iterationId/items', h((req) => azdo.getSprintItems(req.params.iterationId)));
  r.get('/parents', h((req) => azdo.getParentCandidates(req.query.type || 'Feature')));
  r.get('/blocked', h(() => azdo.getBlocked()));
  r.get('/validation', h(() => azdo.getValidation()));
  r.get('/backlog', h(() => azdo.getBacklog()));
  r.get('/my', h((req) => azdo.getMyItems({ includeCompleted: req.query.done === '1' })));
  r.get('/search', h((req) =>
    azdo.search({ q: req.query.q, types: list(req.query.types), states: list(req.query.states), assignee: req.query.assignee }),
  ));
  r.get('/items/:id', h((req) => azdo.getItem(req.params.id)));
  r.patch('/items/:id', h((req) => azdo.updateItem(req.params.id, req.body || {})));
  r.post('/items', h((req) => azdo.createItem(req.body || {})));
  r.post('/items/:id/comments', h((req) => azdo.addComment(req.params.id, req.body?.text)));

  return r;
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const lang = pickLang(req.get('x-lang'), process.env.APP_LANG || 'en');
  let message = err.message;
  if (err.code === 'requiredFields') message = msg(lang, 'requiredFields', { fields: describeMissing(err.params.missing, lang) });
  else if (err.code) message = msg(lang, err.code, err.params);
  if (status >= 500) console.error(`[api] ${req.method} ${req.path}:`, err.message);
  res.status(status).json({ error: message, code: err.code, tool: err.tool, missingFields: err.missingFields, additional: err.additional });
}
