// Páginas "Bloqueados" e "Em validação": tudo o que está nessa situação, em qualquer sprint.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import EmptyState from '../components/EmptyState.jsx';
import FilterBar, { applyFilters, defaultFilters, emptyFilters } from '../components/FilterBar.jsx';
import Icon from '../components/Icon.jsx';
import ItemsTable from '../components/ItemsTable.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { useItemParam, useMeta } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';

const KINDS = {
  blocked: { queryKey: ['blocked'], fetch: api.blocked, title: 'blockedTitle', hint: 'blockedHint', emptyKey: 'noBlockedEmpty' },
  validation: { queryKey: ['validation'], fetch: api.validation, title: 'validationTitle', hint: 'validationHint', emptyKey: 'noValidationEmpty' },
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
  const hasActiveFilters = Boolean(filters.q || filters.people.length || filters.types.length || filters.mine);

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pt-6 pb-4">
        <div className="mb-1 text-sm text-ink-muted">
          {t('projects')} / {meta?.project}
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-medium">
          {kind === 'blocked' ? <Icon name="flag" size={20} className="text-danger-ink" /> : <Icon name="check-circle" size={20} className="text-brand-ink" />}
          {t(cfg.title)} <span className="text-base font-normal text-ink-muted">({items.length})</span>
        </h1>
        <p className="mb-4 text-sm text-ink-muted">{t(cfg.hint)}</p>
        <FilterBar items={items} shownCount={rows.length} filters={filters} setFilters={setFilters} me={meta?.me} types={types}>
          <span className="flex-1" />
          <button onClick={() => refetch()} className="rounded-[3px] p-1.5 text-ink-subtle hover:bg-hover hover:text-ink" title={t('reload')} aria-label={t('reload')}>
            <Icon name="refresh" size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </FilterBar>
      </header>
      <div className="flex-1 overflow-auto px-8 pb-8">
        {error && <div className="mb-3 rounded bg-danger-bg p-3 text-sm text-danger-ink">{error.message}</div>}
        {isLoading ? (
          <TableSkeleton rows={5} />
        ) : rows.length ? (
          <ItemsTable rows={rows} meta={meta} onOpen={open} showSprint />
        ) : hasActiveFilters && items.length > 0 ? (
          <EmptyState
            icon="filter-off"
            tone="filtered"
            title={t('noItemsFilters')}
            hint={filters.mine ? t('onlyMineHint') : undefined}
            actionLabel={t('clearFilters')}
            onAction={() => setFilters(emptyFilters)}
          />
        ) : (
          <EmptyState icon="check-circle" tone="success" title={t(cfg.emptyKey)} />
        )}
      </div>
    </div>
  );
}
