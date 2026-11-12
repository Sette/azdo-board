import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import Icon from './Icon.jsx';

// Popover de seleção unificado: teclado (↑/↓/Enter/Esc), busca opcional, seleção única ou múltipla e variantes visuais.
export default function Dropdown({
  trigger,
  placeholder,
  options = [],
  value,
  onSelect,
  searchable = false,
  multi = false,
  variant = 'plain',
  align = 'left',
  width = 'w-64',
  disabled = false,
  ariaLabel,
  className = '',
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [flipUp, setFlipUp] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  const isSelected = (v) => (multi ? Array.isArray(value) && value.includes(v) : v === value);
  const shown = filter ? options.filter((o) => String(o.label).toLowerCase().includes(filter.toLowerCase())) : options;

  useEffect(() => {
    if (!open) return undefined;
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setFlipUp(window.innerHeight - rect.bottom < 260 && rect.top > 280);
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = shown.findIndex((o) => isSelected(o.value));
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [open, filter]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-opt-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const pick = (opt) => {
    if (!opt) return;
    if (multi) {
      onSelect(opt.value);
    } else {
      setOpen(false);
      if (opt.value !== value) onSelect(opt.value);
    }
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      setOpen(true);
      setFilter('');
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (shown.length ? (i + 1) % shown.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(Math.max(0, shown.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(shown[activeIdx]);
    }
  };

  const selectedOpt = !multi ? options.find((o) => o.value === value) : null;

  let buttonContent = trigger;
  let buttonCls = 'max-w-full text-left disabled:cursor-not-allowed disabled:opacity-60';

  if (variant === 'input') {
    buttonCls = `flex w-full items-center justify-between gap-2 rounded-[3px] border-2 ${
      open ? 'border-brand bg-surface' : 'border-line bg-sunken hover:bg-hover/50'
    } px-2.5 py-1.5 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60`;
    buttonContent = trigger || (
      <>
        <span className="flex min-w-0 items-center gap-2">
          {selectedOpt?.icon}
          <span className={`truncate ${selectedOpt ? 'text-ink' : 'text-ink-muted'}`}>
            {selectedOpt ? selectedOpt.label : placeholder || t('select')}
          </span>
        </span>
        <Icon name="chevron-down" size={14} className="text-ink-muted" />
      </>
    );
  } else if (variant === 'control') {
    buttonCls = `inline-flex max-w-full items-center justify-between gap-2 rounded-[3px] border ${
      open ? 'border-brand bg-surface ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover'
    } px-2.5 py-1 text-left text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60`;
    buttonContent = trigger || (
      <>
        <span className="flex min-w-0 items-center gap-1.5">
          {selectedOpt?.icon}
          <span className="truncate">{selectedOpt ? selectedOpt.label : placeholder || t('select')}</span>
        </span>
        <Icon name="chevron-down" size={14} className="text-ink-muted" />
      </>
    );
  }

  return (
    <div className={`relative ${variant === 'input' ? 'w-full' : ''} ${className}`} ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((o) => !o);
          setFilter('');
        }}
        className={buttonCls}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-multiselectable={multi || undefined}
          className={`absolute z-50 ${flipUp ? 'bottom-full mb-1' : 'mt-1'} ${width} ${
            align === 'right' ? 'right-0' : 'left-0'
          } max-h-72 overflow-auto rounded-md border border-line bg-surface-overlay py-1 shadow-xl`}
        >
          {searchable && (
            <div className="sticky top-0 z-10 bg-surface-overlay px-2 pt-1 pb-1.5">
              <div className="relative">
                <Icon name="search" size={13} className="pointer-events-none absolute top-2 left-2 text-ink-muted" />
                <input
                  autoFocus
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('filter')}
                  className="w-full rounded border border-line bg-sunken py-1 pr-2 pl-6 text-sm outline-none focus:border-brand focus:bg-surface"
                />
              </div>
            </div>
          )}
          {shown.map((o, idx) => {
            const sel = isSelected(o.value);
            const active = idx === activeIdx;
            return (
              <button
                type="button"
                role="option"
                aria-selected={sel}
                data-opt-idx={idx}
                key={o.value ?? '__none'}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => pick(o)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  sel ? 'bg-brand-subtle font-medium text-brand-ink' : active ? 'bg-hover text-ink' : 'text-ink hover:bg-hover'
                }`}
              >
                {multi && (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${
                      sel ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                    }`}
                  >
                    {sel && <Icon name="check" size={11} />}
                  </span>
                )}
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.badge}
              </button>
            );
          })}
          {!shown.length && <div className="px-3 py-2 text-sm text-ink-muted">{t('nothingFound')}</div>}
        </div>
      )}
    </div>
  );
}
