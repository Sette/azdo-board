import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind, text) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((list) => [...list, { id, kind, text }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 3200);
    },
    [dismiss],
  );
  const value = useMemo(
    () => ({
      success: (msg) => push('success', msg),
      error: (msg) => push('error', msg),
      info: (msg) => push('info', msg),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((item) => {
          const isErr = item.kind === 'error';
          const icon = isErr ? 'warning' : item.kind === 'info' ? 'info' : 'check-circle';
          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-sm shadow-xl transition-all ${
                isErr
                  ? 'border-danger-border bg-danger-solid text-white'
                  : 'border-line bg-surface-overlay text-ink'
              }`}
            >
              <Icon
                name={icon}
                size={16}
                className={`mt-0.5 ${isErr ? 'text-white' : item.kind === 'info' ? 'text-brand-ink' : 'text-success-ink'}`}
              />
              <span className="min-w-0 flex-1">{item.text}</span>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={t('close')}
                className={`rounded p-0.5 opacity-75 hover:opacity-100 ${isErr ? 'text-white' : 'text-ink-muted hover:text-ink'}`}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
