import { useDraggable } from '@dnd-kit/core';
import Avatar from './Avatar.jsx';
import CopyIdButton from './CopyIdButton.jsx';
import Icon from './Icon.jsx';
import TypeIcon from './TypeIcon.jsx';
import { useI18n } from '../lib/i18n.jsx';

export function BlockedBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] bg-danger-bg px-1.5 py-px text-[11px] font-bold text-danger-ink uppercase">
      <Icon name="flag" size={11} /> {t('blocked')}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const { t } = useI18n();
  if (priority == null) return null;
  const p = Number(priority);
  const tone =
    p === 1
      ? 'text-danger-ink'
      : p === 2
        ? 'text-warn-ink'
        : p === 3
          ? 'text-brand-ink'
          : 'text-ink-muted';
  const name = p >= 1 && p <= 4 ? `priority-${p}` : 'priority-3';
  return (
    <span title={t('priorityValue', { n: p })} className={`inline-flex items-center ${tone}`}>
      <Icon name={name} size={14} />
    </span>
  );
}

export function CardBody({ item, parent, dragging, showValidationBadge = false, planningOptions = [] }) {
  const { t } = useI18n();
  const visibleTags = item.tags.slice(0, 3);
  const extraTags = item.tags.slice(3);

  return (
    <div
      className={`group relative rounded-[3px] bg-surface-overlay p-3 text-left shadow-card transition-shadow duration-150 ${
        item.blocked ? 'border-l-4 border-danger-border' : ''
      } ${dragging ? 'rotate-2 shadow-2xl ring-2 ring-brand/40' : 'hover:bg-hover/60 hover:shadow-card-hover'}`}
    >
      {(item.blocked || (showValidationBadge && item.inValidation)) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {item.blocked && <BlockedBadge />}
          {showValidationBadge && item.inValidation && (
            <span className="inline-flex items-center gap-1 rounded-[3px] bg-brand-subtle px-1.5 py-px text-[11px] font-bold text-brand-ink uppercase">
              <Icon name="check-circle" size={11} /> {t('inValidation')}
            </span>
          )}
        </div>
      )}
      <p className="mb-2 line-clamp-3 text-sm leading-snug">{item.title}</p>
      {parent && <p className="mb-2 truncate text-[11px] text-ink-muted">↳ {parent.title}</p>}
      {visibleTags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => {
            const isPlanning = planningOptions.includes(tag);
            return (
              <span
                key={tag}
                className={`rounded-[3px] px-1.5 text-[11px] ${
                  isPlanning ? 'border border-line bg-sunken font-medium text-ink-subtle' : 'bg-column text-ink-subtle'
                }`}
              >
                {tag}
              </span>
            );
          })}
          {extraTags.length > 0 && (
            <span
              title={t('moreTags', { n: extraTags.length, tags: extraTags.join(', ') })}
              className="rounded-[3px] bg-column px-1.5 text-[11px] font-medium text-ink-muted"
            >
              +{extraTags.length}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <TypeIcon type={item.type} size={14} />
        <CopyIdButton id={item.id} />
        <span className="flex-1" />
        <PriorityBadge priority={item.priority} />
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

export default function Card({ item, parent, onOpen, showValidationBadge, planningOptions }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(item.id), data: { item } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(item.id))}
      className={`cursor-pointer touch-none rounded-[3px] ${isDragging ? 'opacity-30' : ''}`}
    >
      <CardBody item={item} parent={parent} showValidationBadge={showValidationBadge} planningOptions={planningOptions} />
    </div>
  );
}
