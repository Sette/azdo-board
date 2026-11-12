export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#0052cc', '#00875a', '#de350b', '#5243aa', '#ff8b00', '#00a3bf', '#6554c0', '#c9372c', '#1f845a', '#946f00'];
export function colorFor(key = '') {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Lozenge de estado no estilo Jira, pela categoria do estado.
export function stateTone(category) {
  switch (category) {
    case 'InProgress':
      return 'bg-[#deebff] text-[#0747a6]';
    case 'Completed':
      return 'bg-[#e3fcef] text-[#006644]';
    case 'Removed':
      return 'bg-[#ffebe6] text-[#bf2600]';
    default:
      return 'bg-[#dfe1e6] text-[#42526e]';
  }
}

export function stateCategory(meta, type, state) {
  const list = meta?.states?.[type] || meta?.states?.['Product Backlog Item'] || [];
  return list.find((s) => s.name === state)?.category || 'Proposed';
}

export function fmtDate(iso, locale = 'en-US', opts = { day: '2-digit', month: 'short' }) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(locale, { timeZone: 'UTC', ...opts });
}

export function fmtDateTime(iso, locale = 'en-US') {
  if (!iso) return '';
  return new Date(iso).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function personKey(p) {
  return p?.email || p?.name || '';
}

// "Nome <email>" é o formato aceito pelo System.AssignedTo.
export function personValue(p) {
  if (!p) return '';
  return p.email ? `${p.name} <${p.email}>` : p.name;
}

export const sumEffort = (items) => items.reduce((acc, it) => acc + (it.effort || 0), 0);

// Preferências do formulário "Criar" lembradas no navegador.
export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`azdo-board:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`azdo-board:${key}`, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível */
    }
  },
};
