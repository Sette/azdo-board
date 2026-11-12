import Avatar from './Avatar.jsx';
import { BlockedBadge } from './Card.jsx';
import StateLozenge from './StateLozenge.jsx';
import TypeIcon from './TypeIcon.jsx';
import { fmtDateTime, stateCategory } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';

// Lista de itens no estilo da busca do Jira (usada em Itens, Bloqueados e Em validação).
export default function ItemsTable({ rows, meta, onOpen, showSprint = false }) {
  const { t, locale } = useI18n();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-line text-left text-xs font-semibold text-ink-subtle">
          <th className="w-8 py-2" />
          <th className="w-20 py-2">{t('colKey')}</th>
          <th className="py-2">{t('colSummary')}</th>
          {showSprint && <th className="w-28 py-2">{t('colSprint')}</th>}
          <th className="w-40 py-2">{t('colAssignee')}</th>
          <th className="w-32 py-2">{t('colStatus')}</th>
          <th className="w-36 py-2">{t('colUpdated')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-line hover:bg-sunken">
            <td className="py-2">
              <TypeIcon type={r.type} />
            </td>
            <td className="py-2 text-ink-muted">{r.id}</td>
            <td className="max-w-0 py-2 pr-4">
              <span className="flex items-center gap-2">
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
