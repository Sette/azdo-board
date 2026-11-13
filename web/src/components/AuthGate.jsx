import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { ThemeSwitch, LangSwitch } from '../App.jsx';
import { colorFor, initials } from '../lib/format.js';
import { LangProvider, useI18n } from '../lib/i18n.jsx';
import Icon from './Icon.jsx';
import { ToastProvider, useToast } from './Toast.jsx';

const AuthContext = createContext({
  authRequired: false,
  user: null,
  status: null,
  openPatModal: () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

let gsiScriptPromise = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('GSI unavailable')));
      s.onerror = () => {
        gsiScriptPromise = null;
        reject(new Error('GSI script blocked'));
      };
      document.head.appendChild(s);
    });
  }
  return gsiScriptPromise;
}

function AuthShell({ children }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-sunken text-ink">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white">
            <Icon name="check" size={15} />
          </span>
          <span>{t('appName')}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <LangSwitch />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">{children}</div>
    </div>
  );
}

function GoogleLoginScreen({ status, onAuthenticated }) {
  const { t } = useI18n();
  const btnRef = useRef(null);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError('');
    loadGoogleScript()
      .then((google) => {
        if (cancelled || !btnRef.current) return;
        google.accounts.id.initialize({
          client_id: status.googleClientId,
          ...(status.allowedDomain ? { hd: status.allowedDomain } : {}),
          callback: async (response) => {
            if (!response?.credential) return;
            setVerifying(true);
            setError('');
            try {
              await api.loginGoogle(response.credential);
              if (!cancelled) await onAuthenticated();
            } catch (err) {
              if (!cancelled) {
                setError(err.message);
                google.accounts.id.disableAutoSelect?.();
              }
            } finally {
              if (!cancelled) setVerifying(false);
            }
          },
        });
        btnRef.current.innerHTML = '';
        google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 280,
        });
      })
      .catch(() => {
        if (!cancelled) setError(t('authGoogleLoadError'));
      });
    return () => {
      cancelled = true;
    };
  }, [status.googleClientId, status.allowedDomain, onAuthenticated, t]);

  return (
    <AuthShell>
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-3 py-1 text-xs font-semibold tracking-wide text-brand-ink uppercase">
            <Icon name="lock" size={13} />
            {t('authRestricted')}
          </div>
          <h1 className="text-xl font-bold text-ink">{t('authSignInTitle')}</h1>
          <p className="mt-1.5 text-sm text-ink-subtle">{t('authSignInSubtitle')}</p>
          {status.allowedDomain && (
            <p className="mt-1 text-xs font-medium text-ink-muted">{t('authAllowedDomain', { domain: status.allowedDomain })}</p>
          )}
        </div>

        <div className="flex min-h-11 flex-col items-center justify-center">
          <div ref={btnRef} />
          {verifying && <p className="mt-3 text-xs font-medium text-ink-subtle">{t('authVerifying')}</p>}
        </div>

        {error && (
          <div className="mt-4 rounded-[3px] border border-danger-ink/20 bg-danger-bg px-3 py-2 text-center text-xs font-medium text-danger-ink">
            {error}
          </div>
        )}
      </div>
    </AuthShell>
  );
}

function PatForm({ org, title, onSaved, onCancel, user, onLogout }) {
  const { t } = useI18n();
  const [pat, setPat] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tokensUrl = org ? `https://dev.azure.com/${encodeURIComponent(org)}/_usersSettings/tokens` : 'https://dev.azure.com';

  const submit = async (e) => {
    e.preventDefault();
    if (!pat.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.savePat(pat.trim());
      setPat('');
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
            <Icon name="key" size={12} />
            Azure DevOps
          </div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink-subtle">{t('patSetupSubtitle')}</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('close')}
            className="rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {user && (
        <div className="flex items-center justify-between gap-2 rounded-[3px] border border-line bg-sunken px-3 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            {user.picture ? (
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-6 w-6 shrink-0 rounded-full" />
            ) : (
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: colorFor(user.email) }}
              >
                {initials(user.name || user.email)}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{user.name}</div>
              <div className="truncate text-ink-muted">{user.email}</div>
            </div>
          </div>
          {onLogout && (
            <button type="button" onClick={onLogout} className="shrink-0 font-medium text-ink-subtle hover:text-ink hover:underline">
              {t('signOut')}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-line bg-sunken px-3 py-2.5 text-xs">
        <div>
          <span className="text-ink-subtle">{t('patScopeLabel')} </span>
          <span className="font-semibold text-ink">{t('patScopeValue')}</span>
        </div>
        <a
          href={tokensUrl}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand hover:underline"
        >
          {t('patOpenAzureTokens')}
        </a>
      </div>

      <div>
        <label htmlFor="azdo-pat-input" className="mb-1 block text-xs font-semibold text-ink-subtle">
          {t('patInputLabel')}
        </label>
        <div className="relative">
          <input
            id="azdo-pat-input"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder={t('patInputPlaceholder')}
            className="w-full rounded-[3px] border-2 border-line bg-sunken py-2 pr-9 pl-3 font-mono text-sm text-ink outline-none focus:border-brand focus:bg-surface"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            title={show ? t('patHide') : t('patShow')}
            aria-label={show ? t('patHide') : t('patShow')}
            className="absolute top-2 right-2 rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
          >
            <Icon name={show ? 'eye-off' : 'eye'} size={15} />
          </button>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-muted">
          <Icon name="lock" size={12} className="shrink-0" />
          <span>{t('patSecurityHint')}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-[3px] border border-danger-ink/20 bg-danger-bg px-3 py-2 text-xs font-medium text-danger-ink">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[3px] px-3 py-2 text-sm font-medium text-ink-subtle hover:bg-hover hover:text-ink"
          >
            {t('cancel')}
          </button>
        )}
        <button
          type="submit"
          disabled={!pat.trim() || saving}
          className="rounded-[3px] bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? t('patValidating') : t('patConnectBtn')}
        </button>
      </div>
    </form>
  );
}

function PatModal({ org, user, onSaved, onClose }) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface-overlay p-6 shadow-xl">
        <PatForm org={org} user={user} title={t('patUpdateTitle')} onSaved={onSaved} onCancel={onClose} />
      </div>
    </div>
  );
}

function InnerAuthContent({ status, refreshStatus, children }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [patModalOpen, setPatModalOpen] = useState(false);

  const logout = useCallback(async () => {
    window.google?.accounts?.id?.disableAutoSelect?.();
    await api.logout().catch(() => {});
    qc.clear();
    setPatModalOpen(false);
    await refreshStatus();
  }, [qc, refreshStatus]);

  const handlePatSaved = useCallback(async () => {
    qc.clear();
    setPatModalOpen(false);
    await refreshStatus();
    toast?.success?.(t('patSavedToast'));
  }, [qc, refreshStatus, toast, t]);

  const ctx = useMemo(
    () => ({
      authRequired: Boolean(status?.authRequired),
      user: status?.user || null,
      status,
      openPatModal: () => setPatModalOpen(true),
      logout,
    }),
    [status, logout],
  );

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sunken text-sm text-ink-muted">
        {t('loading')}
      </div>
    );
  }

  if (status.authRequired && !status.authenticated) {
    return <GoogleLoginScreen status={status} onAuthenticated={refreshStatus} />;
  }

  if (status.authRequired && !status.hasPat) {
    return (
      <AuthShell>
        <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-7 shadow-sm">
          <PatForm
            org={status.org}
            user={status.user}
            title={t('patSetupTitle')}
            onSaved={handlePatSaved}
            onLogout={logout}
          />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthContext.Provider value={ctx}>
      {children}
      {patModalOpen && (
        <PatModal
          org={status.org}
          user={status.user}
          onSaved={handlePatSaved}
          onClose={() => setPatModalOpen(false)}
        />
      )}
    </AuthContext.Provider>
  );
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await api.authStatus();
      setStatus(data);
    } catch {
      // Fallback: se o endpoint não existir ou falhar momentaneamente, tenta seguir sem bloquear modo demo/local.
      setStatus((prev) => prev || { authRequired: false, authenticated: true, hasPat: true, lang: null });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const onInvalid = () => refreshStatus();
    window.addEventListener('azdo:auth-invalid', onInvalid);
    return () => window.removeEventListener('azdo:auth-invalid', onInvalid);
  }, [refreshStatus]);

  return (
    <LangProvider defaultLang={status?.lang}>
      <ToastProvider>
        <InnerAuthContent status={status} refreshStatus={refreshStatus}>
          {children}
        </InnerAuthContent>
      </ToastProvider>
    </LangProvider>
  );
}
