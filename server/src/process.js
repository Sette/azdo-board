// Regras do processo (campos, criação, transições), lidas de um arquivo JSON.
// O arquivo é process.config.json na raiz (ou o caminho em PROCESS_CONFIG);
// sem ele, vale o process.config.example.json (template Scrum padrão do Azure DevOps).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readProcessConfig(env = process.env) {
  const candidates = [env.PROCESS_CONFIG, path.join(ROOT, 'process.config.json'), path.join(ROOT, 'process.config.example.json')].filter(Boolean);
  for (const file of candidates) {
    const full = path.resolve(ROOT, file);
    if (fs.existsSync(full)) {
      return { file: full, config: JSON.parse(fs.readFileSync(full, 'utf8')) };
    }
  }
  throw new Error(`No process config found (${candidates.join(', ')})`);
}

const isEmpty = (v) => v === undefined || v === null || v === '';

// Monta as regras a partir da configuração. Tudo que o resto do servidor usa sai daqui.
export function loadProcess(config = {}, now = () => new Date()) {
  const fields = (config.fields || []).map((d) => ({ input: 'text', types: [], ...d }));
  const byKey = Object.fromEntries(fields.map((d) => [d.key, d]));
  const planning = config.planning?.options?.length ? { label: { en: 'Planning', pt: 'Planejamento' }, required: true, ...config.planning } : null;
  const typeRules = config.typeRules || {};
  const transitions = config.transitions || {};
  const detailFields = config.detailFields || {};
  const createCfg = config.create || {};
  const links = { prPrefix: '', ...(config.links || {}) };
  // Bloqueio: campo Blocked do Azure nos tipos que o têm (Task no Scrum); tag nos demais.
  const blocked = { field: 'Microsoft.VSTS.CMMI.Blocked', value: 'Yes', fieldTypes: ['Task'], tag: 'blocked', ...(config.blocked || {}) };
  // Validação: estados de validação do processo; tipos sem esse estado usam tag + um estado "em andamento".
  const validation = { states: [], tag: 'validation', tagState: { Task: 'In Progress' }, ...(config.validation || {}) };

  const hasTag = (tags, tag) => (tags || []).some((t) => t.toLowerCase() === String(tag).toLowerCase());
  const withoutTag = (tags, tag) => (tags || []).filter((t) => t.toLowerCase() !== String(tag).toLowerCase());
  const isBlocked = (item) =>
    blocked.fieldTypes.includes(item.type) ? String(item.blockedField || '').toLowerCase() === String(blocked.value).toLowerCase() : hasTag(item.tags, blocked.tag);
  const inValidation = (item) => validation.states.includes(item.state) || (!!validation.tagState[item.type] && hasTag(item.tags, validation.tag));

  // Converte { blocked, validation } em mudanças reais (campo, tags e estado).
  function flagChanges(item, { blocked: b, validation: v }) {
    const out = {};
    let tags = item.tags || [];
    if (b !== undefined) {
      // O Azure só aceita o valor de bloqueio (ex.: "Yes"); desbloquear é limpar o campo.
      if (blocked.fieldTypes.includes(item.type)) out.blockedField = b ? blocked.value : null;
      else tags = b ? [...withoutTag(tags, blocked.tag), blocked.tag] : withoutTag(tags, blocked.tag);
    }
    if (v !== undefined) {
      const tagState = validation.tagState[item.type];
      if (tagState) {
        tags = v ? [...withoutTag(tags, validation.tag), validation.tag] : withoutTag(tags, validation.tag);
        if (v && item.state !== tagState) out.state = tagState;
      }
    }
    if (tags !== item.tags) out.tags = tags;
    return out;
  }

  const defaultFor = (def) => (def.defaultByMonth ? def.defaultByMonth[now().getMonth()] : def.default);

  // Formulário "Criar": escolha de planejamento (vira tag) + campos do tipo.
  function createFields() {
    const out = {};
    for (const [type, c] of Object.entries(createCfg)) {
      const list = [];
      if (planning && (!planning.types || planning.types.includes(type))) {
        list.push({ key: 'planning', label: planning.label, required: planning.required, options: planning.options, asTag: true });
      }
      for (const k of c.required || []) if (byKey[k]) list.push({ ...byKey[k], required: true, default: defaultFor(byKey[k]) });
      for (const k of c.optional || []) if (byKey[k]) list.push({ ...byKey[k], required: false, default: defaultFor(byKey[k]) });
      out[type] = list;
    }
    return out;
  }

  // Valida e converte os valores do formulário em fields do create + tags extras.
  function buildExtraFields(type, values = {}) {
    const defs = createFields()[type] || [];
    const out = [];
    const tags = [];
    const missing = [];
    for (const def of defs) {
      const v = values[def.key] ?? def.default;
      if (isEmpty(v) || (typeof v === 'string' && !v.trim())) {
        if (def.required) missing.push({ label: def.label });
        continue;
      }
      if (def.options && !def.options.includes(String(v))) {
        missing.push({ code: 'invalidValue', label: def.label, value: String(v) });
        continue;
      }
      if (def.asTag) tags.push(String(v));
      else if (def.input === 'rich') out.push({ name: def.ref, value: String(v), format: 'Markdown' });
      else out.push({ name: def.ref, value: String(v) });
    }
    const rules = typeRules[type] || {};
    if (rules.descriptionRequired && !String(values.description || '').trim()) missing.unshift({ code: 'description' });
    if (rules.parentRequired && !values.parentId) missing.push({ code: 'parent', type: rules.parentType });
    return { fields: out, tags, missing };
  }

  // "TF401320: Rule Error for field Completed Work. Error code: Required, InvalidEmpty." → campos faltando.
  function parseRuleErrors(message) {
    const text = String(message || '');
    if (!/TF401320/.test(text)) return null;
    const names = [...text.matchAll(/Rule Error for field ([^.]+?)\.\s*Error code/g)].map((m) => m[1].trim());
    const more = /(\d+|One) additional error/i.exec(text);
    return {
      fields: names.map((name) => {
        const norm = name.replace(/[?_]+$/, '').toLowerCase();
        const names = (d) => [d.azName, ...(d.label && typeof d.label === 'object' ? Object.values(d.label) : [d.label])].filter(Boolean);
        const def = fields.find((d) => names(d).some((n) => String(n).replace(/[?_]+$/, '').toLowerCase() === norm));
        const key = def ? (def.input === 'links' ? `${def.key}Add` : def.key) : null;
        return { name, key };
      }),
      additional: more ? (more[1] === 'One' ? 1 : Number(more[1])) : 0,
    };
  }

  // Novo HTML do campo de links: acrescenta sem mexer no que existe (nunca duplica a URL).
  function appendLink(currentHtml, { url, title } = {}) {
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) throw Object.assign(new Error('invalid link'), { status: 400, code: 'invalidLink' });
    const current = String(currentHtml || '');
    if (current.includes(u)) return current;
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pr = u.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
    const t = String(title || '').trim();
    const line = pr
      ? `<div>${esc(links.prPrefix)}<a href="${esc(u)}">${esc(`${pr[1]}/${pr[2]}#${pr[3]}`)}</a>${t ? ` — ${esc(t)}` : ''}</div>`
      : `<div><a href="${esc(u)}">${esc(t || u)}</a></div>`;
    return current + line;
  }

  // Dados que o front recebe em /api/meta.
  function publicMeta() {
    return {
      planning,
      createFields: createFields(),
      typeRules,
      fieldDefs: fields,
      detailFields,
      transitionRules: transitions,
      blocked: { tag: blocked.tag, fieldTypes: blocked.fieldTypes },
      validation: { states: validation.states, tag: validation.tag, tagState: validation.tagState },
    };
  }

  return {
    fields,
    byKey,
    planning,
    typeRules,
    transitions,
    detailFields,
    blocked,
    validation,
    isBlocked,
    inValidation,
    flagChanges,
    createFields,
    buildExtraFields,
    parseRuleErrors,
    appendLink,
    publicMeta,
  };
}

let current = null;
export function getProcess() {
  if (!current) {
    const { file, config } = readProcessConfig();
    current = loadProcess(config);
    console.log(`[process] rules from ${path.relative(ROOT, file)}`);
  }
  return current;
}
