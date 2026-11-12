// Páginas "Bloqueados" e "Em validação": tudo o que está nessa situação, em qualquer sprint.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import FilterBar, { applyFilters, defaultFilters } from '../components/FilterBar.jsx';
import ItemsTable from '../components/ItemsTable.jsx';
import { useItemParam, useMeta } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';

const KINDS = {
  blocked: { queryKey: ['blocked'], fetch: api.blocked, title: 'blockedTitle', hint: 'blockedHint' },
  validation: { queryKey: ['validation'], fetch: api.validation, title: 'validationTitle', hint: 'validationHint' },
};

export default function FlagList({ kind }) {
  const { t } = useI18n();
  const cfg = KINDS[kind];
  const { data: meta } = useMeta();
  const { open } = useItemParam();
  const [filters, setFilters] = useState(defaultFilters);
  const { data: items = [], isLoading, error, isFetching, refetch } = useQuery({ queryKey: cfg.queryKey, queryFn: cfg.fetch });
  const rows = applyFilters(items, filters, meta?.me);
  const types = [...new Set(items.map((i) => i.type))];

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pt-6 pb-4">
        <div className="mb-1 text-sm text-ink-muted">
          {t('projects')} / {meta?.project}
        </div>
        <h1 className="text-2xl font-medium">
          {kind === 'blocked' ? '⚑ ' : ''}
          {t(cfg.title)} <span className="text-base font-normal text-ink-muted">({items.length})</span>
        </h1>
        <p className="mb-4 text-sm text-ink-muted">{t(cfg.hint)}</p>
        <FilterBar items={items} filters={filters} setFilters={setFilters} me={meta?.me} types={types}>
          <span className="flex-1" />
          <button onClick={() => refetch()} className="rounded-[3px] px-2 py-1 text-sm hover:bg-hover" title={t('reload')}>
            {isFetching ? '⟳ …' : '⟳'}
          </button>
        </FilterBar>
      </header>
      <div className="flex-1 overflow-auto px-8 pb-8">
        {error && <div className="mb-3 rounded bg-[#ffebe6] p-3 text-sm text-[#ae2e24]">{error.message}</div>}
        {isLoading ? (
          <p className="text-ink-muted">{t('loading')}</p>
        ) : rows.length ? (
          <ItemsTable rows={rows} meta={meta} onOpen={open} showSprint />
        ) : (
          <p className="py-6 text-center text-ink-muted">{t('noIssues')}</p>
        )}
      </div>
    </div>
  );
}
