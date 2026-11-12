import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

// Popover de seleção simples: botão + lista com filtro opcional.
export default function Dropdown({ trigger, options, value, onSelect, searchable = false, align = 'left', width = 'w-64', disabled }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false));
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const shown = filter ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase())) : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setFilter('');
        }}
        className="max-w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute z-50 mt-1 ${width} ${align === 'right' ? 'right-0' : 'left-0'} max-h-80 overflow-auto rounded-md border border-line bg-surface py-1 shadow-xl`}
        >
          {searchable && (
            <div className="px-2 pb-1">
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('filter')}
                className="w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-brand"
              />
            </div>
          )}
          {shown.map((o) => (
            <button
              type="button"
              key={o.value ?? '__none'}
              onClick={() => {
                setOpen(false);
                if (o.value !== value) onSelect(o.value);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover ${o.value === value ? 'bg-brand-subtle' : ''}`}
            >
              {o.icon}
              <span className="truncate">{o.label}</span>
            </button>
          ))}
          {!shown.length && <div className="px-3 py-2 text-sm text-ink-muted">{t('nothingFound')}</div>}
        </div>
      )}
    </div>
  );
}
