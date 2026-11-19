import { useRef, useState } from 'react';
import { api } from '../api.js';
import { isImageFileName } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';
import { toSafeHtml } from '../lib/rich.js';
import { hasDraggedFiles, normalizeUploadFile, validateAttachmentFile } from './Attachments.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;

// Editor Markdown reutilizável com abas Editar/Visualizar, barra de formatação, upload/paste de imagens, Ctrl+Enter e continuação de listas/checklists.
export default function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  rows = 6,
  autoFocus = false,
  compact = false,
  allowUpload = true,
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState('write');
  const [dragging, setDragging] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const ref = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const updateValue = (next) => {
    valueRef.current = next;
    onChange(next);
  };

  const applyWrap = (before, after = before, sample = '') => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || sample;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    updateValue(next);
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
    updateValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + prefix.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const uploadFiles = async (fileList) => {
    if (!allowUpload) return;
    const files = Array.from(fileList || []).map(normalizeUploadFile);
    if (!files.length) return;
    const valid = [];
    for (const file of files) {
      const errMsg = validateAttachmentFile(file, t);
      if (errMsg) toast.error(errMsg);
      else valid.push(file);
    }
    if (!valid.length) return;

    if (tab !== 'write') setTab('write');
    const el = ref.current;
    const cur = valueRef.current || '';
    const start = el ? (el.selectionStart ?? cur.length) : cur.length;
    const end = el ? (el.selectionEnd ?? cur.length) : cur.length;
    const items = valid.map((file) => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const token = `![${t('uploadingFile', { name: file.name })}](uploading-${uid})`;
      return { file, token };
    });

    const prefix = cur.slice(0, start);
    const suffix = cur.slice(end);
    const needLeadNewline = prefix.length > 0 && !prefix.endsWith('\n') && !prefix.endsWith(' ');
    const block = items.map((it) => it.token).join('\n');
    const inserted = `${needLeadNewline ? '\n' : ''}${block}`;
    updateValue(`${prefix}${inserted}${suffix}`);

    setUploadingCount((c) => c + items.length);
    for (const { file, token } of items) {
      try {
        const res = await api.uploadAttachment(file);
        const safeLabel = String(res.name || file.name).replace(/[\[\]]/g, '');
        const md = isImageFileName(res.name || file.name) ? `![${safeLabel}](${res.url})` : `[${safeLabel}](${res.url})`;
        const latest = valueRef.current || '';
        updateValue(latest.includes(token) ? latest.replace(token, md) : `${latest}${latest ? '\n' : ''}${md}`);
      } catch (err) {
        const latest = valueRef.current || '';
        updateValue(latest.replace(`\n${token}`, '').replace(token, ''));
        toast.error(t('uploadFailed', { name: file.name, message: err.message }));
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  };

  const onPaste = (e) => {
    if (!allowUpload) return;
    const files = e.clipboardData?.files;
    if (files?.length && !e.clipboardData.getData('text/plain')) {
      e.preventDefault();
      uploadFiles(files);
    }
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
          updateValue(`${value.slice(0, lineStart)}${stripped}${value.slice(lineEnd)}`);
          requestAnimationFrame(() => el.setSelectionRange(Math.max(lineStart, pos - diff), Math.max(lineStart, pos - diff)));
        } else {
          updateValue(`${value.slice(0, lineStart)}  ${line}${value.slice(lineEnd)}`);
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
        updateValue(next);
        requestAnimationFrame(() => el.setSelectionRange(lineStart, lineStart));
        return;
      }
      const nextBullet = /^\d+/.test(bullet) ? `${Number.parseInt(bullet, 10) + 1}${bullet.slice(-1)}` : bullet;
      const insert = `\n${indent}${nextBullet} ${taskBox ? '[ ] ' : ''}`;
      const next = `${value.slice(0, pos)}${insert}${value.slice(pos)}`;
      updateValue(next);
      requestAnimationFrame(() => {
        const nextPos = pos + insert.length;
        el.setSelectionRange(nextPos, nextPos);
      });
    }
  };

  const previewHtml = tab === 'preview' ? toSafeHtml(value, 'markdown') : '';
  const toolBtn = 'rounded px-1.5 py-1 text-xs font-medium text-ink-subtle hover:bg-hover hover:text-ink';

  return (
    <div
      onDragEnter={(e) => {
        if (!allowUpload || !hasDraggedFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!allowUpload || !hasDraggedFiles(e)) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!allowUpload || !hasDraggedFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!allowUpload || !hasDraggedFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragging(false);
        uploadFiles(e.dataTransfer?.files);
      }}
      className={`relative overflow-hidden rounded-[3px] border-2 bg-surface focus-within:border-brand ${
        dragging ? 'border-brand ring-2 ring-brand/30' : 'border-line'
      }`}
    >
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
          {uploadingCount > 0 && <span className="ml-1 animate-pulse text-xs text-brand-ink">{t('uploading')}</span>}
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
            {allowUpload && (
              <>
                <button type="button" onClick={() => fileInputRef.current?.click()} title={t('mdImage')} aria-label={t('mdImage')} className={toolBtn}>
                  <Icon name="image" size={12} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    uploadFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-8 z-10 flex items-center justify-center bg-brand-subtle/75 text-xs font-semibold text-brand-ink">
          {t('mdDropHint')}
        </div>
      )}
      {tab === 'write' ? (
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => updateValue(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
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
