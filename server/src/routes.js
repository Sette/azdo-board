// Rotas REST do front. Cada uma delega para o serviço do Azure DevOps (azdo.js),
// aceitando instância fixa (modo local/demo) ou função `(req) => azdo` (modo multi-usuário).
import { Router } from 'express';
import { describeMissing, msg, pickLang } from './i18n.js';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

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
