// Salvar item com as regras do processo:
// - antes do PATCH, se a transição de estado exige campos (TRANSITION_RULES), pede no diálogo;
// - se o Azure recusar com TF401320 (422 + missingFields), pede o campo e reenvia o mesmo patch.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { useMeta, useUpdateItem } from '../lib/hooks.js';
import { useI18n } from '../lib/i18n.jsx';
import Dropdown from './Dropdown.jsx';
import TypeIcon from './TypeIcon.jsx';

const SaveContext = createContext(null);
export const useSaveItem = () => useContext(SaveContext);

const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && 'value' in v && !v.value);

// Campos pedidos pela regra de transição, considerando o estado atual do item.
function transitionFields(meta, item, changes) {
  if (!changes.state || changes.state === item.state) return [];
  const rules = meta?.transitionRules?.[item.type]?.[changes.state] || [];
  return rules.filter((r) => isEmpty(changes[r.key]) && !(r.onlyIfEmpty && !isEmpty(item[r.onlyIfEmpty])));
}

export function SaveItemProvider({ children }) {
  const { data: meta } = useMeta();
  const update = useUpdateItem();
  const [dialog, setDialog] = useState(null);

  const run = useCallback(
    (item, changes, optimistic) =>
      update.mutate(
        { id: item.id, changes: { rev: item.rev, ...changes }, optimistic },
        {
          onError: (err) => {
            if (err.status === 422 && err.missingFields) {
              setDialog({
                item,
                changes,
                optimistic,
                fields: err.missingFields.map((f) => ({ key: f.key, name: f.name, required: true })),
                reason: err.message,
              });
            }
          },
        },
      ),
    [update],
  );

  const save = useCallback(
    (item, changes, optimistic) => {
      const needed = transitionFields(meta, item, changes);
      if (needed.length) setDialog({ item, changes, optimistic, fields: needed, reason: null });
      else run(item, changes, optimistic);
    },
    [meta, run],
  );

  const value = useMemo(() => ({ save, pending: update.isPending }), [save, update.isPending]);
  return (
    <SaveContext.Provider value={value}>
      {children}
      {dialog && (
        <RequiredFieldsDialog
          dialog={dialog}
          meta={meta}
          onCancel={() => setDialog(null)}
          onConfirm={(values) => {
            setDialog(null);
            run(dialog.item, { ...dialog.changes, ...values }, dialog.optimistic);
          }}
        />
      )}
    </SaveContext.Provider>
  );
}

const inputCls = 'w-full rounded-[3px] border-2 border-line bg-sunken px-2 py-1.5 text-sm outline-none focus:border-brand focus:bg-surface';

function RequiredFieldsDialog({ dialog, meta, onCancel, onConfirm }) {
  const { t, tl, typeLabel } = useI18n();
  const { item, changes, reason } = dialog;
  const { data: detail, isLoading } = useQuery({ queryKey: ['item', String(item.id)], queryFn: () => api.item(item.id) });
  // O card do quadro não traz todos os campos: reavalia os "só se vazio" com o item completo.
  const fields = useMemo(
    () => dialog.fields.filter((f) => !(f.onlyIfEmpty && detail && !isEmpty(detail[f.onlyIfEmpty]))),
    [dialog.fields, detail],
  );
  const confirmed = useRef(false);
  const confirm = (values) => {
    if (confirmed.current) return;
    confirmed.current = true;
    onConfirm(values);
  };
  useEffect(() => {
    if (detail && !fields.length && !confirmed.current) {
      confirmed.current = true;
      onConfirm({});
    }
  }, [detail, fields, onConfirm]);
  const defs = useMemo(() => Object.fromEntries((meta?.fieldDefs || []).map((d) => [d.key, d])), [meta]);
  // "<campo>Add" de um campo de links usa a definição do campo base.
  const defFor = (key) => defs[key] || (key?.endsWith('Add') ? defs[key.slice(0, -3)] : undefined);
  const isLinkAdd = (key) => key?.endsWith('Add') && defFor(key)?.input === 'links';
  const [values, setValues] = useState({});
  const [error, setError] = useState('');

  // Sugestões: Story Points = Effort; Completed Work do PBI = soma das tasks.
  useEffect(() => {
    if (!detail) return;
    const init = {};
    for (const f of fields) {
      if (f.key === 'storyPoints') init.storyPoints = detail.storyPoints ?? detail.effort ?? '';
      else if (f.key === 'completedWork') init.completedWork = detail.childrenCompletedWork ?? detail.completedWork ?? '';
      else if (isLinkAdd(f.key)) init[f.key] = { url: '', title: '' };
      else if (f.key) init[f.key] = detail[f.key] ?? '';
    }
    setValues(init);
  }, [detail, fields]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), onCancel());
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const set = (k, v) => setValues((x) => ({ ...x, [k]: v }));
  const unknown = fields.filter((f) => !f.key);

  function submit(e) {
    e.preventDefault();
    const out = {};
    const missing = [];
    for (const f of fields.filter((x) => x.key)) {
      const v = values[f.key];
      if (isLinkAdd(f.key)) {
        if (!v?.url?.trim()) missing.push(t('linkRequired'));
        else out[f.key] = { url: v.url.trim(), title: v.title?.trim() };
        continue;
      }
      if (isEmpty(v) || (typeof v === 'string' && !v.trim())) {
        if (f.required) missing.push(tl(defFor(f.key)?.label) || f.name || f.key);
        continue;
      }
      const numeric = f.key === 'completedWorkAdd' || defs[f.key]?.input === 'number' || defs[f.key]?.numeric;
      out[f.key] = numeric ? Number(v) : v;
    }
    if (out.completedWorkAdd !== undefined && (detail?.completedWork || 0) + out.completedWorkAdd <= 0) {
      missing.push(t('hoursPositive'));
    }
    if (missing.length) {
      setError(t('fill', { fields: missing.join(', ') }));
      return;
    }
    confirm(out);
  }

  const title = changes.state ? t('moveTo', { state: changes.state }) : t('requiredFields');
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-backdrop p-4 pt-20" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-md border border-line bg-surface-overlay shadow-2xl" aria-label={title} data-required-dialog="true">
        <div className="border-b border-line px-6 py-4">
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-subtle">
            <TypeIcon type={item.type} size={14} /> {typeLabel(item.type)} {item.id} · <span className="truncate">{item.title}</span>
          </p>
          {reason && <p className="mt-2 rounded-[3px] bg-warn-bg px-2 py-1 text-xs text-warn-ink">{reason}</p>}
        </div>
        <div className="space-y-4 px-6 py-4">
          {isLoading && <p className="text-sm text-ink-muted">{t('loadingItem')}</p>}
          {detail &&
            fields
              .filter((f) => f.key)
              .map((f) => (
                <FieldInput key={f.key} f={f} def={defFor(f.key)} detail={detail} value={values[f.key]} onChange={(v) => set(f.key, v)} />
              ))}
          {unknown.map((f) => (
            <p key={f.name} className="rounded-[3px] bg-danger-bg px-3 py-2 text-sm text-danger-ink">
              {t('unknownField', { name: f.name })}{' '}
              <a href={detail?.webUrl} target="_blank" rel="noreferrer" className="underline">
                {t('inAzure')}
              </a>
              .
            </p>
          ))}
          {error && <div className="rounded-[3px] bg-danger-bg px-3 py-2 text-sm text-danger-ink">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-3">
          <button type="button" onClick={onCancel} className="rounded-[3px] px-3 py-1.5 text-sm font-medium text-ink-subtle hover:bg-hover">
            {t('cancel')}
          </button>
          <button type="submit" disabled={!detail || unknown.length > 0} className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60">
            {t('save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Label({ children, required, hint }) {
  return (
    <span className="mb-1 block text-xs font-semibold text-ink-subtle">
      {children}
      {required && <span className="ml-0.5 text-danger-ink">*</span>}
      {hint && <span className="ml-2 font-normal text-ink-muted">{hint}</span>}
    </span>
  );
}

function FieldInput({ f, def, detail, value, onChange }) {
  const { t, tl } = useI18n();
  if (f.key === 'completedWorkAdd') {
    const cur = detail.completedWork || 0;
    const add = value === '' || value === undefined ? 0 : Number(value) || 0;
    return (
      <label className="block">
        <Label required hint={tl(f.hint)}>
          {t('hoursToLog')}
        </Label>
        <input autoFocus type="number" step="0.25" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        <span className="mt-1 block text-xs text-ink-muted">
          {t('completedWorkSum', { cur, add, total: Math.round((cur + add) * 100) / 100 })}
        </span>
      </label>
    );
  }
  if (f.key.endsWith('Add') && def?.input === 'links') {
    return (
      <div>
        <Label required hint={tl(f.hint)}>
          {tl(def.label)}
        </Label>
        <input
          autoFocus
          placeholder="https://github.com/<owner>/<repo>/pull/<n>"
          value={value?.url || ''}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          className={`${inputCls} mb-2`}
        />
        <input placeholder={t('linkTitle')} value={value?.title || ''} onChange={(e) => onChange({ ...value, title: e.target.value })} className={inputCls} />
      </div>
    );
  }
  const label = tl(def?.label) || f.name || f.key;
  if (def?.options) {
    const opts = value && !def.options.includes(String(value)) ? [String(value), ...def.options] : def.options;
    return (
      <div>
        <Label required={f.required} hint={tl(f.hint)}>
          {label}
        </Label>
        <Dropdown
          variant="input"
          width="w-full"
          searchable={opts.length > 8}
          placeholder={t('select')}
          value={value === '' || value === undefined ? null : String(value)}
          options={opts.map((o) => ({ value: o, label: o }))}
          onSelect={(v) => onChange(v)}
          ariaLabel={label}
        />
      </div>
    );
  }
  return (
    <label className="block">
      <Label required={f.required} hint={tl(f.hint)}>
        {label}
        {def?.suffix ? ` (${def.suffix})` : ''}
      </Label>
      <input type="number" min="0" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      {f.key === 'completedWork' && detail.childrenCompletedWork != null && Number(value) !== detail.childrenCompletedWork && (
        <button type="button" onClick={() => onChange(detail.childrenCompletedWork)} className="mt-1 text-xs text-brand hover:underline">
          {t('useChildrenSum', { n: detail.childrenCompletedWork })}
        </button>
      )}
    </label>
  );
}
