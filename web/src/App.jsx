import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useOpenCreate } from './components/CreateModal.jsx';
import ItemModal from './components/ItemModal.jsx';
import { colorFor, initials } from './lib/format.js';
import { useMeta } from './lib/hooks.js';
import { LANG_OPTIONS, useI18n } from './lib/i18n.jsx';
import Backlog from './pages/Backlog.jsx';
import Board from './pages/Board.jsx';
import FlagList from './pages/FlagList.jsx';
import Issues from './pages/Issues.jsx';

const NAV = [
  { to: '/backlog', key: 'navBacklog', icon: '☰' },
  { to: '/board', key: 'navBoard', icon: '▦' },
  { to: '/issues', key: 'navIssues', icon: '≡' },
  { to: '/blocked', key: 'navBlocked', icon: '⚑' },
  { to: '/validation', key: 'navValidation', icon: '✓' },
];

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

function TopBar() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const openCreate = useOpenCreate();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line px-4">
      <div className="flex items-center gap-2 font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white">✓</span>
        {t('appName')}
      </div>
      <button onClick={() => openCreate()} className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
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
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-72 rounded-[3px] border-2 border-line bg-sunken px-3 py-1 text-sm outline-none focus:border-brand focus:bg-surface"
        />
      </form>
      <LangSwitch />
    </header>
  );
}

function Sidebar() {
  const { t } = useI18n();
  const { data: meta } = useMeta();
  const project = meta?.project || '';
  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-line bg-sunken px-3 py-4">
      <div className="mb-5 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm font-bold text-white" style={{ background: colorFor(project) }}>
          {initials(project)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{project || '…'}</div>
          <div className="truncate text-xs text-ink-muted">{meta?.team}</div>
        </div>
      </div>
      <div className="mb-1 px-2 text-[11px] font-bold tracking-wide text-ink-muted uppercase">{t('navPlanning')}</div>
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) =>
            `mb-0.5 flex items-center gap-3 rounded-[3px] px-2 py-1.5 text-sm ${isActive ? 'bg-brand-subtle font-medium text-brand' : 'text-ink-subtle hover:bg-hover'}`
          }
        >
          <span className="w-4 text-center">{n.icon}</span>
          {t(n.key)}
        </NavLink>
      ))}
      <span className="flex-1" />
      {meta?.webUrl && (
        <a href={meta.webUrl} target="_blank" rel="noreferrer" className="px-2 text-xs text-ink-muted hover:underline">
          {t('openInAzure')}
        </a>
      )}
    </nav>
  );
}

export default function App() {
  const { t } = useI18n();
  const { error } = useMeta();
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">
          {error ? (
            <div className="m-8 rounded bg-[#ffebe6] p-4 text-sm text-[#ae2e24]">{t('azureError', { message: error.message })}</div>
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
    </div>
  );
}
