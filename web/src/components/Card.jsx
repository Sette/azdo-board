import { useDraggable } from '@dnd-kit/core';
import Avatar from './Avatar.jsx';
import TypeIcon from './TypeIcon.jsx';
import { useI18n } from '../lib/i18n.jsx';

export function BlockedBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#ffebe6] px-1.5 text-[11px] font-bold text-[#ae2e24] uppercase">
      ⚑ {t('blocked')}
    </span>
  );
}

export function CardBody({ item, parent, dragging }) {
  return (
    <div
      className={`rounded-[3px] bg-surface p-3 text-left shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f] ${item.blocked ? 'border-l-4 border-[#e2483d]' : ''} ${dragging ? 'rotate-2 shadow-xl' : 'hover:bg-sunken'}`}
    >
      {item.blocked && (
        <div className="mb-1.5">
          <BlockedBadge />
        </div>
      )}
      <p className="mb-2 line-clamp-3 text-sm">{item.title}</p>
      {parent && <p className="mb-2 truncate text-[11px] text-ink-muted">↳ {parent.title}</p>}
      {item.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-[3px] bg-column px-1.5 text-[11px] text-ink-subtle">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <TypeIcon type={item.type} size={14} />
        <span className="text-xs font-medium text-ink-muted">{item.id}</span>
        <span className="flex-1" />
        {item.type === 'Task'
          ? (item.completedWork != null || item.remainingWork != null) && (
              <span className="rounded-full bg-column px-1.5 text-[11px] font-semibold text-ink-subtle" title="Completed Work / Remaining Work">
                {item.completedWork ?? 0}h{item.remainingWork != null ? ` / ${item.remainingWork}h` : ''}
              </span>
            )
          : item.effort != null && (
              <span className="rounded-full bg-column px-1.5 text-[11px] font-semibold text-ink-subtle" title="Effort">
                {item.effort}
              </span>
            )}
        <Avatar person={item.assignee} size={22} />
      </div>
    </div>
  );
}

export default function Card({ item, parent, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(item.id), data: { item } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(item.id)}
      className={`cursor-pointer touch-none ${isDragging ? 'opacity-30' : ''}`}
    >
      <CardBody item={item} parent={parent} />
    </div>
  );
}
