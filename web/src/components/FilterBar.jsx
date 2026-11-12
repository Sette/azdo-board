import { useEffect } from 'react';
import Avatar from './Avatar.jsx';
import Dropdown from './Dropdown.jsx';
import Icon from './Icon.jsx';
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

const MAX_AVATARS = 6;

export default function FilterBar({ items, shownCount, filters, setFilters, me, types, children }) {
  const { t, typeLabel } = useI18n();
  const people = new Map();
  let unassigned = false;
  for (const it of items) {
    if (it.assignee) people.set(personKey(it.assignee), it.assignee);
    else unassigned = true;
  }
  const sorted = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const inlinePeople = sorted.slice(0, MAX_AVATARS);
  const overflowPeople = sorted.slice(MAX_AVATARS);
  const selectedOverflow = overflowPeople.filter((p) => filters.people.includes(personKey(p))).length;

  const toggle = (key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const active = Boolean(filters.q || filters.people.length || filters.types.length || filters.mine);

  useEffect(() => {
    if (!me) return undefined;
    const onToggleMine = () => setFilters((f) => ({ ...f, mine: !f.mine }));
    window.addEventListener('azdo:toggle-mine', onToggleMine);
    return () => window.removeEventListener('azdo:toggle-mine', onToggleMine);
  }, [me, setFilters]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <input
          data-page-search="true"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder={t('searchBoard')}
          className="w-56 rounded-[3px] border-2 border-line bg-surface py-1 pr-6 pl-7 text-sm outline-none focus:border-brand"
        />
        <Icon name="search" size={14} className="pointer-events-none absolute top-2 left-2 text-ink-muted" />
        {filters.q && (
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, q: '' }))}
            aria-label={t('clearSearch')}
            className="absolute top-1.5 right-1.5 rounded p-0.5 text-ink-muted hover:bg-hover hover:text-ink"
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div className="flex items-center -space-x-1">
        {inlinePeople.map((p) => {
          const on = filters.people.includes(personKey(p));
          return (
            <button
              key={personKey(p)}
              onClick={() => toggle('people', personKey(p))}
              className={`rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 ${on ? 'z-10 ring-2 ring-brand ring-offset-1 ring-offset-surface' : ''}`}
              title={p.name}
            >
              <Avatar person={p} size={30} ring />
            </button>
          );
        })}
        {overflowPeople.length > 0 && (
          <Dropdown
            multi
            searchable
            width="w-60"
            value={filters.people}
            ariaLabel={t('morePeople', { n: overflowPeople.length })}
            trigger={
              <span
                title={t('morePeople', { n: overflowPeople.length })}
                className={`inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full border-2 border-surface px-1.5 text-xs font-semibold ${
                  selectedOverflow ? 'bg-brand text-white ring-2 ring-brand ring-offset-1 ring-offset-surface' : 'bg-column text-ink-subtle hover:bg-hover'
                }`}
              >
                +{overflowPeople.length}
              </span>
            }
            options={overflowPeople.map((p) => ({
              value: personKey(p),
              label: p.name,
              icon: <Avatar person={p} size={20} />,
            }))}
            onSelect={(k) => toggle('people', k)}
          />
        )}
        {unassigned && (
          <button
            onClick={() => toggle('people', '__none')}
            className={`rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 ${
              filters.people.includes('__none') ? 'z-10 ring-2 ring-brand ring-offset-1 ring-offset-surface' : ''
            }`}
            title={t('unassigned')}
          >
            <Avatar person={null} size={30} ring />
          </button>
        )}
      </div>
      {types?.length > 1 &&
        types.map((type) => (
          <button
            key={type}
            onClick={() => toggle('types', type)}
            className={`rounded-[3px] px-2 py-1 text-sm ${filters.types.includes(type) ? 'bg-brand-subtle font-medium text-brand-ink' : 'hover:bg-hover'}`}
          >
            {typeLabel(type)}
          </button>
        ))}
      {me && (
        <button
          onClick={() => setFilters((f) => ({ ...f, mine: !f.mine }))}
          className={`rounded-[3px] px-2 py-1 text-sm ${filters.mine ? 'bg-brand-subtle font-medium text-brand-ink' : 'hover:bg-hover'}`}
        >
          {t('onlyMine')}
        </button>
      )}
      {active && (
        <>
          {shownCount !== undefined && shownCount !== items.length && (
            <span className="text-xs text-ink-muted">{t('showingCount', { shown: shownCount, total: items.length })}</span>
          )}
          <button onClick={() => setFilters(emptyFilters)} className="rounded-[3px] px-2 py-1 text-sm text-ink-subtle hover:bg-hover">
            {t('clearFilters')}
          </button>
        </>
      )}
      {children}
    </div>
  );
}
