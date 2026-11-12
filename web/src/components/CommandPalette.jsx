import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { prefs, stateCategory } from '../lib/format.js';
import { useMeta } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { useTheme } from '../lib/theme.jsx';
import Icon from './Icon.jsx';
import StateLozenge from './StateLozenge.jsx';
import TypeIcon from './TypeIcon.jsx';

export function ShortcutsModal({ onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const rows = [
    ['Ctrl + K', t('shortcutPalette')],
    ['/', t('shortcutSearch')],
    ['C', t('shortcutCreate')],
    ['M', t('shortcutMine')],
    ['[', t('shortcutSidebar')],
    ['?', t('shortcutHelp')],
    ['Esc', t('close')],
  ];

  return (
    <div className="fixed inset-0 z-[58] flex items-start justify-center bg-backdrop p-4 pt-20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-md border border-line bg-surface-overlay shadow-2xl" role="dialog" aria-label={t('shortcutsTitle')} data-shortcuts-modal="true">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Icon name="keyboard" size={16} className="text-ink-muted" />
            {t('shortcutsTitle')}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-hover hover:text-ink" aria-label={t('close')}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <ul className="divide-y divide-line px-5 py-2 text-sm">
          {rows.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between py-2">
              <span className="text-ink-subtle">{label}</span>
              <kbd className="rounded border border-line bg-column px-2 py-0.5 font-mono text-xs font-semibold text-ink">{key}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function CommandPalette({ onClose, onCreate, onNavigate }) {
  const { t, lang, setLang } = useI18n();
  const { cycleTheme } = useTheme();
  const { data: meta } = useMeta();
  const qc = useQueryClient();
  const navigate = onNavigate;
  const location = useLocation();
  const [params] = useSearchParams();
  const openItem = (id) => {
    const next = new URLSearchParams(location.search);
    next.set('item', String(id));
    navigate({ pathname: location.pathname, search: `?${next.toString()}` });
  };
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const cachedItems = useMemo(() => {
    const seen = new Map();
    for (const k of [['sprint'], ['backlog'], ['my'], ['blocked'], ['validation']]) {
      for (const [, data] of qc.getQueriesData({ queryKey: k })) {
        if (Array.isArray(data)) {
          for (const it of data) if (it?.id && !seen.has(it.id)) seen.set(it.id, it);
        }
      }
    }
    return [...seen.values()];
  }, [qc]);

  const entries = useMemo(() => {
    const term = q.trim().toLowerCase();
    const idMatch = term.replace(/^#/, '');
    const list = [];

    if (/^\d+$/.test(idMatch)) {
      const existing = cachedItems.find((x) => String(x.id) === idMatch);
      list.push({
        id: `jump-${idMatch}`,
        group: t('paletteActions'),
        label: existing ? `#${existing.id} ${existing.title}` : `#${idMatch}`,
        icon: existing ? <TypeIcon type={existing.type} size={14} /> : <Icon name="search" size={14} />,
        run: () => openItem(idMatch),
      });
    }

    const actions = [
      { id: 'act-create', group: t('paletteActions'), label: t('createPlus').replace(/^＋\s*/, ''), icon: <Icon name="plus" size={14} />, run: () => onCreate() },
      { id: 'act-theme', group: t('paletteActions'), label: t('themeToggle', { mode: '' }).replace(/:\s*\(/, ' ('), icon: <Icon name="sun" size={14} />, run: () => cycleTheme() },
      {
        id: 'act-lang',
        group: t('paletteActions'),
        label: `${t('language')}: ${lang === 'en' ? 'Português (PT)' : 'English (EN)'}`,
        icon: <Icon name="info" size={14} />,
        run: () => setLang(lang === 'en' ? 'pt' : 'en'),
      },
    ];
    if (location.pathname === '/board') {
      const curMode = params.get('mode') || prefs.get('boardMode', 'items');
      const nextMode = curMode === 'tasks' ? 'items' : 'tasks';
      actions.push({
        id: 'act-mode',
        group: t('paletteActions'),
        label: t('switchModeTo', { mode: t(nextMode === 'tasks' ? 'modeTasks' : 'modeItems') }),
        icon: <Icon name="board" size={14} />,
        run: () => {
          prefs.set('boardMode', nextMode);
          const n = new URLSearchParams(location.search);
          n.set('mode', nextMode);
          navigate({ pathname: location.pathname, search: `?${n.toString()}` });
        },
      });
    }

    const pages = [
      { id: 'nav-board', group: t('palettePages'), label: t('navBoard'), icon: <Icon name="board" size={14} />, run: () => navigate('/board') },
      { id: 'nav-backlog', group: t('palettePages'), label: t('navBacklog'), icon: <Icon name="backlog" size={14} />, run: () => navigate('/backlog') },
      { id: 'nav-issues', group: t('palettePages'), label: t('navIssues'), icon: <Icon name="issues" size={14} />, run: () => navigate('/issues') },
      { id: 'nav-blocked', group: t('palettePages'), label: t('navBlocked'), icon: <Icon name="flag" size={14} />, run: () => navigate('/blocked') },
      { id: 'nav-validation', group: t('palettePages'), label: t('navValidation'), icon: <Icon name="check-circle" size={14} />, run: () => navigate('/validation') },
    ];

    const sprints = [...(meta?.sprints || [])].reverse().map((s) => ({
      id: `sprint-${s.id}`,
      group: t('paletteSprints'),
      label: `${s.name}${s.timeFrame === 1 ? ` (${t('current')})` : ''}`,
      icon: <Icon name="board" size={14} />,
      run: () => navigate(`/board?sprint=${encodeURIComponent(s.id)}`),
    }));

    const itemEntries = cachedItems.map((it) => ({
      id: `item-${it.id}`,
      group: t('paletteItems'),
      label: `#${it.id} ${it.title}`,
      icon: <TypeIcon type={it.type} size={14} />,
      badge: <StateLozenge state={it.state} category={stateCategory(meta, it.type, it.state)} />,
      run: () => openItem(it.id),
    }));

    const all = [...actions, ...pages, ...(term ? sprints : []), ...itemEntries];
    const filtered = term ? all.filter((e) => e.label.toLowerCase().includes(term)) : [...actions, ...pages, ...itemEntries.slice(0, 8)];
    for (const item of filtered) {
      if (!list.some((x) => x.id === item.id)) list.push(item);
    }
    return list.slice(0, 25);
  }, [q, cachedItems, meta, t, lang, setLang, cycleTheme, onCreate, navigate, location.pathname, location.search, params]);

  useEffect(() => setActiveIdx(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const execute = (entry) => {
    if (!entry) return;
    entry.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[58] flex items-start justify-center bg-backdrop p-4 pt-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-md border border-line bg-surface-overlay shadow-2xl" role="dialog" aria-label={t('shortcutPalette')} data-command-palette="true">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Icon name="search" size={16} className="text-ink-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => (entries.length ? (i + 1) % entries.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
              } else if (e.key === 'Enter' && entries[activeIdx]) {
                e.preventDefault();
                execute(entries[activeIdx]);
              }
            }}
            placeholder={t('palettePlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="rounded border border-line bg-column px-1.5 py-0.5 text-[11px] text-ink-muted">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
          {entries.map((e, idx) => {
            const prevGroup = idx > 0 ? entries[idx - 1].group : null;
            return (
              <div key={e.id}>
                {e.group !== prevGroup && <div className="px-3.5 pt-2 pb-1 text-[11px] font-bold tracking-wide text-ink-muted uppercase">{e.group}</div>}
                <button
                  type="button"
                  data-cmd-idx={idx}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => execute(e)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm ${
                    idx === activeIdx ? 'bg-brand-subtle text-brand-ink' : 'text-ink hover:bg-hover'
                  }`}
                >
                  <span className="text-ink-subtle">{e.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  {e.badge}
                </button>
              </div>
            );
          })}
          {!entries.length && <div className="px-4 py-6 text-center text-sm text-ink-muted">{t('nothingFound')}</div>}
        </div>
      </div>
    </div>
  );
}
