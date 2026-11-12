// Converte work items do formato do MCP/REST para os DTOs que o front usa.

export const LIST_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.Tags',
  'System.Parent',
  'System.IterationPath',
  'System.ChangedDate',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.CompletedWork',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Common.Activity',
  'Microsoft.VSTS.CMMI.Blocked',
  'Microsoft.VSTS.Common.BacklogPriority',
  'Microsoft.VSTS.Common.Priority',
];

// "Nome <email>" ou objeto de identidade → { name, email, imageUrl }
export function toPerson(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    return {
      name: value.displayName || value.uniqueName || '',
      email: value.uniqueName || '',
      imageUrl: value.imageUrl || value._links?.avatar?.href || null,
    };
  }
  const m = String(value).match(/^(.*?)\s*<([^>]+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim(), imageUrl: null } : { name: String(value), email: '', imageUrl: null };
}

export function splitTags(tags) {
  if (!tags) return [];
  return String(tags)
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function sprintName(iterationPath) {
  if (!iterationPath) return null;
  const parts = String(iterationPath).split('\\');
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

export function toItem(wi) {
  const f = wi.fields || {};
  return {
    id: wi.id ?? num(f['System.Id']),
    rev: wi.rev ?? num(f['System.Rev']),
    type: f['System.WorkItemType'],
    title: f['System.Title'] || '',
    state: f['System.State'],
    assignee: toPerson(f['System.AssignedTo']),
    tags: splitTags(f['System.Tags']),
    parentId: num(f['System.Parent']),
    iterationPath: f['System.IterationPath'] || null,
    sprint: sprintName(f['System.IterationPath']),
    effort: num(f['Microsoft.VSTS.Scheduling.Effort']),
    remainingWork: num(f['Microsoft.VSTS.Scheduling.RemainingWork']),
    completedWork: num(f['Microsoft.VSTS.Scheduling.CompletedWork']),
    storyPoints: num(f['Microsoft.VSTS.Scheduling.StoryPoints']),
    activity: f['Microsoft.VSTS.Common.Activity'] || null,
    blockedField: f['Microsoft.VSTS.CMMI.Blocked'] || null,
    backlogPriority: num(f['Microsoft.VSTS.Common.BacklogPriority']),
    priority: num(f['Microsoft.VSTS.Common.Priority']),
    changedDate: f['System.ChangedDate'] || null,
  };
}

// Campos ricos de sistema; os do processo (input rich/links) vêm da configuração.
const SYSTEM_RICH = {
  description: 'System.Description',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
};
const isRich = (d) => d.input === 'rich' || d.input === 'links';
const richFields = (fields = []) => ({ ...SYSTEM_RICH, ...Object.fromEntries(fields.filter(isRich).map((d) => [d.key, d.ref])) });

export function toItemDetail(wi, org, fields = []) {
  const f = wi.fields || {};
  const formats = wi.multilineFieldsFormat || {};
  const rich = {};
  for (const [key, ref] of Object.entries(richFields(fields))) {
    rich[key] = { value: f[ref] || '', format: String(formats[ref] || '').toLowerCase() === 'markdown' ? 'markdown' : 'html' };
  }
  const relations = wi.relations || [];
  const idFromUrl = (url) => Number(String(url).split('/').pop());
  // Campos do processo definidos na configuração.
  const processFields = {};
  for (const def of fields) {
    if (isRich(def)) continue;
    const v = f[def.ref];
    if (def.multi) processFields[def.key] = v ? String(v).split(';').map((x) => x.trim()).filter(Boolean) : [];
    else processFields[def.key] = v === undefined || v === '' ? null : def.input === 'number' || def.numeric ? num(v) : v;
  }
  return {
    ...toItem(wi),
    ...processFields,
    ...rich,
    areaPath: f['System.AreaPath'] || null,
    createdBy: toPerson(f['System.CreatedBy']),
    createdDate: f['System.CreatedDate'] || null,
    changedBy: toPerson(f['System.ChangedBy']),
    childIds: relations.filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Forward').map((r) => idFromUrl(r.url)),
    parentId: num(f['System.Parent']) ?? relations.filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse').map((r) => idFromUrl(r.url))[0] ?? null,
    externalLinks: relations
      .filter((r) => r.rel === 'ArtifactLink' || r.rel === 'Hyperlink')
      .map((r) => ({ url: r.url, name: r.attributes?.name || r.rel })),
    webUrl: org ? `https://dev.azure.com/${org}/_workitems/edit/${wi.id}` : null,
  };
}

export function toComment(c) {
  return {
    id: c.id,
    text: c.text || '',
    // CommentFormat do Azure DevOps: 0 = markdown, 1 = html
    format: c.format === 0 || String(c.format).toLowerCase() === 'markdown' ? 'markdown' : 'html',
    author: toPerson(c.createdBy),
    createdDate: c.createdDate,
    modifiedDate: c.modifiedDate,
  };
}

export function toSprint(it) {
  return {
    id: it.id,
    name: it.name,
    path: it.path,
    startDate: it.attributes?.startDate || null,
    finishDate: it.attributes?.finishDate || null,
    timeFrame: it.attributes?.timeFrame ?? null, // 0 passado, 1 atual, 2 futuro
  };
}

// Resultado do search_workitem: campos em minúsculas e tudo string.
export function toSearchItem(r) {
  const f = r.fields || {};
  return {
    id: Number(f['system.id']),
    rev: num(f['system.rev']),
    type: f['system.workitemtype'],
    title: f['system.title'] || '',
    state: f['system.state'],
    assignee: toPerson(f['system.assignedto']),
    tags: splitTags(f['system.tags']),
    changedDate: f['system.changeddate'] || null,
  };
}

// Campo do DTO → operação JSON Patch do Azure DevOps.
const SYSTEM_PATCHABLE = {
  title: 'System.Title',
  state: 'System.State',
  assignee: 'System.AssignedTo',
  iterationPath: 'System.IterationPath',
  priority: 'Microsoft.VSTS.Common.Priority',
  blockedField: 'Microsoft.VSTS.CMMI.Blocked',
};

export function toPatchOps(changes, rev, fields = []) {
  const patchable = {
    ...SYSTEM_PATCHABLE,
    ...Object.fromEntries(fields.filter((d) => d.input !== 'readonly').map((d) => [d.key, d.ref])),
    ...richFields(fields),
  };
  // Campos editados em Markdown no front; o de links fica em HTML.
  const markdown = new Set(['description', 'acceptanceCriteria', ...fields.filter((d) => d.input === 'rich').map((d) => d.key)]);
  // Limpos com "remove": números (o Azure recusa "") e o Blocked (só aceita o valor de bloqueio).
  const removeOnClear = new Set([...fields.filter((d) => d.input === 'number' || d.numeric).map((d) => d.key), 'priority', 'blockedField']);
  const ops = [];
  if (rev !== undefined && rev !== null) ops.push({ op: 'test', path: '/rev', value: Number(rev) });
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'tags') {
      // "add" em System.Tags só acrescenta; "replace" grava a lista inteira (e permite remover tags).
      ops.push({ op: 'replace', path: '/fields/System.Tags', value: (value || []).join('; ') });
      continue;
    }
    const ref = patchable[key];
    if (!ref) continue;
    if (value === null || value === '') {
      if (removeOnClear.has(key)) ops.push({ op: 'remove', path: `/fields/${ref}` });
      else ops.push({ op: 'add', path: `/fields/${ref}`, value: '' });
      continue;
    }
    ops.push({ op: 'add', path: `/fields/${ref}`, value: typeof value === 'number' ? value : String(value) });
    if (markdown.has(key)) ops.push({ op: 'add', path: `/multilineFieldsFormat/${ref}`, value: 'Markdown' });
  }
  return ops;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
