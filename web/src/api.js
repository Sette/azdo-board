// Cliente da API local (Express → MCP → Azure DevOps).
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Idioma das mensagens de erro da API (definido pelo LangProvider).
let apiLang = 'en';
export const setApiLang = (lang) => {
  apiLang = lang;
};

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'x-lang': apiLang, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(cleanError(data.error) || `Error ${res.status}`, res.status);
    err.missingFields = data.missingFields;
    err.additional = data.additional;
    throw err;
  }
  return data;
}

// Mensagens do Azure vêm com prefixos técnicos; deixa só o essencial.
function cleanError(msg) {
  if (!msg) return msg;
  return String(msg)
    .replace(/^Error (creating|updating) work item( \[HTTP \d+[^\]]*\])?:\s*/i, '')
    .slice(0, 500);
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
  return s.toString() ? `?${s}` : '';
};

export const api = {
  meta: () => request('GET', '/meta'),
  people: () => request('GET', '/people'),
  sprintItems: (iterationId) => request('GET', `/sprints/${iterationId}/items`),
  backlog: () => request('GET', '/backlog'),
  my: (done) => request('GET', `/my${qs({ done: done ? 1 : undefined })}`),
  search: ({ q, types, states, assignee }) =>
    request('GET', `/search${qs({ q, types: types?.join(','), states: states?.join(','), assignee })}`),
  parents: (type) => request('GET', `/parents${qs({ type })}`),
  blocked: () => request('GET', '/blocked'),
  validation: () => request('GET', '/validation'),
  item: (id) => request('GET', `/items/${id}`),
  update: (id, changes) => request('PATCH', `/items/${id}`, changes),
  create: (body) => request('POST', '/items', body),
  comment: (id, text) => request('POST', `/items/${id}/comments`, { text }),
};
