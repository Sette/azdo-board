import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB, attachmentUrl } from '../api.js';
import { fmtBytes, fmtDateTime, isImageFileName } from '../lib/format.js';
import { useAddAttachment, useRemoveAttachment } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

export function hasDraggedFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

export function normalizeUploadFile(file) {
  if (!file) return file;
  const rawName = String(file.name || '').trim();
  if (rawName && !/^image(\.[a-z0-9]+)?$/i.test(rawName)) return file;
  const mimeExt = String(file.type || '').split('/')[1]?.split('+')[0]?.replace('jpeg', 'jpg') || 'png';
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return new File([file], `image-${stamp}.${mimeExt}`, { type: file.type || 'image/png' });
}

export function validateAttachmentFile(file, t) {
  const name = file?.name || 'file';
  if (!file || !file.size) return t('fileEmpty', { name });
  if (file.size > MAX_ATTACHMENT_BYTES) return t('fileTooLarge', { name, max: MAX_ATTACHMENT_MB });
  return null;
}

function fileExtLabel(name = '') {
  const parts = String(name).split('.');
  if (parts.length < 2) return 'FILE';
  return parts.pop().slice(0, 4).toUpperCase() || 'FILE';
}

export function ImageLightbox({ src, alt, downloadUrl, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!src) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div
      data-lightbox="true"
      role="dialog"
      aria-label={alt || t('attachments')}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mb-3 flex w-full max-w-5xl items-center justify-between gap-3 rounded bg-surface-overlay/95 px-3 py-2 text-sm text-ink shadow-lg">
        <span className="truncate font-medium">{alt}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={alt || true}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-subtle hover:bg-hover hover:text-ink"
              title={t('downloadAttachment', { name: alt || '' })}
            >
              <Icon name="download" size={14} />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-subtle hover:bg-hover hover:text-ink"
            aria-label={t('close')}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>
      <img src={src} alt={alt || ''} className="max-h-[82vh] max-w-[92vw] rounded bg-surface object-contain shadow-2xl" />
    </div>
  );
}

export function AttachmentsSection({ item, onPreviewImage }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState([]);
  const [confirmingKey, setConfirmingKey] = useState(null);
  const addMut = useAddAttachment();
  const removeMut = useRemoveAttachment();

  const attachments = item.attachments || [];

  const handleFiles = async (fileList) => {
    const selected = Array.from(fileList || []).map(normalizeUploadFile);
    if (!selected.length) return;
    for (const file of selected) {
      const errMsg = validateAttachmentFile(file, t);
      if (errMsg) {
        toast.error(errMsg);
        continue;
      }
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setUploading((cur) => [...cur, { uid, name: file.name, size: file.size }]);
      try {
        await addMut.mutateAsync({ id: item.id, file });
        toast.success(t('attachmentAddedToast', { name: file.name }));
      } catch (err) {
        toast.error(t('uploadFailed', { name: file.name, message: err.message }));
      } finally {
        setUploading((cur) => cur.filter((u) => u.uid !== uid));
      }
    }
  };

  const onRemove = async (att) => {
    if (!att.id) return;
    setConfirmingKey(null);
    try {
      await removeMut.mutateAsync({ id: item.id, attachmentId: att.id });
      toast.info(t('attachmentRemovedToast', { name: att.name }));
    } catch (err) {
      toast.error(t('attachmentRemoveFailed', { message: err.message }));
    }
  };

  const onDragEnter = (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
  };
  const onDragLeave = (e) => {
    if (!hasDraggedFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer?.files);
  };

  return (
    <section
      className="mb-6"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-subtle">
          <span>{t('attachments')}</span>
          {attachments.length > 0 && (
            <span className="rounded-full bg-column px-1.5 py-0.2 text-xs font-medium text-ink-muted">{attachments.length}</span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-hover"
        >
          <Icon name="paperclip" size={13} />
          <span>{t('attachFiles')}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {attachments.length === 0 && uploading.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`flex w-full items-center justify-center gap-2 rounded border border-dashed px-3 py-2.5 text-xs transition-colors ${
            dragging
              ? 'border-brand bg-brand-subtle/40 font-medium text-brand-ink'
              : 'border-line bg-sunken/40 text-ink-muted hover:border-brand hover:text-ink'
          }`}
        >
          <Icon name="upload" size={13} />
          <span>{dragging ? t('dropActiveHint') : t('dropFilesHint', { max: MAX_ATTACHMENT_MB })}</span>
        </button>
      ) : (
        <div
          className={`rounded transition-colors ${
            dragging ? 'ring-2 ring-brand bg-brand-subtle/20 p-1.5 -m-1.5' : ''
          }`}
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attachments.map((att) => {
              const key = att.id || att.url;
              const isImg = Boolean(att.id && isImageFileName(att.name));
              const inlineHref = att.id ? attachmentUrl(att.id, att.name) : att.url;
              const downloadHref = att.id ? attachmentUrl(att.id, att.name, { download: true }) : att.url;
              const confirming = confirmingKey === key;

              return (
                <li
                  key={key}
                  className="group flex items-center gap-2.5 rounded border border-line bg-surface p-2 hover:bg-sunken"
                >
                  {isImg ? (
                    <button
                      type="button"
                      onClick={() => onPreviewImage?.({ src: inlineHref, alt: att.name, downloadUrl: downloadHref })}
                      className="h-12 w-16 shrink-0 overflow-hidden rounded border border-line bg-sunken"
                      title={t('previewAttachment', { name: att.name })}
                    >
                      <img src={inlineHref} alt={att.name} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <a
                      href={downloadHref}
                      download={att.name}
                      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded border border-line bg-sunken text-[10px] font-bold text-ink-subtle hover:text-brand-ink"
                      title={t('downloadAttachment', { name: att.name })}
                    >
                      <Icon name="file" size={14} />
                      <span className="mt-0.5">{fileExtLabel(att.name)}</span>
                    </a>
                  )}

                  <div className="min-w-0 flex-1">
                    {isImg ? (
                      <button
                        type="button"
                        onClick={() => onPreviewImage?.({ src: inlineHref, alt: att.name, downloadUrl: downloadHref })}
                        className="block max-w-full truncate text-left text-sm font-medium hover:text-brand-ink hover:underline"
                      >
                        {att.name}
                      </button>
                    ) : (
                      <a
                        href={downloadHref}
                        download={att.name}
                        className="block truncate text-sm font-medium hover:text-brand-ink hover:underline"
                      >
                        {att.name}
                      </a>
                    )}
                    <div className="truncate text-xs text-ink-muted">
                      {[att.size != null ? fmtBytes(att.size) : null, att.createdDate ? fmtDateTime(att.createdDate, locale) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {confirming ? (
                      <div className="flex items-center gap-1" data-editing="true">
                        <button
                          type="button"
                          disabled={removeMut.isPending}
                          onClick={() => onRemove(att)}
                          className="rounded bg-danger-solid px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {t('confirmRemove')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingKey(null)}
                          className="rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
                          aria-label={t('cancel')}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <a
                          href={downloadHref}
                          download={att.name}
                          className="rounded p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
                          title={t('downloadAttachment', { name: att.name })}
                          aria-label={t('downloadAttachment', { name: att.name })}
                        >
                          <Icon name="download" size={14} />
                        </a>
                        {att.id && (
                          <button
                            type="button"
                            onClick={() => setConfirmingKey(key)}
                            className="rounded p-1.5 text-ink-muted hover:bg-danger-bg hover:text-danger-ink"
                            title={t('removeAttachment', { name: att.name })}
                            aria-label={t('removeAttachment', { name: att.name })}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}

            {uploading.map((u) => (
              <li key={u.uid} className="flex items-center gap-2.5 rounded border border-dashed border-brand bg-brand-subtle/20 p-2">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-sunken text-brand-ink">
                  <Icon name="upload" size={15} className="animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.name}</div>
                  <div className="text-xs text-ink-muted">
                    {fmtBytes(u.size)} · {t('uploading')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function CreateAttachmentsField({ files, onChange, disabled = false }) {
  const { t } = useI18n();
  const toast = useToast();
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: isImageFileName(file.name) ? URL.createObjectURL(file) : null,
      })),
    [files],
  );

  useEffect(
    () => () => {
      for (const p of previews) if (p.url) URL.revokeObjectURL(p.url);
    },
    [previews],
  );

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).map(normalizeUploadFile);
    if (!incoming.length) return;
    const valid = [];
    for (const file of incoming) {
      const errMsg = validateAttachmentFile(file, t);
      if (errMsg) toast.error(errMsg);
      else valid.push(file);
    }
    if (valid.length) onChange([...files, ...valid]);
  };

  return (
    <div
      onDragEnter={(e) => {
        if (!hasDraggedFiles(e) || disabled) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!hasDraggedFiles(e) || disabled) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasDraggedFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasDraggedFiles(e) || disabled) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(e.dataTransfer?.files);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={`flex w-full items-center justify-center gap-2 rounded-[3px] border-2 border-dashed px-3 py-2 text-xs transition-colors disabled:opacity-60 ${
          dragging
            ? 'border-brand bg-brand-subtle/40 font-medium text-brand-ink'
            : 'border-line bg-sunken text-ink-muted hover:border-brand hover:text-ink'
        }`}
      >
        <Icon name="paperclip" size={13} />
        <span>{dragging ? t('dropActiveHint') : t('dropFilesHint', { max: MAX_ATTACHMENT_MB })}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {previews.length > 0 && (
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {previews.map((p, idx) => (
            <li key={`${p.file.name}-${p.file.size}-${idx}`} className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5">
              {p.url ? (
                <img src={p.url} alt={p.file.name} className="h-8 w-10 shrink-0 rounded border border-line object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-sunken text-[9px] font-bold text-ink-subtle">
                  {fileExtLabel(p.file.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{p.file.name}</div>
                <div className="text-[11px] text-ink-muted">{fmtBytes(p.file.size)}</div>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                className="rounded p-1 text-ink-muted hover:bg-danger-bg hover:text-danger-ink"
                aria-label={t('removeAttachment', { name: p.file.name })}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
