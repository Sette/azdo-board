import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import CommandPalette, { ShortcutsModal } from './components/CommandPalette.jsx';
import { useOpenCreate } from './components/CreateModal.jsx';
import Icon from './components/Icon.jsx';
import ItemModal from './components/ItemModal.jsx';
import { colorFor, initials, prefs, stateCategory } from './lib/format.js';
import { useMeta } from './lib/hooks.js';
import { LANG_OPTIONS, useI18n } from './lib/i18n.jsx';
import { useTheme } from './lib/theme.jsx';
import Backlog from './pages/Backlog.jsx';
import Board from './pages/Board.jsx';
import FlagList from './pages/FlagList.jsx';
import Issues from './pages/Issues.jsx';

const NAV = [
  { to: '/backlog', key: 'navBacklog', icon: 'backlog' },
  { to: '/board', key: 'navBoard', icon: 'board' },
  { to: '/issues', key: 'navIssues', icon: 'issues' },
  { to: '/blocked', key: 'navBlocked', icon: 'flag', badgeKind: 'blocked' },
  { to: '/validation', key: 'navValidation', icon: 'check-circle', badgeKind: 'validation' },
];

// Deriva contadores de Blocked/Validation do cache sem disparar chamadas MCP extras.
function useNavCounts(meta) {
  const qc = useQueryClient();
  const subscribe = useCallback(
    (onStoreChange) =>
      qc.getQueryCache().subscribe((event) => {
        if (event?.type === 'updated' || event?.type === 'removed') onStoreChange();
      }),
    [qc],
  );

  const getSnapshot = () => {
    const countFrom = (queryKey, pred) => {
      const direct = qc.getQueryData(queryKey);
      if (Array.isArray(direct)) return direct.length;
      const sprintItems = meta?.currentSprintId ? qc.getQueryData(['sprint', meta.currentSprintId]) : null;
      if (!Array.isArray(sprintItems)) return '';
      return sprintItems.filter((it) => stateCategory(meta, it.type, it.state) !== 'Completed' && it.state !== 'Removed' && pred(it)).length;
    };
    return `${countFrom(['blocked'], (it) => it.blocked)}:${countFrom(['validation'], (it) => it.inValidation)}`;
  };

  const [b, v] = useSyncExternalStore(subscribe, getSnapshot).split(':');
  return {
    blocked: b === '' ? null : Number(b),
    validation: v === '' ? null : Number(v),
  };
}

const THEME_OPTIONS = [
  { value: 'light', icon: 'sun', shortKey: 'themeShortLight', titleKey: 'themeLight' },
  { value: 'dark', icon: 'moon', shortKey: 'themeShortDark', titleKey: 'themeDark' },
  { value: 'system', icon: 'monitor', shortKey: 'themeShortSystem', titleKey: 'themeSystem' },
];

function ThemeSwitch() {
  const { theme, setTheme, purple, togglePurple } = useTheme();
  const { t } = useI18n();
  return (
    <div className="flex items-center rounded-[3px] bg-column p-0.5 text-xs" role="group" aria-label={t('themeLabel')}>
      {THEME_OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            aria-pressed={active}
            title={t(o.titleKey)}
            aria-label={t(o.titleKey)}
            className={`inline-flex items-center gap-1 rounded-[3px] px-2 py-1 font-semibold ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name={o.icon} size={13} />
            <span className="hidden xl:inline">{t(o.shortKey)}</span>
          </button>
        );
      })}
      <span className="mx-0.5 h-3.5 w-px bg-line" aria-hidden="true" />
      <button
        type="button"
        onClick={togglePurple}
        aria-pressed={purple}
        title={t('themePurple')}
        aria-label={t('themePurple')}
        className={`inline-flex items-center gap-1 rounded-[3px] px-2 py-1 font-semibold transition-colors ${
          purple ? 'bg-brand text-white shadow-sm hover:bg-brand-hover' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <Icon name="palette" size={13} />
        <span className="hidden xl:inline">{t('themeShortPurple')}</span>
      </button>
    </div>
  );
}

function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex rounded-[3px] bg-column p-0.5 text-xs" role="group" aria-label={t('language')}>
      {LANG_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          className={`rounded-[3px] px-2 py-1 font-semibold ${lang === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useContextualCreate() {
  const openCreate = useOpenCreate();
  const { data: meta } = useMeta();
  const location = useLocation();
  const [params] = useSearchParams();

  return () => {
    if (location.pathname === '/board') {
      const sprintId = params.get('sprint') || meta?.currentSprintId;
      const sprint = meta?.sprints?.find((s) => s.id === sprintId);
      const mode = params.get('mode') || prefs.get('boardMode', 'items');
      openCreate({ type: mode === 'tasks' ? 'Task' : undefined, iterationPath: sprint?.path });
      return;
    }
    if (location.pathname === '/backlog') {
      openCreate({ iterationPath: meta?.project });
      return;
    }
    openCreate();
  };
}

function TopBar({ onOpenMobileNav, onOpenShortcuts }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const triggerCreate = useContextualCreate();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label={t('openMenu')}
        className="flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-subtle hover:bg-hover hover:text-ink lg:hidden"
      >
        <Icon name="menu" size={18} />
      </button>
      <div className="flex items-center gap-2 font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white">
          <Icon name="check" size={15} />
        </span>
        <span className="hidden sm:inline">{t('appName')}</span>
      </div>
      <button onClick={triggerCreate} className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
        {t('createPlus')}
      </button>
      <span className="flex-1" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim()) return;
          const id = q.trim().replace(/^#/, '');
          navigate(/^\d+$/.test(id) ? `?item=${id}` : `/issues?view=search&q=${encodeURIComponent(q.trim())}`);
          setQ('');
        }}
        className="relative"
      >
        <Icon name="search" size={14} className="pointer-events-none absolute top-2 left-2.5 text-ink-muted" />
        <input
          data-global-search="true"
          value={q}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-44 rounded-[3px] border-2 border-line bg-sunken py-1 pr-7 pl-8 text-sm outline-none focus:border-brand focus:bg-surface sm:w-72"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('clearSearch')}
            className="absolute top-1.5 right-1.5 rounded p-0.5 text-ink-muted hover:bg-hover hover:text-ink"
          >
            <Icon name="close" size={13} />
          </button>
        ) : (
          !focused && (
            <kbd className="pointer-events-none absolute top-1.5 right-2 hidden rounded border border-line bg-surface px-1.5 text-[11px] font-medium text-ink-muted sm:inline-block">
              /
            </kbd>
          )
        )}
      </form>
      <button
        type="button"
        onClick={onOpenShortcuts}
        title={`${t('shortcutsTitle')} (?)`}
        aria-label={t('shortcutsTitle')}
        className="hidden h-7 w-7 items-center justify-center rounded-[3px] text-ink-subtle hover:bg-hover hover:text-ink sm:flex"
      >
        <Icon name="keyboard" size={15} />
      </button>
      <ThemeSwitch />
      <LangSwitch />
    </header>
  );
}

function SidebarContent({ collapsed, onToggleCollapse, onNavigate }) {
  const { t } = useI18n();
  const { data: meta } = useMeta();
  const counts = useNavCounts(meta);
  const project = meta?.project || '';

  return (
    <div className="flex h-full flex-col py-4">
      <div className={`mb-5 flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-4'}`}>
        <div className={`flex min-w-0 items-center gap-2 ${collapsed ? 'justify-center' : ''}`} title={collapsed ? `${project} · ${meta?.team || ''}` : undefined}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm font-bold text-white" style={{ background: colorFor(project) }}>
            {initials(project)}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{project || '…'}</div>
              <div className="truncate text-xs text-ink-muted">{meta?.team}</div>
            </div>
          )}
        </div>
        {onToggleCollapse && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={t('toggleSidebar')}
            aria-label={t('toggleSidebar')}
            className="hidden rounded p-1 text-ink-muted hover:bg-hover hover:text-ink lg:flex"
          >
            <Icon name="chevron-left" size={15} />
          </button>
        )}
      </div>

      {!collapsed && <div className="mb-1 px-5 text-[11px] font-bold tracking-wide text-ink-muted uppercase">{t('navPlanning')}</div>}

      <div className={collapsed ? 'px-2' : 'px-3'}>
        {NAV.map((n) => {
          const badge = n.badgeKind ? counts[n.badgeKind] : null;
          const showBadge = typeof badge === 'number' && badge > 0;
          const badgeCls = n.badgeKind === 'blocked' ? 'bg-danger-bg text-danger-ink' : 'bg-brand-subtle text-brand-ink';
          const dotCls = n.badgeKind === 'blocked' ? 'bg-danger-border' : 'bg-brand';
          return (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              title={collapsed ? `${t(n.key)}${showBadge ? ` (${badge})` : ''}` : undefined}
              className={({ isActive }) =>
                `relative mb-0.5 flex items-center ${collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-2.5 py-1.5'} rounded-[3px] text-sm ${
                  isActive ? 'bg-brand-subtle font-medium text-brand-ink' : 'text-ink-subtle hover:bg-hover hover:text-ink'
                }`
              }
            >
              <Icon name={n.icon} size={16} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{t(n.key)}</span>}
              {!collapsed && showBadge && <span className={`rounded-full px-1.5 text-[11px] font-bold ${badgeCls}`}>{badge}</span>}
              {collapsed && showBadge && <span className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${dotCls}`} />}
            </NavLink>
          );
        })}
      </div>

      <span className="flex-1" />

      <div className={`flex items-center ${collapsed ? 'flex-col gap-2 px-2' : 'justify-between px-4'}`}>
        {meta?.webUrl && (
          <a
            href={meta.webUrl}
            target="_blank"
            rel="noreferrer"
            title={collapsed ? t('openInAzure').replace(/\s*↗$/, '') : undefined}
            className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted hover:text-ink hover:underline"
          >
            <Icon name="external-link" size={13} />
            {!collapsed && <span className="truncate">{t('openInAzure').replace(/\s*↗$/, '')}</span>}
          </a>
        )}
        {onToggleCollapse && collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={t('toggleSidebar')}
            aria-label={t('toggleSidebar')}
            className="hidden rounded p-1.5 text-ink-muted hover:bg-hover hover:text-ink lg:flex"
          >
            <Icon name="chevron-right" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useI18n();
  const { error } = useMeta();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => prefs.get('sidebarCollapsed', false));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const triggerCreate = useContextualCreate();

  const toggleCollapse = () =>
    setCollapsed((c) => {
      prefs.set('sidebarCollapsed', !c);
      return !c;
    });

  useEffect(() => {
    const onToggle = () => toggleCollapse();
    window.addEventListener('azdo:toggle-sidebar', onToggle);
    return () => window.removeEventListener('azdo:toggle-sidebar', onToggle);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        setShortcutsOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      if (e.key === '/') {
        const searchEl = document.querySelector('[data-page-search="true"]') || document.querySelector('[data-global-search="true"]');
        if (searchEl) {
          e.preventDefault();
          searchEl.focus();
          searchEl.select?.();
        }
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        setPaletteOpen(false);
        return;
      }
      if (document.querySelector('[role="dialog"], [data-create-modal], [data-required-dialog]')) return;

      if (e.key === 'c') {
        e.preventDefault();
        triggerCreate();
      } else if (e.key === 'm') {
        e.preventDefault();
        window.dispatchEvent(new Event('azdo:toggle-mine'));
      } else if (e.key === '[') {
        e.preventDefault();
        toggleCollapse();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex h-full flex-col">
      <TopBar onOpenMobileNav={() => setMobileOpen(true)} onOpenShortcuts={() => setShortcutsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <nav className={`hidden shrink-0 border-r border-line bg-sunken transition-[width] duration-150 lg:block ${collapsed ? 'w-14' : 'w-60'}`}>
          <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        </nav>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMobileOpen(false)}>
            <div className="fixed inset-0 bg-backdrop" onClick={() => setMobileOpen(false)} />
            <nav className="relative z-10 w-64 border-r border-line bg-sunken shadow-2xl">
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </div>
        )}

        <main className="min-w-0 flex-1">
          {error ? (
            <div className="m-8 rounded bg-danger-bg p-4 text-sm text-danger-ink">{t('azureError', { message: error.message })}</div>
          ) : (
            <Routes>
              <Route path="/board" element={<Board />} />
              <Route path="/backlog" element={<Backlog />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/blocked" element={<FlagList key="blocked" kind="blocked" />} />
              <Route path="/validation" element={<FlagList key="validation" kind="validation" />} />
              <Route path="*" element={<Navigate to="/board" replace />} />
            </Routes>
          )}
        </main>
      </div>
      <ItemModal />
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onCreate={triggerCreate}
          onNavigate={(to) => {
            setPaletteOpen(false);
            navigate(to);
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
