import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useOpenCreate } from '../components/CreateModal.jsx';
import FilterBar, { applyFilters, defaultFilters } from '../components/FilterBar.jsx';
import StateLozenge from '../components/StateLozenge.jsx';
import TypeIcon from '../components/TypeIcon.jsx';
import { fmtDate, stateCategory, sumEffort } from '../lib/format.js';
import { useItemParam, useMeta } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { BlockedBadge } from '../components/Card.jsx';
import { useSaveItem } from '../components/SaveItem.jsx';

function Row({ item, meta, onOpen, overlay }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(item.id), data: { item }, disabled: overlay });
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={() => onOpen?.(item.id)}
      className={`flex cursor-pointer touch-none items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm last:border-b-0 hover:bg-sunken ${isDragging ? 'opacity-30' : ''} ${overlay ? 'rounded shadow-xl' : ''}`}
    >
      <TypeIcon type={item.type} size={16} />
      <span className="w-16 shrink-0 text-ink-muted">{item.id}</span>
      {item.blocked && <BlockedBadge />}
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <span className="hidden max-w-60 shrink-0 gap-1 overflow-hidden md:flex">
        {item.tags.slice(0, 3).map((t) => (
          <span key={t} className="truncate rounded-[3px] bg-column px-1.5 text-[11px] text-ink-subtle">
            {t}
          </span>
        ))}
      </span>
      <StateLozenge state={item.state} category={stateCategory(meta, item.type, item.state)} className="w-28 shrink-0 justify-center" />
      <span className="w-8 shrink-0 text-center">
        {item.effort != null && <span className="rounded-full bg-column px-1.5 text-xs font-semibold text-ink-subtle">{item.effort}</span>}
      </span>
      <Avatar person={item.assignee} size={24} />
    </div>
  );
}

function Section({ section, meta, onOpen, onCreate }) {
  const { t, locale } = useI18n();
  const [collapsed, setCollapsed] = useState(section.kind === 'past');
  const { setNodeRef, isOver } = useDroppable({ id: section.path });
  const pts = sumEffort(section.items);
  return (
    <section ref={setNodeRef} className={`mb-4 rounded-md p-2 transition-colors ${isOver ? 'bg-brand-subtle' : 'bg-column'}`}>
      <div className="flex items-center gap-2 px-1 pb-2">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-left">
          <span className="w-3 text-ink-muted">{collapsed ? '▸' : '▾'}</span>
          <span className="font-semibold">{section.title}</span>
        </button>
        {section.sprint && (
          <span className="text-xs text-ink-muted">
            {fmtDate(section.sprint.startDate, locale)} – {fmtDate(section.sprint.finishDate, locale)}
          </span>
        )}
        <span className="text-xs text-ink-muted">{t('itemsCount', { n: section.items.length })}</span>
        {section.kind === 'current' && <span className="rounded-[3px] bg-[#e3fcef] px-1.5 text-[11px] font-bold text-[#006644] uppercase">{t('active')}</span>}
        {section.kind === 'past' && <span className="rounded-[3px] bg-[#fff7d6] px-1.5 text-[11px] font-bold text-[#7f5f01] uppercase">{t('closedWithOpen')}</span>}
        <span className="flex-1" />
        {pts > 0 && <span className="rounded-full bg-surface px-2 text-xs font-semibold text-ink-subtle">{t('pts', { n: pts })}</span>}
      </div>
      {!collapsed && (
        <>
          <div className="overflow-hidden rounded border border-line">
            {section.items.map((it) => (
              <Row key={it.id} item={it} meta={meta} onOpen={onOpen} />
            ))}
            {!section.items.length && <div className="bg-surface px-3 py-4 text-center text-sm text-ink-muted">{t('dragHere')}</div>}
          </div>
          <button onClick={() => onCreate(section.path)} className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-ink-subtle hover:bg-hover">
            {t('createItem')}
          </button>
        </>
      )}
    </section>
  );
}

export default function Backlog() {
  const { t } = useI18n();
  const { data: meta } = useMeta();
  const { data: items = [], isLoading, error, isFetching, refetch } = useQuery({ queryKey: ['backlog'], queryFn: api.backlog });
  const [filters, setFilters] = useState(defaultFilters);
  const [dragging, setDragging] = useState(null);
  const { open } = useItemParam();
  const openCreate = useOpenCreate();
  const { save } = useSaveItem();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const visible = applyFilters(items, filters, meta?.me);

  // Seções: sprint atual, futuras, encerradas com itens abertos e, por fim, o backlog sem sprint.
  const sections = useMemo(() => {
    if (!meta) return [];
    const byPath = new Map();
    for (const it of visible) {
      const k = it.sprint ? it.iterationPath : meta.project;
      if (!byPath.has(k)) byPath.set(k, []);
      byPath.get(k).push(it);
    }
    const out = [];
    const current = meta.sprints.find((s) => s.id === meta.currentSprintId);
    if (current) out.push({ kind: 'current', path: current.path, title: current.name, sprint: current, items: byPath.get(current.path) || [] });
    for (const s of meta.sprints.filter((x) => x.timeFrame === 2)) {
      out.push({ kind: 'future', path: s.path, title: s.name, sprint: s, items: byPath.get(s.path) || [] });
    }
    for (const s of [...meta.sprints.filter((x) => x.timeFrame === 0)].reverse()) {
      if (byPath.get(s.path)?.length) out.push({ kind: 'past', path: s.path, title: s.name, sprint: s, items: byPath.get(s.path) });
    }
    const known = new Set(out.map((s) => s.path));
    for (const [path, list] of byPath) {
      if (path !== meta.project && !known.has(path)) out.push({ kind: 'past', path, title: list[0].sprint, items: list });
    }
    out.push({ kind: 'backlog', path: meta.project, title: 'Backlog', items: byPath.get(meta.project) || [] });
    return out;
  }, [visible, meta]);

  function onDragEnd({ active, over }) {
    setDragging(null);
    if (!over) return;
    const item = active.data.current.item;
    const iterationPath = String(over.id);
    const currentPath = item.sprint ? item.iterationPath : meta.project;
    if (iterationPath === currentPath) return;
    const sprint = iterationPath === meta.project ? null : iterationPath.split('\\').pop();
    save(item, { iterationPath }, { iterationPath, sprint });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pt-6 pb-4">
        <div className="mb-1 text-sm text-ink-muted">
          {t('projects')} / {meta?.project}
        </div>
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-medium">{t('backlogTitle')}</h1>
          <span className="flex-1" />
          <button onClick={() => openCreate({ iterationPath: meta?.project })} className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
            {t('create')}
          </button>
        </div>
        <FilterBar items={items} filters={filters} setFilters={setFilters} me={meta?.me} types={['Product Backlog Item', 'Bug']}>
          <span className="flex-1" />
          <button onClick={() => refetch()} className="rounded-[3px] px-2 py-1 text-sm hover:bg-hover" title={t('reload')}>
            {isFetching ? '⟳ …' : '⟳'}
          </button>
        </FilterBar>
      </header>
      {error && <div className="mx-8 rounded bg-[#ffebe6] p-3 text-sm text-[#ae2e24]">{error.message}</div>}
      {isLoading ? (
        <div className="px-8 text-ink-muted">{t('loadingBacklog')}</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={({ active }) => setDragging(active.data.current.item)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex-1 overflow-auto px-8 pb-8">
            {sections.map((s) => (
              <Section key={s.path} section={s} meta={meta} onOpen={open} onCreate={(iterationPath) => openCreate({ iterationPath })} />
            ))}
          </div>
          <DragOverlay>{dragging ? <Row item={dragging} meta={meta} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
