import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCreateItem, useItemParam, useMeta, useParents, usePeople } from '../lib/hooks.js';
import { prefs } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';
import { useToast } from './Toast.jsx';
import TypeIcon from './TypeIcon.jsx';

const CreateContext = createContext(() => {});
export const useOpenCreate = () => useContext(CreateContext);

export function CreateProvider({ children }) {
  const [defaults, setDefaults] = useState(null);
  const open = useCallback((d = {}) => setDefaults(d), []);
  return (
    <CreateContext.Provider value={open}>
      {children}
      {defaults && <CreateModal defaults={defaults} onClose={() => setDefaults(null)} />}
    </CreateContext.Provider>
  );
}

const inputCls = 'w-full rounded-[3px] border-2 border-line bg-sunken px-2 py-1.5 text-sm outline-none focus:border-brand focus:bg-surface';

function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-subtle">
        {label}
        {required && <span className="ml-0.5 text-[#de350b]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

function CreateModal({ defaults, onClose }) {
  const { t, tl, typeLabel } = useI18n();
  const { data: meta } = useMeta();
  // Tags de planejamento da configuração: nunca são herdadas do pai.
  const planningTags = meta?.planning?.options || [];
  const { data: people = [] } = usePeople();
  const create = useCreateItem();
  const toast = useToast();
  const { open: openItem } = useItemParam();

  const currentSprint = meta?.sprints.find((s) => s.id === meta.currentSprintId);
  const [type, setType] = useState(defaults.type || prefs.get('lastType', 'Product Backlog Item'));
  const [form, setForm] = useState(() => ({
    title: '',
    description: '',
    assignee: defaults.assignee ?? (meta?.me || ''),
    iterationPath: defaults.iterationPath ?? currentSprint?.path ?? '',
    parentId: defaults.parentId ? String(defaults.parentId) : '',
    tags: (defaults.tags || []).filter((tag) => !planningTags.includes(tag)).join(', '),
    planning: '',
  }));
  const [extra, setExtra] = useState({});
  const [error, setError] = useState('');

  const rules = meta?.typeRules?.[type] || {};
  const defs = useMemo(() => (meta?.createFields?.[type] || []).filter((d) => d.key !== 'planning'), [meta, type]);
  const planningDef = meta?.createFields?.[type]?.find((d) => d.key === 'planning');
  const { data: parents = [], isLoading: loadingParents } = useParents(rules.parentType);

  // Valores lembrados da última criação para os campos de seleção do processo.
  useEffect(() => {
    const remembered = prefs.get(`fields:${type}`, {});
    const init = {};
    for (const d of defs) init[d.key] = remembered[d.key] ?? d.default ?? '';
    setExtra(init);
  }, [type, defs]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Ao escolher o pai: herda a tag de projeto; a Task herda também responsável e sprint do PBI.
  const chooseParent = (e) => {
    const parentId = e.target.value;
    const p = parents.find((x) => String(x.id) === parentId);
    setForm((f) => {
      const next = { ...f, parentId };
      if (!p) return next;
      const projectTags = p.tags.filter((tag) => !planningTags.includes(tag));
      if (!f.tags.trim() && projectTags.length) next.tags = projectTags.join(', ');
      if (rules.inheritFromParent) {
        if (p.assignee?.email) next.assignee = p.assignee.email;
        if (p.iterationPath) next.iterationPath = p.sprint ? p.iterationPath : meta?.project;
      }
      return next;
    });
  };
  const setX = (k) => (e) => setExtra((x) => ({ ...x, [k]: e.target.value }));

  const sprints = meta?.sprints || [];
  const sprintOptions = [
    { value: meta?.project || '', label: t('backlogNoSprint') },
    ...[...sprints].reverse().filter((s) => s.timeFrame !== 0 || s.path === form.iterationPath).map((s) => ({
      value: s.path,
      label: `${s.name}${s.timeFrame === 1 ? ` (${t('current')})` : ''}`,
    })),
  ];

  async function submit(e) {
    e.preventDefault();
    setError('');
    const missing = [];
    if (!form.title.trim()) missing.push(t('summary'));
    if (rules.descriptionRequired && !form.description.trim()) missing.push(t('description'));
    if (planningDef?.required && !form.planning) missing.push(tl(planningDef.label));
    if (rules.parentRequired && !form.parentId) missing.push(t('parent', { type: typeLabel(rules.parentType) }));
    for (const d of defs) if (d.required && (extra[d.key] === '' || extra[d.key] === undefined)) missing.push(tl(d.label));
    if (missing.length) {
      setError(t('fill', { fields: missing.join(', ') }));
      return;
    }
    const body = {
      type,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      assignee: form.assignee || undefined,
      iterationPath: form.iterationPath || undefined,
      parentId: form.parentId ? Number(form.parentId) : undefined,
      tags: form.tags.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean),
      planning: form.planning || undefined,
    };
    for (const d of defs) {
      const v = extra[d.key];
      if (v !== '' && v !== undefined) body[d.key] = d.input === 'number' || d.numeric ? Number(v) : v;
    }
    try {
      const item = await create.mutateAsync(body);
      prefs.set('lastType', type);
      prefs.set(`fields:${type}`, Object.fromEntries(defs.filter((d) => d.options).map((d) => [d.key, extra[d.key]])));
      toast.success(t('createdToast', { id: item.id }));
      onClose();
      if (defaults.openAfter !== false) openItem(item.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const peopleOptions = people.some((p) => p.email === meta?.me) || !meta?.me ? people : [{ name: meta.me, email: meta.me }, ...people];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#091e427a] p-4 pt-12" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="w-full max-w-2xl rounded-md bg-surface shadow-2xl" aria-label={t('createTitle')} data-create-modal="true">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-xl font-medium">{t('createTitle')}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-hover" aria-label={t('close')}>
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          <Field label={t('type')} required>
            <div className="flex gap-2">
              {(meta?.createTypes || meta?.types || []).map((ty) => (
                <button
                  type="button"
                  key={ty}
                  onClick={() => {
                    setType(ty);
                    setForm((f) => ({ ...f, parentId: ty === type ? f.parentId : defaults.type === ty ? f.parentId : '' }));
                  }}
                  className={`flex items-center gap-2 rounded-[3px] border-2 px-3 py-1.5 text-sm ${ty === type ? 'border-brand bg-brand-subtle' : 'border-line hover:bg-hover'}`}
                >
                  <TypeIcon type={ty} /> {typeLabel(ty)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('summary')} required>
            <input autoFocus value={form.title} onChange={set('title')} className={inputCls} maxLength={255} />
          </Field>
          <Field label={t('description')} required={rules.descriptionRequired} hint={t('markdownOk')}>
            <textarea value={form.description} onChange={set('description')} rows={5} className={`${inputCls} font-mono text-[13px]`} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('assignee')}>
              <select value={form.assignee} onChange={set('assignee')} className={inputCls}>
                <option value="">{t('unassigned')}</option>
                {peopleOptions.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('sprint')}>
              <select value={form.iterationPath} onChange={set('iterationPath')} className={inputCls}>
                {sprintOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {rules.parentType && (
              <Field label={t('parent', { type: typeLabel(rules.parentType) })} required={rules.parentRequired}>
                <select value={form.parentId} onChange={chooseParent} className={inputCls}>
                  <option value="">{loadingParents ? t('loading') : t('none')}</option>
                  {defaults.parentId && !parents.some((p) => p.id === Number(defaults.parentId)) && (
                    <option value={String(defaults.parentId)}>#{defaults.parentId}</option>
                  )}
                  {parents.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      #{p.id} {p.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {planningDef && (
              <Field label={tl(planningDef.label)} required={planningDef.required}>
                <div className="flex gap-2">
                  {planningDef.options.map((o) => (
                    <button
                      type="button"
                      key={o}
                      onClick={() => setForm((f) => ({ ...f, planning: o }))}
                      className={`flex-1 rounded-[3px] border-2 px-3 py-1.5 text-sm ${form.planning === o ? 'border-brand bg-brand-subtle' : 'border-line hover:bg-hover'}`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label={t('tags')} hint={t('tagsHint')}>
              <input value={form.tags} onChange={set('tags')} className={inputCls} />
            </Field>
            {defs.map((d) => (
              <div key={d.key} className={d.input === 'rich' ? 'sm:col-span-2' : ''}>
              <Field label={tl(d.label)} required={d.required} hint={d.input === 'rich' ? t('markdownOk') : undefined}>
                {d.input === 'rich' ? (
                  <textarea value={extra[d.key] ?? ''} onChange={setX(d.key)} rows={4} className={`${inputCls} font-mono text-[13px]`} />
                ) : d.options ? (
                  <select value={extra[d.key] ?? ''} onChange={setX(d.key)} className={inputCls}>
                    <option value="">{t('select')}</option>
                    {d.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type={d.input === 'number' ? 'number' : 'text'} min="0" step="any" value={extra[d.key] ?? ''} onChange={setX(d.key)} className={inputCls} />
                )}
              </Field>
              </div>
            ))}
          </div>
          {error && <div className="rounded-[3px] bg-[#ffebe6] px-3 py-2 text-sm text-[#ae2e24]">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-[3px] px-3 py-1.5 text-sm font-medium text-ink-subtle hover:bg-hover">
            {t('cancel')}
          </button>
          <button type="submit" disabled={create.isPending} className="rounded-[3px] bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60">
            {create.isPending ? t('creating') : t('create')}
          </button>
        </div>
      </form>
    </div>
  );
}

