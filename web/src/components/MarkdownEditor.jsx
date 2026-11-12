import { useRef, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { toSafeHtml } from '../lib/rich.js';
import Icon from './Icon.jsx';

const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;

// Editor Markdown reutilizável com abas Editar/Visualizar, barra de formatação, Ctrl+Enter e continuação de listas/checklists.
export default function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  rows = 6,
  autoFocus = false,
  compact = false,
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('write');
  const ref = useRef(null);

  const applyWrap = (before, after = before, sample = '') => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || sample;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const applyLinePrefix = (prefix) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + prefix.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === 'Tab') {
      const el = e.currentTarget;
      const pos = el.selectionStart;
      const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
      const lineEndIdx = value.indexOf('\n', pos);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const line = value.slice(lineStart, lineEnd);
      if (LIST_PREFIX_RE.test(line)) {
        e.preventDefault();
        if (e.shiftKey) {
          const stripped = line.replace(/^ {1,2}/, '');
          const diff = line.length - stripped.length;
          onChange(`${value.slice(0, lineStart)}${stripped}${value.slice(lineEnd)}`);
          requestAnimationFrame(() => el.setSelectionRange(Math.max(lineStart, pos - diff), Math.max(lineStart, pos - diff)));
        } else {
          onChange(`${value.slice(0, lineStart)}  ${line}${value.slice(lineEnd)}`);
          requestAnimationFrame(() => el.setSelectionRange(pos + 2, pos + 2));
        }
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const el = e.currentTarget;
      const pos = el.selectionStart;
      if (pos !== el.selectionEnd) return;
      const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
      const lineBeforeCursor = value.slice(lineStart, pos);
      const m = lineBeforeCursor.match(LIST_PREFIX_RE);
      if (!m) return;
      const [, indent, bullet, taskBox, content] = m;
      e.preventDefault();
      if (!content.trim()) {
        // Linha vazia de lista: remove o marcador e sai da lista.
        const next = `${value.slice(0, lineStart)}${value.slice(pos)}`;
        onChange(next);
        requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart));
        return;
      }
      const nextBullet = /^\d+/.test(bullet) ? `${Number.parseInt(bullet, 10) + 1}${bullet.slice(-1)}` : bullet;
      const insert = `\n${indent}${nextBullet} ${taskBox ? '[ ] ' : ''}`;
      const next = `${value.slice(0, pos)}${insert}${value.slice(pos)}`;
      onChange(next);
      requestAnimationFrame(() => {
        const nextPos = pos + insert.length;
        el.setSelectionRange(nextPos, nextPos);
      });
    }
  };

  const previewHtml = tab === 'preview' ? toSafeHtml(value, 'markdown') : '';
  const toolBtn = 'rounded px-1.5 py-1 text-xs font-medium text-ink-subtle hover:bg-hover hover:text-ink';

  return (
    <div className="overflow-hidden rounded-[3px] border-2 border-line bg-surface focus-within:border-brand">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line bg-sunken px-2 py-1">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
              tab === 'write' ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name="edit" size={12} /> {t('tabWrite')}
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
              tab === 'preview' ? 'bg-surface text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon name="eye" size={12} /> {t('tabPreview')}
          </button>
        </div>
        {tab === 'write' && (
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => applyWrap('**', '**', 'bold')} title={t('mdBold')} className={`${toolBtn} font-bold`}>
              B
            </button>
            <button type="button" onClick={() => applyWrap('*', '*', 'italic')} title={t('mdItalic')} className={`${toolBtn} italic`}>
              I
            </button>
            <button type="button" onClick={() => applyWrap('`', '`', 'code')} title={t('mdCode')} className={`${toolBtn} font-mono`}>
              {'<>'}
            </button>
            {!compact && (
              <button type="button" onClick={() => applyWrap('\n```\n', '\n```\n', 'code')} title={t('mdCodeBlock')} className={`${toolBtn} font-mono`}>
                {'```'}
              </button>
            )}
            <button type="button" onClick={() => applyLinePrefix('- ')} title={t('mdList')} className={toolBtn}>
              •
            </button>
            <button type="button" onClick={() => applyLinePrefix('- [ ] ')} title={t('mdTask')} className={toolBtn}>
              ☑
            </button>
            <button type="button" onClick={() => applyWrap('[', '](https://)', 'link')} title={t('mdLink')} className={toolBtn}>
              <Icon name="link" size={12} />
            </button>
          </div>
        )}
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="block w-full resize-y bg-surface p-2.5 font-mono text-[13px] text-ink outline-none"
        />
      ) : previewHtml ? (
        <div className="prose-azdo min-h-[6rem] p-3 text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      ) : (
        <div className="min-h-[6rem] p-3 text-sm text-ink-muted">{t('nothingToPreview')}</div>
      )}
    </div>
  );
}
