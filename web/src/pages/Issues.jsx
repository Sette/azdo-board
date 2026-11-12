import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import ItemsTable from '../components/ItemsTable.jsx';
import TypeIcon from '../components/TypeIcon.jsx';
import { useItemParam, useMeta, usePeople } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';

const ALL_TYPES = ['Product Backlog Item', 'Bug', 'Task', 'Feature', 'Epic'];

export default function Issues() {
  const { t, typeLabel } = useI18n();
  const { data: meta } = useMeta();
  const { data: people = [] } = usePeople();
  const [params, setParams] = useSearchParams();
  const { open } = useItemParam();
  const q = params.get('q') || '';
  const view = params.get('view') || (q ? 'search' : 'mine');
  const types = (params.get('types') || '').split(',').filter(Boolean);
  const states = (params.get('states') || '').split(',').filter(Boolean);
  const assignee = params.get('assignee') || '';
  const showDone = params.get('done') === '1';
  const [draft, setDraft] = useState(q);

  const setParam = (changes) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(changes)) {
        if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) n.delete(k);
        else n.set(k, Array.isArray(v) ? v.join(',') : v);
      }
      return n;
    });

  const query = useQuery({
    queryKey: view === 'mine' ? ['my', showDone] : ['search', q, types, states, assignee],
    queryFn: () => (view === 'mine' ? api.my(showDone) : api.search({ q, types, states, assignee })),
    enabled: view === 'mine' || !!(q || types.length || states.length || assignee),
  });

  let rows = query.data || [];
  if (view === 'mine') {
    if (types.length) rows = rows.filter((r) => types.includes(r.type));
    if (states.length) rows = rows.filter((r) => states.includes(r.state));
  }

  const allStates = [...new Set(Object.values(meta?.states || {}).flat().map((s) => s.name))];
  const toggle = (key, list, v) => setParam({ [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pt-6 pb-4">
        <div className="mb-1 text-sm text-ink-muted">
          {t('projects')} / {meta?.project}
        </div>
        <h1 className="mb-4 text-2xl font-medium">{t('issuesTitle')}</h1>
        <div className="mb-3 flex gap-1 border-b border-line">
          {[
            ['mine', t('tabMine')],
            ['search', t('tabSearch')],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setParam({ view: k })}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === k ? 'border-brand font-medium text-brand' : 'border-transparent text-ink-subtle hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {view === 'search' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParam({ q: draft.trim() });
              }}
              className="flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('textOrId')}
                className="w-72 rounded-[3px] border-2 border-line px-2 py-1 text-sm outline-none focus:border-brand"
              />
              <button className="rounded-[3px] bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-hover">{t('search')}</button>
            </form>
          )}
          <div className="flex flex-wrap gap-1">
            {ALL_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggle('types', types, type)}
                className={`flex items-center gap-1 rounded-[3px] px-2 py-1 text-sm ${types.includes(type) ? 'bg-brand-subtle text-brand' : 'hover:bg-hover'}`}
              >
                <TypeIcon type={type} size={14} /> {typeLabel(type)}
              </button>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => e.target.value && toggle('states', states, e.target.value)}
            className="rounded-[3px] border-2 border-line px-2 py-1 text-sm"
            aria-label={t('state')}
          >
            <option value="">
              {t('state')}
              {states.length ? `: ${states.join(', ')}` : ''}
            </option>
            {allStates.map((s) => (
              <option key={s} value={s}>
                {states.includes(s) ? '✓ ' : ''}
                {s}
              </option>
            ))}
          </select>
          {view === 'search' && (
            <select value={assignee} onChange={(e) => setParam({ assignee: e.target.value })} className="rounded-[3px] border-2 border-line px-2 py-1 text-sm" aria-label={t('assignee')}>
              <option value="">{t('anyAssignee')}</option>
              {people.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {view === 'mine' && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showDone} onChange={(e) => setParam({ done: e.target.checked ? '1' : '' })} /> {t('includeDone')}
            </label>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-auto px-8 pb-8">
        {query.error && <div className="mb-3 rounded bg-[#ffebe6] p-3 text-sm text-[#ae2e24]">{query.error.message}</div>}
        {query.isLoading && query.fetchStatus !== 'idle' ? (
          <p className="text-ink-muted">{t('searching')}</p>
        ) : view === 'search' && !query.data ? (
          <p className="text-ink-muted">{t('typeSomething')}</p>
        ) : (
          <ItemsTable rows={rows} meta={meta} onOpen={open} />
        )}
        {query.data && !rows.length && <p className="py-6 text-center text-ink-muted">{t('noIssues')}</p>}
      </div>
    </div>
  );
}
