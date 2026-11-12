import Icon from './Icon.jsx';

// Estado vazio consistente com ícone, explicação contextual e botão de ação opcional (ex.: limpar filtros).
export default function EmptyState({ icon = 'inbox', tone = 'neutral', title, hint, actionLabel, onAction }) {
  const iconTone =
    tone === 'success'
      ? 'bg-success-bg text-success-ink'
      : tone === 'filtered'
        ? 'bg-brand-subtle text-brand-ink'
        : 'bg-column text-ink-muted';

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line px-6 py-10 text-center">
      <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${iconTone}`}>
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs text-ink-muted">{hint}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] bg-column px-3 py-1.5 text-xs font-medium text-ink hover:bg-hover"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
