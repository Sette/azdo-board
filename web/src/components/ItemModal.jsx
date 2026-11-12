import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { fmtDateTime, stateCategory } from '../lib/format.js';
import { useItemParam, useMeta, usePeople } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import { toEditableMarkdown, toggleTaskCheckbox, toSafeHtml } from '../lib/rich.js';
import Avatar from './Avatar.jsx';
import { BlockedBadge } from './Card.jsx';
import { useOpenCreate } from './CreateModal.jsx';
import Dropdown from './Dropdown.jsx';
import Icon from './Icon.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';
import { ItemModalSkeleton } from './Skeleton.jsx';
import { useSaveItem } from './SaveItem.jsx';
import StateLozenge from './StateLozenge.jsx';
import { useToast } from './Toast.jsx';
import TypeIcon from './TypeIcon.jsx';

// Campos da configuração que valem para o tipo do item.
const defsFor = (meta, type, pred = () => true) => (meta?.fieldDefs || []).filter((d) => d.types?.includes(type) && pred(d));
const appliesTo = (rule, type) => rule === true || (Array.isArray(rule) && rule.includes(type));
const isEmptyValue = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && 'value' in v && !v.value);

export default function ItemModal() {
  const { itemId, close } = useItemParam();
  useEffect(() => {
    if (!itemId) return undefined;
    const onKey = (e) =>
      e.key === 'Escape' &&
      !document.querySelector('[data-editing="true"], [data-create-modal], [data-required-dialog], [data-command-palette], [data-shortcuts-modal]') &&
      close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [itemId, close]);
  if (!itemId) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-backdrop p-4 pt-6 sm:pt-8" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-line bg-surface-overlay shadow-2xl" role="dialog" aria-label={`#${itemId}`}>
        <ItemView id={itemId} onClose={close} />
      </div>
    </div>
  );
}

function ItemView({ id, onClose }) {
  const { t, tl, typeLabel } = useI18n();
  const { data: meta } = useMeta();
  const { data: item, isLoading, error } = useQuery({ queryKey: ['item', String(id)], queryFn: () => api.item(id) });
  const { save: saveItem, pending } = useSaveItem();
  const { open } = useItemParam();
  const toast = useToast();
  const [copied, setCopied] = useState(null);

  if (isLoading) return <ItemModalSkeleton id={id} />;
  if (error)
    return (
      <div className="p-10 text-center">
        <p className="text-danger-ink">{error.message}</p>
        <button onClick={onClose} className="mt-4 text-brand-ink hover:underline">
          {t('close')}
        </button>
      </div>
    );

  const save = (changes, optimistic) => saveItem(item, changes, optimistic);
  const saveRich = (key) => (v) => save({ [key]: v }, { [key]: { value: v, format: 'markdown' } });
  const richDefs = defsFor(meta, item.type, (d) => d.input === 'rich');
  const linkDefs = defsFor(meta, item.type, (d) => d.input === 'links');

  const copyText = (kind, text, msg) => {
    navigator.clipboard?.writeText(text);
    setCopied(kind);
    toast.info(msg);
    setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1500);
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-3 text-sm text-ink-subtle">
        <div className="flex min-w-0 items-center gap-1.5">
          {item.parent && (
            <>
              <button onClick={() => open(item.parent.id)} className="flex min-w-0 items-center gap-1.5 hover:underline">
                <TypeIcon type={item.parent.type} size={14} />
                <span className="truncate">
                  {item.parent.id} {item.parent.title}
                </span>
              </button>
              <span className="text-ink-muted">/</span>
            </>
          )}
          <TypeIcon type={item.type} size={14} />
          <a href={item.webUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 hover:underline" title={t('openInAzure')}>
            {typeLabel(item.type)} {item.id} <Icon name="external-link" size={12} />
          </a>
          <button
            type="button"
            onClick={() => copyText('key', `#${item.id}`, t('copiedToast', { text: `#${item.id}` }))}
            title={t('copyKey', { id: item.id })}
            aria-label={t('copyKey', { id: item.id })}
            className="rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
          >
            <Icon name={copied === 'key' ? 'check' : 'copy'} size={13} className={copied === 'key' ? 'text-success-ink' : ''} />
          </button>
          {item.blocked && <BlockedBadge />}
        </div>
        <div className="flex items-center gap-1.5">
          {pending && <span className="text-xs text-ink-muted">{t('saving')}</span>}
          <button
            type="button"
            onClick={() => copyText('link', item.webUrl, t('linkCopiedToast'))}
            className="rounded p-1.5 text-ink-subtle hover:bg-hover hover:text-ink"
            title={t('copyLink')}
            aria-label={t('copyLink')}
          >
            <Icon name={copied === 'link' ? 'check' : 'link'} size={15} className={copied === 'link' ? 'text-success-ink' : ''} />
          </button>
          <button onClick={onClose} className="rounded p-1.5 text-ink-subtle hover:bg-hover hover:text-ink" aria-label={t('close')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <InlineTitle value={item.title} onSave={(title) => save({ title }, { title })} />
            <RichField label={t('description')} field={item.description} onSave={saveRich('description')} />
            {item.type !== 'Task' && <RichField label={t('acceptanceCriteria')} field={item.acceptanceCriteria} onSave={saveRich('acceptanceCriteria')} />}
            {richDefs.map((d) => (
              <RichField
                key={d.key}
                label={tl(d.label)}
                hint={tl(d.hint && typeof d.hint === 'object' && !('en' in d.hint) && !('pt' in d.hint) ? d.hint[item.type] : d.hint)}
                field={item[d.key]}
                onSave={saveRich(d.key)}
              />
            ))}
            {linkDefs.map((d) => (
              <LinksField key={d.key} def={d} item={item} save={save} />
            ))}
            {item.type !== 'Task' && <Children item={item} meta={meta} />}
            <Comments item={item} />
          </div>
          <Details item={item} meta={meta} save={save} />
        </div>
      </div>
    </>
  );
}

function InlineTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing)
    return (
      <h1 onClick={() => setEditing(true)} className="-mx-2 mb-4 cursor-text rounded px-2 py-1 text-2xl font-medium hover:bg-hover">
        {value}
      </h1>
    );
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    else setDraft(value);
  };
  return (
    <input
      autoFocus
      data-editing="true"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="-mx-2 mb-4 w-[calc(100%+1rem)] rounded border-2 border-brand px-2 py-0.5 text-2xl font-medium outline-none"
    />
  );
}

function RichField({ label, field, onSave, hint }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const html = toSafeHtml(field?.value, field?.format, { interactiveTasks: true });
  const start = () => {
    setDraft(toEditableMarkdown(field?.value, field?.format));
    setEditing(true);
  };
  const onRichClick = (e) => {
    const box = e.target.closest('input[type="checkbox"]');
    if (box) {
      e.stopPropagation();
      const idx = [...e.currentTarget.querySelectorAll('input[type="checkbox"]')].indexOf(box);
      if (idx >= 0) onSave(toggleTaskCheckbox(field?.value, field?.format, idx, box.checked));
      return;
    }
    if (e.target.closest('a')) return;
    start();
  };
  const commit = () => {
    setEditing(false);
    onSave(draft);
  };
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-ink-subtle">
        {label}
        {hint && <span className="ml-2 font-normal text-ink-muted">{hint}</span>}
      </h3>
      {editing ? (
        <div data-editing="true">
          <MarkdownEditor
            autoFocus
            value={draft}
            onChange={setDraft}
            onSubmit={commit}
            onCancel={() => setEditing(false)}
            rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={commit} className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
              {t('save')}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-[3px] px-3 py-1.5 text-sm hover:bg-hover">
              {t('cancel')}
            </button>
            <span className="text-xs text-ink-muted">{t('markdownSaveHint')}</span>
          </div>
        </div>
      ) : html ? (
        <div onClick={onRichClick} className="prose-azdo -mx-2 cursor-text rounded px-2 py-1 hover:bg-sunken" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <button onClick={start} className="-mx-2 w-full rounded px-2 py-1 text-left text-ink-muted hover:bg-hover">
          {t('addField', { label: label.toLowerCase() })}
        </button>
      )}
    </section>
  );
}

function Children({ item, meta }) {
  const { t } = useI18n();
  const openCreate = useOpenCreate();
  const { open } = useItemParam();
  const [hideDone, setHideDone] = useState(false);
  const done = item.children.filter((c) => stateCategory(meta, c.type, c.state) === 'Completed').length;
  const hours = item.children.reduce((a, c) => a + (c.completedWork || 0), 0);
  const visibleChildren = hideDone ? item.children.filter((c) => stateCategory(meta, c.type, c.state) !== 'Completed') : item.children;
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-subtle">{t('children')}</h3>
        <div className="flex items-center gap-1">
          {item.children.length > 6 && done > 0 && (
            <button onClick={() => setHideDone((h) => !h)} className="rounded px-2 py-1 text-xs text-ink-muted hover:bg-hover hover:text-ink">
              {hideDone ? t('showCompleted', { n: item.children.length }) : t('hideCompleted', { n: done })}
            </button>
          )}
          <button
            onClick={() => openCreate({ type: 'Task', parentId: item.id, iterationPath: item.iterationPath, tags: item.tags, assignee: item.assignee?.email, openAfter: false })}
            className="rounded px-2 py-1 text-sm hover:bg-hover"
            title={t('createChildTask')}
          >
            {t('childTask')}
          </button>
        </div>
      </div>
      {item.children.length > 0 ? (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-column">
              <div className="h-full bg-success-solid" style={{ width: `${(done / item.children.length) * 100}%` }} />
            </div>
            {t('percentDone', { n: Math.round((done / item.children.length) * 100) })}
            <span className="ml-2">· {t('hoursLogged', { n: Math.round(hours * 100) / 100 })}</span>
          </div>
          <ul className="divide-y divide-line rounded border border-line">
            {visibleChildren.map((c) => (
              <li key={c.id}>
                <button onClick={() => open(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sunken">
                  <TypeIcon type={c.type} size={14} />
                  <span className="shrink-0 text-xs text-ink-muted">{c.id}</span>
                  {c.blocked && <BlockedBadge />}
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.type === 'Task' && (
                    <span className="shrink-0 text-xs text-ink-muted" title="Completed Work / Remaining Work">
                      {c.completedWork != null
                        ? `${c.completedWork}h${c.remainingWork != null ? ` / ${c.remainingWork}h` : ''}`
                        : c.remainingWork != null
                          ? `0h / ${c.remainingWork}h`
                          : stateCategory(meta, c.type, c.state) === 'Completed'
                            ? '⚠ 0h'
                            : ''}
                    </span>
                  )}
                  <Avatar person={c.assignee} size={20} />
                  <StateLozenge state={c.state} category={stateCategory(meta, c.type, c.state)} />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{t('noChildren')}</p>
      )}
    </section>
  );
}

function Comments({ item }) {
  const { t, locale } = useI18n();
  const { data: meta } = useMeta();
  const { data: people = [] } = usePeople();
  const [text, setText] = useState('');
  const [composing, setComposing] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const mePerson =
    people.find((p) => meta?.me && p.email?.toLowerCase() === meta.me.toLowerCase()) ||
    (meta?.me ? { name: meta.me.split('@')[0], email: meta.me } : null);
  const add = useMutation({
    mutationFn: () => api.comment(item.id, text),
    onSuccess: (comments) => {
      setText('');
      setComposing(false);
      qc.setQueryData(['item', String(item.id)], (old) => (old ? { ...old, comments } : old));
    },
    onError: (err) => toast.error(t('commentNotSaved', { message: err.message })),
  });
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-ink-subtle">{t('comments')}</h3>
      <div className="mb-5 flex gap-3">
        <Avatar person={mePerson} size={32} />
        <div className="min-w-0 flex-1">
          {composing || text ? (
            <div data-editing="true">
              <MarkdownEditor
                compact
                autoFocus
                value={text}
                onChange={setText}
                onSubmit={() => text.trim() && add.mutate()}
                onCancel={() => {
                  setText('');
                  setComposing(false);
                }}
                placeholder={t('addComment')}
                rows={4}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => text.trim() && add.mutate()}
                  disabled={add.isPending || !text.trim()}
                  className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
                >
                  {add.isPending ? t('saving') : t('save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText('');
                    setComposing(false);
                  }}
                  className="rounded-[3px] px-3 py-1.5 text-sm hover:bg-hover"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <textarea
              value={text}
              onFocus={() => setComposing(true)}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('addComment')}
              rows={2}
              className="w-full rounded border-2 border-line bg-surface p-2 text-sm outline-none focus:border-brand"
            />
          )}
        </div>
      </div>
      <ul className="space-y-5">
        {[...item.comments].reverse().map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar person={c.author} size={32} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-sm">
                <span className="font-semibold">{c.author?.name}</span> <span className="text-xs text-ink-muted">{fmtDateTime(c.createdDate, locale)}</span>
              </div>
              <div className="prose-azdo text-sm" dangerouslySetInnerHTML={{ __html: toSafeHtml(c.text, c.format) }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-1.5">
      <span className="text-xs font-semibold text-ink-subtle">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function NumberField({ value, onSave, suffix }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!editing)
    return (
      <button
        onClick={() => {
          setDraft(value ?? '');
          setEditing(true);
        }}
        className="-mx-1 rounded px-1 py-0.5 text-left text-sm hover:bg-hover"
      >
        {value ?? <span className="text-ink-muted">{t('none')}</span>}
        {value != null && suffix}
      </button>
    );
  const commit = () => {
    setEditing(false);
    const n = draft === '' ? null : Number(draft);
    if (n !== value && (n === null || !Number.isNaN(n))) onSave(n);
  };
  return (
    <input
      autoFocus
      data-editing="true"
      type="number"
      min="0"
      step="any"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-24 rounded border-2 border-brand px-1 py-0.5 text-sm outline-none"
    />
  );
}

function TagsEditor({ tags, onSave }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const tag = draft.trim();
    setDraft('');
    setAdding(false);
    if (tag && !tags.includes(tag)) onSave([...tags, tag]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span key={tag} className="group inline-flex items-center gap-1 rounded-[3px] bg-column px-1.5 py-0.5 text-xs">
          {tag}
          <button onClick={() => onSave(tags.filter((x) => x !== tag))} className="text-ink-muted hover:text-danger-ink" aria-label={t('removeTag', { tag })}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          data-editing="true"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setAdding(false);
          }}
          className="w-28 rounded border-2 border-brand px-1 text-xs outline-none"
        />
      ) : (
        <button onClick={() => setAdding(true)} className="rounded px-1.5 py-0.5 text-xs text-ink-muted hover:bg-hover">
          {t('addTag')}
        </button>
      )}
    </div>
  );
}

// Avisos a partir da configuração: campos com warnIfEmpty, blocksUpdates, warnIfEmptyWhenDone e planejamento.
function processWarnings(item, meta, t, tl) {
  const out = [];
  const done = stateCategory(meta, item.type, item.state) === 'Completed';
  const defs = defsFor(meta, item.type);
  const blocking = defs.filter((d) => d.blocksUpdates && isEmptyValue(item[d.key]));
  if (blocking.length) out.push(t('warnBlocksUpdates', { fields: blocking.map((d) => tl(d.label)).join(', ') }));
  for (const d of defs) {
    if (d.blocksUpdates) continue;
    if (appliesTo(d.warnIfEmpty, item.type) && isEmptyValue(item[d.key])) out.push(t('warnEmpty', { label: tl(d.label) }));
    if (done && appliesTo(d.warnIfEmptyWhenDone, item.type) && isEmptyValue(item[d.key])) out.push(t('warnDoneEmpty', { label: tl(d.label) }));
  }
  const planning = meta?.planning;
  if (planning && meta?.createFields?.[item.type]?.some((f) => f.key === 'planning') && !item.tags.some((tag) => planning.options.includes(tag))) {
    out.push(t('warnPlanning', { options: planning.options.join('/') }));
  }
  if (item.type === 'Task' && done && !item.completedWork && defs.some((d) => d.key === 'completedWork')) out.push(t('warnTaskDoneNoHours'));
  return out;
}

// Campo do processo no painel Detalhes, conforme o tipo de entrada.
function ProcessField({ def, item, save }) {
  const { t } = useI18n();
  const value = item[def.key];
  if (def.input === 'readonly') {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list.length ? (
      <div className="space-y-0.5 text-xs">
        {list.map((v) => (
          <div key={v}>{v}</div>
        ))}
      </div>
    ) : (
      <span className="text-sm text-ink-muted">—</span>
    );
  }
  if (def.key === 'completedWork' && item.type === 'Task') return <HoursField item={item} save={save} />;
  if (def.options) {
    const options = value != null && !def.options.includes(String(value)) ? [String(value), ...def.options] : def.options;
    return (
      <Dropdown
        searchable={options.length > 8}
        trigger={<span className="-mx-1 block rounded px-1 py-0.5 text-left text-sm hover:bg-hover">{value ?? <span className="text-ink-muted">{t('none')}</span>}</span>}
        value={value == null ? null : String(value)}
        options={options.map((o) => ({ value: o, label: o }))}
        onSelect={(v) => {
          const parsed = def.numeric ? Number(v) : v;
          save({ [def.key]: parsed }, { [def.key]: parsed });
        }}
        width="w-72"
        align="right"
      />
    );
  }
  return <NumberField value={value} suffix={def.suffix ? ` ${def.suffix}` : ''} onSave={(v) => save({ [def.key]: v }, { [def.key]: v })} />;
}

// Completed Work da Task: sempre soma (horas negativas corrigem).
function HoursField({ item, save }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const h = Number(draft);
    setAdding(false);
    setDraft('');
    if (!draft || Number.isNaN(h) || h === 0) return;
    save({ completedWorkAdd: h });
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{item.completedWork ?? 0} h</span>
      {adding ? (
        <input
          autoFocus
          data-editing="true"
          type="number"
          step="0.25"
          placeholder="+h"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setAdding(false);
          }}
          className="w-20 rounded border-2 border-brand px-1 py-0.5 text-sm outline-none"
          title={t('hoursToAdd')}
        />
      ) : (
        <button onClick={() => setAdding(true)} className="rounded px-1.5 py-0.5 text-xs text-brand hover:bg-hover">
          {t('logHours')}
        </button>
      )}
    </div>
  );
}

// Campo de links (input "links"): só acrescenta, nunca reordena nem apaga.
function LinksField({ def, item, save }) {
  const { t, tl } = useI18n();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const html = toSafeHtml(item[def.key]?.value, 'html');
  const submit = (e) => {
    e.preventDefault();
    if (!/^https?:\/\//i.test(url.trim())) return;
    save({ [`${def.key}Add`]: { url: url.trim(), title: title.trim() } });
    setAdding(false);
    setUrl('');
    setTitle('');
  };
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-subtle">{tl(def.label)}</h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="rounded px-2 py-1 text-sm hover:bg-hover">
            {t('addLink')}
          </button>
        )}
      </div>
      {html ? (
        <div className="prose-azdo text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        !adding && (
          <p className="text-sm text-ink-muted">
            {t('noLinks')} {tl(def.hint)}
          </p>
        )
      )}
      {adding && (
        <form onSubmit={submit} data-editing="true" className="mt-2 space-y-2">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/<owner>/<repo>/pull/<n>"
            className="w-full rounded border-2 border-line px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('linkTitle')} className="w-full rounded border-2 border-line px-2 py-1 text-sm outline-none focus:border-brand" />
          <div className="flex gap-2">
            <button className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">{t('add')}</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-[3px] px-3 py-1.5 text-sm hover:bg-hover">
              {t('cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// Botões de bloqueio e de validação (esta só para tipos sem estado de validação próprio).
function FlagButtons({ item, meta, save }) {
  const { t } = useI18n();
  const tagState = meta?.validation?.tagState?.[item.type];
  const typeHasValidationState = (meta?.states?.[item.type] || []).some((s) => meta?.validation?.states?.includes(s.name));
  const done = stateCategory(meta, item.type, item.state) === 'Completed';
  const btn = 'inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-sm font-medium';
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => save({ blocked: !item.blocked }, { blocked: !item.blocked })}
        className={`${btn} ${item.blocked ? 'bg-danger-bg text-danger-ink hover:bg-danger-hover' : 'bg-column text-ink-subtle hover:bg-hover'}`}
      >
        <Icon name="flag" size={14} /> {item.blocked ? t('unflagBlocked') : t('flagBlocked')}
      </button>
      {tagState && !typeHasValidationState && !done && (
        <button
          onClick={() => save({ validation: !item.inValidation }, { inValidation: !item.inValidation, ...(item.inValidation ? {} : { state: tagState }) })}
          className={`${btn} ${item.inValidation ? 'bg-brand-subtle text-brand-ink' : 'bg-column text-ink-subtle hover:bg-hover'}`}
        >
          <Icon name="check-circle" size={14} /> {item.inValidation ? t('leaveValidation') : t('sendToValidation')}
        </button>
      )}
    </div>
  );
}

function Details({ item, meta, save }) {
  const { t, tl, locale } = useI18n();
  const { data: people = [] } = usePeople();
  const states = (meta?.states?.[item.type] || []).filter((s) => s.category !== 'Removed' || s.name === item.state);
  const category = stateCategory(meta, item.type, item.state);
  const sprints = meta?.sprints || [];
  const peopleWithCurrent = item.assignee?.email && !people.some((p) => p.email === item.assignee.email) ? [item.assignee, ...people] : people;
  const warnings = processWarnings(item, meta, t, tl);

  return (
    <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          trigger={
            <span
              className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-sm font-semibold ${
                category === 'Completed' ? 'bg-success-solid text-white' : category === 'InProgress' ? 'bg-brand text-white' : 'bg-column text-ink'
              }`}
            >
              {item.state} <Icon name="chevron-down" size={13} />
            </span>
          }
          value={item.state}
          options={[...states.filter((s) => s.category !== 'Removed'), ...states.filter((s) => s.category === 'Removed')].map((s) => ({
            value: s.name,
            label: s.name,
            icon: <StateLozenge state={s.category === 'Removed' ? '✕' : '●'} category={s.category} />,
          }))}
          onSelect={(state) => save({ state }, { state })}
          width="w-56"
        />
        {item.inValidation && <StateLozenge state={t('inValidation')} category="InProgress" />}
      </div>
      <FlagButtons item={item} meta={meta} save={save} />
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-[3px] bg-warn-bg px-3 py-2 text-xs text-warn-ink">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <Icon name="warning" size={13} className="mt-0.5" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded border border-line px-3 py-2">
        <div className="mb-1 border-b border-line pb-2 text-sm font-semibold">{t('details')}</div>
        <DetailRow label={t('assignee')}>
          <Dropdown
            searchable
            trigger={
              <span className="-mx-1 flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-hover">
                <Avatar person={item.assignee} size={24} />
                <span className="truncate">{item.assignee?.name || t('unassigned')}</span>
              </span>
            }
            value={item.assignee?.email || ''}
            options={[
              { value: '', label: t('unassigned'), icon: <Avatar person={null} size={20} /> },
              ...(meta?.me && item.assignee?.email !== meta.me ? [{ value: meta.me, label: t('assignToMe'), icon: <span className="w-5 text-center">★</span> }] : []),
              ...peopleWithCurrent.map((p) => ({ value: p.email, label: p.name, icon: <Avatar person={p} size={20} /> })),
            ]}
            onSelect={(email) => {
              const person = peopleWithCurrent.find((p) => p.email === email) || (email ? { name: email, email } : null);
              save({ assignee: email || null }, { assignee: person });
            }}
          />
        </DetailRow>
        <DetailRow label={t('sprint')}>
          <Dropdown
            trigger={<span className="-mx-1 block truncate rounded px-1 py-0.5 text-sm hover:bg-hover">{item.sprint || 'Backlog'}</span>}
            value={item.iterationPath}
            options={[
              { value: meta?.project, label: t('backlogNoSprint') },
              ...[...sprints].reverse().map((s) => ({ value: s.path, label: `${s.name}${s.timeFrame === 1 ? ` (${t('current')})` : ''}` })),
            ]}
            onSelect={(iterationPath) => save({ iterationPath }, { iterationPath, sprint: iterationPath.split('\\')[1] || null })}
          />
        </DetailRow>
        {(meta?.detailFields?.[item.type] || []).map((key) => {
          const def = meta.fieldDefs.find((d) => d.key === key);
          return def ? (
            <DetailRow key={key} label={tl(def.label)}>
              <ProcessField def={def} item={item} save={save} />
            </DetailRow>
          ) : null;
        })}
        <DetailRow label={t('priority')}>
          <Dropdown
            trigger={<span className="-mx-1 rounded px-1 py-0.5 text-sm hover:bg-hover">{item.priority ?? '—'}</span>}
            value={item.priority}
            options={[1, 2, 3, 4].map((p) => ({ value: p, label: String(p) }))}
            onSelect={(priority) => save({ priority }, { priority })}
            width="w-24"
          />
        </DetailRow>
        <DetailRow label={t('tags')}>
          <TagsEditor tags={item.tags} onSave={(tags) => save({ tags }, { tags })} />
        </DetailRow>
      </div>
      <div className="space-y-1 px-1 text-xs text-ink-muted">
        <div>{t('createdBy', { date: fmtDateTime(item.createdDate, locale), name: item.createdBy?.name || '' })}</div>
        <div>
          {t('updatedAt', { date: fmtDateTime(item.changedDate, locale) })}
          {item.changedBy ? t('updatedBy', { name: item.changedBy.name }) : ''}
        </div>
        {item.externalLinks?.length > 0 && (
          <div className="pt-2">
            <div className="mb-1 font-semibold text-ink-subtle">{t('links')}</div>
            {item.externalLinks.map((l) => (
              <a key={l.url} href={l.url.startsWith('http') ? l.url : undefined} target="_blank" rel="noreferrer" className="block truncate text-brand hover:underline">
                {l.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
