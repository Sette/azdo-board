import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Card, { CardBody } from '../components/Card.jsx';
import CopyIdButton from '../components/CopyIdButton.jsx';
import { useOpenCreate } from '../components/CreateModal.jsx';
import Dropdown from '../components/Dropdown.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FilterBar, { applyFilters, defaultFilters, emptyFilters } from '../components/FilterBar.jsx';
import Icon from '../components/Icon.jsx';
import { useSaveItem } from '../components/SaveItem.jsx';
import { BoardSkeleton } from '../components/Skeleton.jsx';
import StateLozenge from '../components/StateLozenge.jsx';
import TypeIcon from '../components/TypeIcon.jsx';
import { fmtDate, personKey, prefs, stateCategory, sumEffort } from '../lib/format.js';
import { useItemParam, useMeta } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';

const MODES = {
  items: { labelKey: 'modeItems', types: ['Product Backlog Item', 'Bug'], statesOf: 'Product Backlog Item' },
  tasks: { labelKey: 'modeTasks', types: ['Task'], statesOf: 'Task' },
};

const BLOCKED = '__blocked';
const VALIDATION = '__validation';

function categoryDot(category, kind) {
  if (kind === 'blocked') return 'bg-danger-border';
  if (category === 'Completed') return 'bg-success-solid';
  if (category === 'InProgress') return 'bg-brand';
  return 'bg-ink-muted/60';
}

function Column({ id, label, items, renderCard, minimized, onExpand, tone }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-24 flex-col gap-1.5 rounded-md p-1.5 transition-shadow ${
        isOver ? 'bg-brand-subtle ring-2 ring-brand/40' : tone === 'blocked' ? 'bg-danger-column' : 'bg-column'
      }`}
      aria-label={label}
    >
      {minimized && items.length > 0 ? (
        <button onClick={onExpand} className="rounded-[3px] border border-dashed border-line px-3 py-3 text-center text-xs text-ink-muted hover:bg-hover">
          {t('doneCount', { n: items.length })} · {t('show')}
        </button>
      ) : (
        items.map(renderCard)
      )}
    </div>
  );
}

export default function Board() {
  const { t, locale } = useI18n();
  const { data: meta } = useMeta();
  const [params, setParams] = useSearchParams();
  const sprintId = params.get('sprint') || meta?.currentSprintId;
  const mode = MODES[params.get('mode')] ? params.get('mode') : prefs.get('boardMode', 'items');
  const groupBy = params.get('group') || prefs.get(`boardGroup:${mode}`, mode === 'tasks' ? 'parent' : 'none');
  const [filters, setFilters] = useState(defaultFilters);
  const [dragging, setDragging] = useState(null);
  // Escolha manual da pessoa; sem ela, raia de PBI concluído começa recolhida.
  const [collapsedLanes, setCollapsedLanes] = useState({});
  const [showDone, setShowDone] = useState(() => prefs.get('boardShowDone', false));
  const toggleShowDone = () =>
    setShowDone((v) => {
      prefs.set('boardShowDone', !v);
      return !v;
    });
  const parentDone = (lane) => !!lane.parent && stateCategory(meta, lane.parent.type, lane.parent.state) === 'Completed';
  const isCollapsed = (lane) => collapsedLanes[lane.key] ?? parentDone(lane);
  const { open } = useItemParam();
  const openCreate = useOpenCreate();
  const { save } = useSaveItem();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: all = [], isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['sprint', sprintId],
    queryFn: () => api.sprintItems(sprintId),
    enabled: !!sprintId,
  });

  const sprint = meta?.sprints.find((s) => s.id === sprintId);
  const cfg = MODES[mode];
  const validationStates = meta?.validation?.states || [];
  const tagState = meta?.validation?.tagState?.[cfg.statesOf];
  const planningOptions = meta?.planning?.options || [];

  // Tasks mode follows the team's sprint board (taskboard) columns when the team customized them.
  const board = mode === 'tasks' ? meta?.taskboard : null;
  const blockedColumn = meta?.blocked?.column;

  // Colunas: estados do tipo + Validation (virtual, quando o tipo não tem estado de validação) + Blocked.
  const columns = useMemo(() => {
    if (board) {
      const cols = board.map((c) => ({
        id: c.name,
        label: c.name,
        state: c.mappings.Task,
        category: stateCategory(meta, 'Task', c.mappings.Task),
        kind: c.name === blockedColumn ? 'blocked' : c.name === meta?.validation?.column ? 'validation' : 'state',
      }));
      if (!cols.some((c) => c.kind === 'blocked')) {
        const firstDone = cols.findIndex((c) => c.category === 'Completed');
        cols.splice(firstDone < 0 ? cols.length : firstDone, 0, { id: BLOCKED, label: t('colBlocked'), category: 'Blocked', kind: 'blocked' });
      }
      return cols;
    }
    const states = (meta?.states?.[cfg.statesOf] || []).filter((s) => s.category !== 'Removed');
    const cols = states.map((s) => ({
      id: s.name,
      label: s.name,
      category: s.category,
      kind: validationStates.includes(s.name) ? 'validation' : 'state',
    }));
    const hasValidationState = states.some((s) => validationStates.includes(s.name));
    const firstDone = Math.max(0, cols.findIndex((c) => c.category === 'Completed'));
    const extra = [];
    if (tagState && !hasValidationState) extra.push({ id: VALIDATION, label: t('colValidation'), category: 'InProgress', kind: 'validation' });
    extra.push({ id: BLOCKED, label: t('colBlocked'), category: 'Blocked', kind: 'blocked' });
    cols.splice(firstDone === 0 && !cols.some((c) => c.category === 'Completed') ? cols.length : firstDone, 0, ...extra);
    return cols;
  }, [meta, board, blockedColumn, cfg.statesOf, validationStates, tagState, t]);
  const hasVirtualValidation = columns.some((c) => c.id === VALIDATION);
  const hasVirtualBlocked = columns.some((c) => c.id === BLOCKED);

  const columnOf = (it) => {
    if (board) {
      if (it.blocked && hasVirtualBlocked) return BLOCKED;
      if (it.blocked && blockedColumn && columns.some((c) => c.id === blockedColumn)) return blockedColumn;
      if (it.column && columns.some((c) => c.id === it.column)) return it.column;
      return columns.find((c) => c.state === it.state)?.id ?? it.state;
    }
    return it.blocked ? BLOCKED : hasVirtualValidation && it.inValidation ? VALIDATION : it.state;
  };

  const byId = useMemo(() => new Map(all.map((it) => [it.id, it])), [all]);
  const modeItems = all.filter((it) => cfg.types.includes(it.type) && it.state !== 'Removed');
  const visible = applyFilters(modeItems, filters, meta?.me);

  const lanes = useMemo(() => {
    if (groupBy === 'assignee') {
      const m = new Map();
      for (const it of visible) {
        const k = personKey(it.assignee) || '__none';
        if (!m.has(k)) m.set(k, { key: k, person: it.assignee, title: it.assignee?.name || t('unassigned'), items: [] });
        m.get(k).items.push(it);
      }
      return [...m.values()].sort((a, b) => (a.key === '__none' ? 1 : b.key === '__none' ? -1 : a.title.localeCompare(b.title, locale)));
    }
    if (groupBy === 'parent') {
      const m = new Map();
      for (const it of visible) {
        const k = it.parentId ? String(it.parentId) : '__none';
        if (!m.has(k)) {
          const p = byId.get(it.parentId);
          m.set(k, { key: k, parent: p, title: p ? p.title : it.parentId ? `#${it.parentId}` : t('noParent'), items: [] });
        }
        m.get(k).items.push(it);
      }
      return [...m.values()].sort((a, b) => (a.key === '__none' ? 1 : b.key === '__none' ? -1 : (a.parent?.backlogPriority ?? 0) - (b.parent?.backlogPriority ?? 0)));
    }
    return [{ key: 'all', items: visible }];
  }, [visible, groupBy, byId, t, locale]);

  const anyExpanded = groupBy !== 'none' && lanes.some((l) => !isCollapsed(l));
  const toggleAllLanes = () => {
    const collapse = anyExpanded;
    setCollapsedLanes(Object.fromEntries(lanes.map((l) => [l.key, collapse])));
  };

  const setParam = (k, v, prefKey) => {
    if (prefKey) prefs.set(prefKey, v);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set(k, v);
      return n;
    });
  };

  function onDragEnd({ active, over }) {
    setDragging(null);
    if (!over) return;
    const item = active.data.current.item;
    const target = String(over.id).split('::')[1];
    if (!target || target === columnOf(item)) return;
    const col = board && columns.find((c) => c.id === target);
    if (col?.state) {
      const toBlocked = col.kind === 'blocked';
      const changes = { column: col.id };
      if (col.state !== item.state) changes.state = col.state;
      if (toBlocked && !item.blocked) changes.blocked = true;
      if (!toBlocked && item.blocked) changes.blocked = false;
      save(item, changes, { column: col.id, state: col.state, blocked: toBlocked, inValidation: col.id === meta?.validation?.column });
      return;
    }
    if (target === BLOCKED) {
      save(item, { blocked: true }, { blocked: true });
      return;
    }
    if (target === VALIDATION) {
      const changes = { validation: true, ...(item.blocked ? { blocked: false } : {}) };
      save(item, changes, { inValidation: true, blocked: false, state: tagState || item.state });
      return;
    }
    // Coluna de estado: muda o estado e tira bloqueio/validação virtual, se houver.
    const changes = {};
    if (target !== item.state) changes.state = target;
    if (item.blocked) changes.blocked = false;
    if (hasVirtualValidation && item.inValidation) changes.validation = false;
    save(item, changes, { state: target, blocked: false, inValidation: validationStates.includes(target) });
  }

  const renderCard = (it) => {
    const col = columns.find((c) => c.id === columnOf(it));
    return (
      <Card
        key={it.id}
        item={it}
        parent={groupBy !== 'parent' && mode === 'tasks' ? byId.get(it.parentId) : null}
        onOpen={open}
        showValidationBadge={col?.kind !== 'validation'}
        planningOptions={planningOptions}
      />
    );
  };

  const daysLeft = sprint?.finishDate ? Math.ceil((new Date(sprint.finishDate) - new Date()) / 86_400_000) : null;
  const grid = { gridTemplateColumns: `repeat(${columns.length}, 272px)` };

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pt-6 pb-4">
        <div className="mb-1 text-sm text-ink-muted">
          {t('projects')} / {meta?.project}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium">{t('boardTitle', { sprint: sprint?.name || '' })}</h1>
          {sprint && (
            <span className="text-sm text-ink-muted">
              {fmtDate(sprint.startDate, locale)} – {fmtDate(sprint.finishDate, locale)}
              {daysLeft !== null && sprint.timeFrame === 1 && ` · ${daysLeft > 0 ? t('daysLeft', { n: daysLeft }) : t('endsToday')}`}
            </span>
          )}
          <span className="flex-1" />
          <Dropdown
            variant="control"
            align="right"
            width="w-60"
            value={sprintId || ''}
            ariaLabel={t('sprint')}
            options={[...(meta?.sprints || [])].reverse().map((s) => ({
              value: s.id,
              label: `${s.name}${s.timeFrame === 1 ? ` (${t('current')})` : ''}`,
              badge: s.timeFrame === 1 ? <span className="rounded-[3px] bg-success-bg px-1.5 text-[10px] font-bold text-success-ink uppercase">{t('active')}</span> : null,
            }))}
            onSelect={(id) => setParam('sprint', id)}
          />
        </div>
        <FilterBar items={modeItems} shownCount={visible.length} filters={filters} setFilters={setFilters} me={meta?.me} types={cfg.types}>
          <span className="flex-1" />
          <div className="flex rounded-[3px] bg-column p-0.5 text-sm">
            {Object.entries(MODES).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setParam('mode', k, 'boardMode')}
                className={`rounded-[3px] px-2.5 py-1 ${mode === k ? 'bg-surface font-medium shadow-sm' : 'text-ink-subtle hover:text-ink'}`}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-ink-subtle">
            <span>{t('groupBy')}</span>
            <Dropdown
              variant="control"
              align="right"
              width="w-44"
              value={groupBy}
              ariaLabel={t('groupBy')}
              options={[
                { value: 'none', label: t('groupNone') },
                { value: 'assignee', label: t('groupAssignee') },
                ...(mode === 'tasks' ? [{ value: 'parent', label: t('groupParent') }] : []),
              ]}
              onSelect={(v) => setParam('group', v, `boardGroup:${mode}`)}
            />
          </div>
          {groupBy !== 'none' && lanes.length > 1 && (
            <button onClick={toggleAllLanes} className="rounded-[3px] px-2 py-1 text-xs font-medium text-ink-subtle hover:bg-hover hover:text-ink">
              {anyExpanded ? t('collapseAll') : t('expandAll')}
            </button>
          )}
          <button onClick={() => refetch()} className="rounded-[3px] p-1.5 text-ink-subtle hover:bg-hover hover:text-ink" title={t('reload')} aria-label={t('reload')}>
            <Icon name="refresh" size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </FilterBar>
      </header>

      {error && <div className="mx-8 rounded bg-danger-bg p-3 text-sm text-danger-ink">{error.message}</div>}
      {isLoading ? (
        <BoardSkeleton />
      ) : (
        <DndContext sensors={sensors} onDragStart={({ active }) => setDragging(active.data.current.item)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex-1 overflow-auto px-8 pb-8">
            <div className="min-w-max">
              <div className="sticky top-0 z-10 grid gap-2 bg-surface pb-1.5" style={grid}>
                {columns.map((c) => {
                  const n = visible.filter((it) => columnOf(it) === c.id);
                  const pts = mode === 'items' ? sumEffort(n) : 0;
                  const doneHours = mode === 'tasks' ? Math.round(n.reduce((a, x) => a + (x.completedWork || 0), 0) * 10) / 10 : 0;
                  const leftHours = mode === 'tasks' ? Math.round(n.reduce((a, x) => a + (x.remainingWork || 0), 0) * 10) / 10 : 0;
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-semibold tracking-wide uppercase ${
                        c.kind === 'blocked' ? 'bg-danger-column text-danger-ink' : 'bg-column text-ink-subtle'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        {c.kind === 'blocked' ? (
                          <Icon name="flag" size={12} />
                        ) : (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${categoryDot(c.category, c.kind)}`} />
                        )}
                        <span className="truncate">{c.label}</span>
                        <span className="rounded-full bg-surface px-1.5 py-px text-[11px] font-semibold text-ink-subtle">{n.length}</span>
                        {mode === 'items' && c.category === 'Completed' && n.length > 0 && (
                          <button onClick={toggleShowDone} className="ml-1 font-normal normal-case text-brand-ink hover:underline">
                            {showDone ? t('hide') : t('show')}
                          </button>
                        )}
                      </div>
                      {mode === 'items' && pts > 0 && <span className="shrink-0 font-normal normal-case text-ink-muted">{t('pts', { n: pts })}</span>}
                      {mode === 'tasks' && (doneHours > 0 || leftHours > 0) && (
                        <span className="shrink-0 font-normal normal-case text-ink-muted">
                          {leftHours > 0 ? t('hoursSummary', { done: doneHours, left: leftHours }) : `${doneHours}h`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {lanes.map((lane) => {
                const laneDoneTasks = lane.items.filter((it) => stateCategory(meta, it.type, it.state) === 'Completed').length;
                return (
                  <div key={lane.key} className="mb-3">
                    {groupBy !== 'none' && (
                      <div className="mb-1.5 flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-hover">
                        <button
                          type="button"
                          onClick={() => setCollapsedLanes((c) => ({ ...c, [lane.key]: !isCollapsed(lane) }))}
                          className="flex items-center gap-1.5 text-left"
                        >
                          <Icon name={isCollapsed(lane) ? 'chevron-right' : 'chevron-down'} size={14} className="text-ink-muted" />
                          {lane.parent && <TypeIcon type={lane.parent.type} size={14} />}
                          {groupBy === 'assignee' && <Avatar person={lane.person} size={20} />}
                        </button>
                        {lane.parent && <CopyIdButton id={lane.parent.id} />}
                        <button
                          type="button"
                          onClick={() => setCollapsedLanes((c) => ({ ...c, [lane.key]: !isCollapsed(lane) }))}
                          className="flex min-w-0 items-center gap-2 text-left"
                        >
                          <span className="truncate font-medium">{lane.title}</span>
                          <span className="text-xs text-ink-muted">
                            ({laneDoneTasks}/{lane.items.length})
                          </span>
                        </button>
                        {lane.items.length > 0 && (
                          <div className="hidden h-1.5 w-16 overflow-hidden rounded bg-column sm:block" title={`${laneDoneTasks}/${lane.items.length}`}>
                            <div className="h-full bg-success-solid" style={{ width: `${(laneDoneTasks / lane.items.length) * 100}%` }} />
                          </div>
                        )}
                        {lane.parent && (
                          <>
                            <StateLozenge state={lane.parent.state} category={stateCategory(meta, lane.parent.type, lane.parent.state)} />
                            {lane.parent.assignee && <Avatar person={lane.parent.assignee} size={18} />}
                            <button
                              type="button"
                              onClick={() => open(lane.parent.id)}
                              className="text-xs text-brand-ink hover:underline"
                            >
                              {t('open')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openCreate({
                                  type: 'Task',
                                  parentId: lane.parent.id,
                                  iterationPath: sprint?.path,
                                  tags: lane.parent.tags,
                                  assignee: lane.parent.assignee?.email,
                                  openAfter: false,
                                })
                              }
                              title={t('createChildTask')}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-ink-subtle hover:bg-column hover:text-ink"
                            >
                              {t('childTask')}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {!isCollapsed(lane) && (
                      <div className="grid gap-2" style={grid}>
                        {columns.map((c) => (
                          <Column
                            key={c.id}
                            id={`${lane.key}::${c.id}`}
                            label={c.label}
                            tone={c.kind}
                            items={lane.items.filter((it) => columnOf(it) === c.id)}
                            renderCard={renderCard}
                            minimized={mode === 'items' && c.category === 'Completed' && !showDone}
                            onExpand={toggleShowDone}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!visible.length && (
                <div className="mt-4 max-w-xl">
                  <EmptyState
                    icon={modeItems.length ? 'filter-off' : 'inbox'}
                    tone={modeItems.length ? 'filtered' : 'neutral'}
                    title={t('noItemsFilters')}
                    hint={filters.mine && modeItems.length ? t('onlyMineHint') : undefined}
                    actionLabel={modeItems.length ? t('clearFilters') : undefined}
                    onAction={modeItems.length ? () => setFilters(emptyFilters) : undefined}
                  />
                </div>
              )}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging ? (
              <div className="w-[260px]">
                <CardBody item={dragging} dragging planningOptions={planningOptions} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
