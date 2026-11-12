// Mensagens de erro da API em inglês e português. O front manda o idioma no cabeçalho x-lang.
export const LANGS = ['en', 'pt'];

export function pickLang(value, fallback = 'en') {
  const v = String(value || '').toLowerCase();
  if (v.startsWith('pt')) return 'pt';
  if (v.startsWith('en')) return 'en';
  return fallback;
}

// Rótulo da configuração: texto simples ou { en, pt }.
export function localize(label, lang) {
  if (label && typeof label === 'object') return label[lang] || label.en || label.pt || Object.values(label)[0] || '';
  return label ?? '';
}

const MESSAGES = {
  en: {
    notFound: ({ id }) => `Work item ${id} not found`,
    ruleError: ({ names, additional }) =>
      `Azure DevOps requires the field ${names}${additional ? ` (+${additional} more after this one)` : ''}.`,
    revConflict: ({ id, rev }) => `#${id} changed in Azure DevOps (rev ${rev}). Reload and try again.`,
    invalidHours: () => 'Invalid hours',
    negativeHours: ({ total }) => `Completed Work would be negative (${total} h)`,
    columnState: ({ column, state }) => `Column ${column} is not mapped to state ${state} on the team's sprint board`,
    typeTitleRequired: () => 'Type and title are required',
    requiredFields: ({ fields }) => `Required: ${fields}`,
    noCreatedId: () => 'Azure DevOps did not return the id of the created item',
    invalidParentType: ({ type }) => `Invalid parent type: ${type}`,
    emptyComment: () => 'Empty comment',
    invalidLink: () => 'Invalid link: use an http(s) URL',
    missingEnv: ({ name }) => `${name} is not set in .env`,
    description: () => 'Description',
    parent: ({ type }) => `Parent (${type})`,
    invalidValue: ({ label, value }) => `${label} (invalid value: ${value})`,
  },
  pt: {
    notFound: ({ id }) => `Item ${id} não encontrado`,
    ruleError: ({ names, additional }) =>
      `O Azure DevOps exige o campo ${names}${additional ? ` (+${additional} outro${additional > 1 ? 's' : ''} depois deste)` : ''}.`,
    revConflict: ({ id, rev }) => `#${id} mudou no Azure DevOps (rev ${rev}). Recarregue e tente de novo.`,
    invalidHours: () => 'Horas inválidas',
    negativeHours: ({ total }) => `Completed Work ficaria negativo (${total} h)`,
    columnState: ({ column, state }) => `A coluna ${column} não corresponde ao estado ${state} no quadro da sprint do time`,
    typeTitleRequired: () => 'Tipo e título são obrigatórios',
    requiredFields: ({ fields }) => `Campos obrigatórios: ${fields}`,
    noCreatedId: () => 'O Azure DevOps não devolveu o id do item criado',
    invalidParentType: ({ type }) => `Tipo de pai inválido: ${type}`,
    emptyComment: () => 'Comentário vazio',
    invalidLink: () => 'Link inválido: use uma URL http(s)',
    missingEnv: ({ name }) => `${name} não definido no .env`,
    description: () => 'Descrição',
    parent: ({ type }) => `Pai (${type})`,
    invalidValue: ({ label, value }) => `${label} (valor inválido: ${value})`,
  },
};

export function msg(lang, code, params = {}) {
  const fn = MESSAGES[lang]?.[code] || MESSAGES.en[code];
  return fn ? fn(params) : code;
}

// Item de "faltando" do buildExtraFields: { label } ou { code, ... }.
export function describeMissing(list, lang) {
  return list.map((m) => (m.code ? msg(lang, m.code, { ...m, label: localize(m.label, lang) }) : localize(m.label, lang))).join(', ');
}
