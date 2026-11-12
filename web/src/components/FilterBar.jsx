import Avatar from './Avatar.jsx';
import { personKey } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';

// Filtros no estilo Jira: busca, avatares das pessoas, tipos e "Só meus".
export function applyFilters(items, f, me) {
  const q = f.q.trim().toLowerCase();
  return items.filter((it) => {
    if (q && !`${it.id} ${it.title} ${it.tags.join(' ')}`.toLowerCase().includes(q)) return false;
    if (f.people.length && !f.people.includes(personKey(it.assignee) || '__none')) return false;
    if (f.types.length && !f.types.includes(it.type)) return false;
    if (f.mine && me && it.assignee?.email?.toLowerCase() !== me.toLowerCase()) return false;
    return true;
  });
}

export const emptyFilters = { q: '', people: [], types: [], mine: false };
// Pages start with "only my issues" on; "clear filters" goes back to emptyFilters.
export const defaultFilters = { ...emptyFilters, mine: true };

export default function FilterBar({ items, filters, setFilters, me, types, children }) {
  const { t, typeLabel } = useI18n();
  const people = new Map();
  let unassigned = false;
  for (const it of items) {
    if (it.assignee) people.set(personKey(it.assignee), it.assignee);
    else unassigned = true;
  }
  const sorted = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const toggle = (key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const active = filters.q || filters.people.length || filters.types.length || filters.mine;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder={t('searchBoard')}
          className="w-56 rounded-[3px] border-2 border-line py-1 pr-2 pl-7 text-sm outline-none focus:border-brand"
        />
        <span className="pointer-events-none absolute top-1.5 left-2 text-ink-muted">⌕</span>
      </div>
      <div className="flex items-center -space-x-1">
        {sorted.map((p) => {
          const on = filters.people.includes(personKey(p));
          return (
            <button
              key={personKey(p)}
              onClick={() => toggle('people', personKey(p))}
              className={`rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 ${on ? 'z-10 ring-2 ring-brand ring-offset-1' : ''}`}
              title={p.name}
            >
              <Avatar person={p} size={30} ring />
            </button>
          );
        })}
        {unassigned && (
          <button
            onClick={() => toggle('people', '__none')}
            className={`rounded-full ${filters.people.includes('__none') ? 'z-10 ring-2 ring-brand ring-offset-1' : ''}`}
            title={t('unassigned')}
          >
            <Avatar person={null} size={30} />
          </button>
        )}
      </div>
      {types?.length > 1 &&
        types.map((type) => (
          <button
            key={type}
            onClick={() => toggle('types', type)}
            className={`rounded-[3px] px-2 py-1 text-sm ${filters.types.includes(type) ? 'bg-brand-subtle text-brand' : 'hover:bg-hover'}`}
          >
            {typeLabel(type)}
          </button>
        ))}
      {me && (
        <button
          onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
          className={`rounded-[3px] px-2 py-1 text-sm ${filters.mine ? 'bg-brand-subtle text-brand' : 'hover:bg-hover'}`}
        >
          {t('onlyMine')}
        </button>
      )}
      {active ? (
        <button onClick={() => setFilters(emptyFilters)} className="rounded-[3px] px-2 py-1 text-sm text-ink-subtle hover:bg-hover">
          {t('clearFilters')}
        </button>
      ) : null}
      {children}
    </div>
  );
}
