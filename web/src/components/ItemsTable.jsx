import { useMemo, useState } from 'react';
import Avatar from './Avatar.jsx';
import { BlockedBadge, PriorityBadge } from './Card.jsx';
import Icon from './Icon.jsx';
import StateLozenge from './StateLozenge.jsx';
import TypeIcon from './TypeIcon.jsx';
import { fmtDateTime, stateCategory } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';

function compareValues(a, b, key, locale) {
  switch (key) {
    case 'id':
      return (a.id || 0) - (b.id || 0);
    case 'title':
      return String(a.title || '').localeCompare(String(b.title || ''), locale);
    case 'sprint':
      return String(a.sprint || '').localeCompare(String(b.sprint || ''), locale);
    case 'assignee':
      return String(a.assignee?.name || '\uffff').localeCompare(String(b.assignee?.name || '\uffff'), locale);
    case 'state':
      return String(a.state || '').localeCompare(String(b.state || ''), locale);
    case 'updated':
    default:
      return String(a.changedDate || '').localeCompare(String(b.changedDate || ''));
  }
}

// Lista de itens no estilo da busca do Jira (usada em Itens, Bloqueados e Em validação), com colunas ordenáveis.
export default function ItemsTable({ rows, meta, onOpen, showSprint = false }) {
  const { t, locale } = useI18n();
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const toggleSort = (key) =>
    setSort((cur) => (cur.key !== key ? { key, dir: key === 'updated' ? 'desc' : 'asc' } : { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }));

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => factor * compareValues(a, b, sort.key, locale));
  }, [rows, sort, locale]);

  const th = (key, label, widthCls = '') => {
    const active = sort.key === key;
    return (
      <th
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`sticky top-0 z-10 border-b-2 border-line bg-surface py-2 ${widthCls}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold hover:bg-hover ${
            active ? 'text-brand-ink' : 'text-ink-subtle'
          }`}
        >
          {label}
          {active && <Icon name={sort.dir === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} />}
        </button>
      </th>
    );
  };

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-left">
          <th className="sticky top-0 z-10 w-8 border-b-2 border-line bg-surface py-2" />
          {th('id', t('colKey'), 'w-20')}
          {th('title', t('colSummary'))}
          {showSprint && th('sprint', t('colSprint'), 'w-32')}
          {th('assignee', t('colAssignee'), 'w-44')}
          {th('state', t('colStatus'), 'w-32')}
          {th('updated', t('colUpdated'), 'w-36')}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((r) => (
          <tr
            key={r.id}
            tabIndex={0}
            onClick={() => onOpen(r.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(r.id))}
            className="cursor-pointer border-b border-line hover:bg-sunken"
          >
            <td className="py-2 pl-1">
              <TypeIcon type={r.type} />
            </td>
            <td className="py-2 font-medium text-ink-muted">{r.id}</td>
            <td className="max-w-0 py-2 pr-4">
              <span className="flex items-center gap-2">
                {r.priority != null && <PriorityBadge priority={r.priority} />}
                {r.blocked && <BlockedBadge />}
                <span className="truncate">{r.title}</span>
              </span>
            </td>
            {showSprint && <td className="truncate py-2 text-ink-muted">{r.sprint || 'Backlog'}</td>}
            <td className="py-2">
              <span className="flex items-center gap-2">
                <Avatar person={r.assignee} size={20} />
                <span className="truncate">{r.assignee?.name || t('unassigned')}</span>
              </span>
            </td>
            <td className="py-2">
              <StateLozenge state={r.state} category={stateCategory(meta, r.type, r.state)} />
            </td>
            <td className="py-2 text-ink-muted">{fmtDateTime(r.changedDate, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
