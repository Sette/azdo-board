import { useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
  }
}

// Botão compacto para copiar o identificador numérico do item (em cards, raias, cabeçalho e tasks filhas).
export default function CopyIdButton({ id, showId = true, label, iconSize = 12, className = '' }) {
  const { t } = useI18n();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const text = String(id);
  const title = t('copyKey', { id: text });

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    copyToClipboard(text);
    setCopied(true);
    toast?.info(t('copiedIdToast', { id: text }));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      }}
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={`group/copy inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink ${className}`}
    >
      {showId && <span>{text}</span>}
      <Icon
        name={copied ? 'check' : 'copy'}
        size={iconSize}
        className={copied ? 'text-success-ink' : 'opacity-65 group-hover/copy:opacity-100'}
      />
      {label && <span>{label}</span>}
    </button>
  );
}
