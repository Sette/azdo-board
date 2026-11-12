import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Card, { CardBody } from '../components/Card.jsx';
import { useOpenCreate } from '../components/CreateModal.jsx';
import FilterBar, { applyFilters, defaultFilters } from '../components/FilterBar.jsx';
import { useSaveItem } from '../components/SaveItem.jsx';
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

function Column({ id, label, items, renderCard, minimized, onExpand, tone }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-24 flex-col gap-1.5 rounded-md p-1.5 transition-colors ${isOver ? 'bg-brand-subtle' : tone === 'blocked' ? 'bg-[#fff1ef]' : 'bg-column'}`}
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
        kind: c.name === blockedColumn ? 'blocked' : 'state',
      }));
      if (!cols.some((c) => c.kind === 'blocked')) {
        const firstDone = cols.findIndex((c) => c.category === 'Completed');
        cols.splice(firstDone < 0 ? cols.length : firstDone, 0, { id: BLOCKED, label: t('colBlocked'), category: 'Blocked', kind: 'blocked' });
      }
      return cols;
    }
    const states = (meta?.states?.[cfg.statesOf] || []).filter((s) => s.category !== 'Removed');
    const cols = states.map((s) => ({ id: s.name, label: s.name, category: s.category, kind: 'state' }));
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
      // Taskboard column: change the state when the column needs it, then set the column.
      // The blocked column also sets the Blocked flag; leaving it clears the flag.
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

  const renderCard = (it) => (
    <Card key={it.id} item={it} parent={groupBy !== 'parent' && mode === 'tasks' ? byId.get(it.parentId) : null} onOpen={open} />
  );

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
          <select
            value={sprintId || ''}
            onChange={(e) => setParam('sprint', e.target.value)}
            className="rounded-[3px] border-2 border-line px-2 py-1 text-sm outline-none focus:border-brand"
            aria-label={t('sprint')}
          >
            {[...(meta?.sprints || [])].reverse().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.timeFrame === 1 ? ` (${t('current')})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => openCreate({ type: mode === 'tasks' ? 'Task' : undefined, iterationPath: sprint?.path })}
            className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
          >
            {t('create')}
          </button>
        </div>
        <FilterBar items={modeItems} filters={filters} setFilters={setFilters} me={meta?.me} types={cfg.types}>
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
          <label className="flex items-center gap-1 text-sm text-ink-subtle">
            {t('groupBy')}
            <select
              value={groupBy}
              onChange={(e) => setParam('group', e.target.value, `boardGroup:${mode}`)}
              className="rounded-[3px] border-2 border-line px-1 py-0.5 text-sm outline-none focus:border-brand"
            >
              <option value="none">{t('groupNone')}</option>
              <option value="assignee">{t('groupAssignee')}</option>
              {mode === 'tasks' && <option value="parent">{t('groupParent')}</option>}
            </select>
          </label>
          <button onClick={() => refetch()} className="rounded-[3px] px-2 py-1 text-sm hover:bg-hover" title={t('reload')}>
            {isFetching ? '⟳ …' : '⟳'}
          </button>
        </FilterBar>
      </header>

      {error && <div className="mx-8 rounded bg-[#ffebe6] p-3 text-sm text-[#ae2e24]">{error.message}</div>}
      {isLoading ? (
        <div className="px-8 text-ink-muted">{t('loadingSprint')}</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={({ active }) => setDragging(active.data.current.item)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex-1 overflow-auto px-8 pb-8">
            <div className="min-w-max">
              <div className="sticky top-0 z-10 grid gap-2 bg-surface pb-2" style={grid}>
                {columns.map((c) => {
                  const n = visible.filter((it) => columnOf(it) === c.id);
                  return (
                    <div
                      key={c.id}
                      className={`rounded-t-md px-3 pt-2.5 pb-1 text-xs font-semibold tracking-wide uppercase ${c.kind === 'blocked' ? 'bg-[#fff1ef] text-[#ae2e24]' : 'bg-column text-ink-subtle'}`}
                    >
                      {c.kind === 'blocked' ? '⚑ ' : ''}
                      {c.label} <span className="ml-1 font-normal">{n.length}</span>
                      {mode === 'items' && c.category === 'Completed' && n.length > 0 && (
                        <button onClick={toggleShowDone} className="ml-2 font-normal normal-case text-brand hover:underline">
                          {showDone ? t('hide') : t('show')}
                        </button>
                      )}
                      {mode === 'items' && sumEffort(n) > 0 && <span className="float-right font-normal normal-case">{t('pts', { n: sumEffort(n) })}</span>}
                    </div>
                  );
                })}
              </div>
              {lanes.map((lane) => (
                <div key={lane.key} className="mb-3">
                  {groupBy !== 'none' && (
                    <button
                      onClick={() => setCollapsedLanes((c) => ({ ...c, [lane.key]: !isCollapsed(lane) }))}
                      className="mb-1.5 flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-hover"
                    >
                      <span className="w-3 text-ink-muted">{isCollapsed(lane) ? '▸' : '▾'}</span>
                      {lane.parent && <TypeIcon type={lane.parent.type} size={14} />}
                      {groupBy === 'assignee' && <Avatar person={lane.person} size={20} />}
                      {lane.parent && <span className="text-ink-muted">{lane.parent.id}</span>}
                      <span className="truncate font-medium">{lane.title}</span>
                      <span className="text-xs text-ink-muted">({lane.items.length})</span>
                      {parentDone(lane) && <StateLozenge state={lane.parent.state} category="Completed" />}
                      {lane.parent && (
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            open(lane.parent.id);
                          }}
                          className="ml-1 text-xs text-brand hover:underline"
                        >
                          {t('open')}
                        </span>
                      )}
                    </button>
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
              ))}
              {!visible.length && <p className="py-8 text-center text-ink-muted">{t('noItemsFilters')}</p>}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragging ? (
              <div className="w-[260px]">
                <CardBody item={dragging} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
