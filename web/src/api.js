// Cliente da API local (Express → MCP → Azure DevOps).
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Idioma das mensagens de erro da API (definido pelo LangProvider).
let apiLang = 'en';
export const setApiLang = (lang) => {
  apiLang = lang;
};

async function request(method, path, body) {
  const headers = { 'x-lang': apiLang };
  if (method !== 'GET' && method !== 'HEAD') headers['x-requested-with'] = 'azdo-board';
  if (body) headers['content-type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (
      !path.startsWith('/auth') &&
      ((res.status === 401 && (data.code === 'unauthenticated' || data.code === 'invalidPat')) ||
        (res.status === 403 && data.code === 'patRequired'))
    ) {
      window.dispatchEvent(new CustomEvent('azdo:auth-invalid', { detail: { code: data.code } }));
    }
    const err = new ApiError(cleanError(data.error) || `Error ${res.status}`, res.status, data.code);
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
  authStatus: () => request('GET', '/auth/status'),
  loginGoogle: (credential) => request('POST', '/auth/google', { credential }),
  savePat: (pat) => request('POST', '/auth/pat', { pat }),
  clearPat: () => request('DELETE', '/auth/pat'),
  logout: () => request('POST', '/auth/logout'),
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
