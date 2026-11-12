// Operações do Azure DevOps, todas via tools do MCP. As rotas só chamam estas funções.
import { callTool as defaultCallTool, McpError } from './mcp.js';
import {
  LIST_FIELDS,
  chunk,
  toComment,
  toItem,
  toItemDetail,
  toPatchOps,
  toSearchItem,
  toSprint,
} from './mappers.js';
import { getProcess } from './process.js';

const BOARD_TYPES = ['Product Backlog Item', 'Bug', 'Task'];
const STATE_TYPES = [...BOARD_TYPES, 'Feature', 'Epic'];
const CREATE_TYPES = ['Product Backlog Item', 'Task', 'Bug', 'Feature'];
const META_TTL_MS = 10 * 60 * 1000;

export function createAzdo({ callTool = defaultCallTool, env = process.env, proc = getProcess() } = {}) {
  const org = env.AZDO_ORG;
  const project = env.AZDO_PROJECT;
  const team = env.AZDO_TEAM;
  let metaCache = null;

  const wiql = (query, top = 200) => callTool('wit_query', { action: 'wiql', project, team, top, wiql: query });
  const esc = (s) => String(s).replace(/'/g, "''");

  // Marca bloqueio e validação conforme a configuração do processo.
  const flags = (item) => ({ ...item, blocked: proc.isBlocked(item), inValidation: proc.inValidation(item) });

  async function getItems(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const batches = await Promise.all(
      chunk(unique, 200).map((part) =>
        callTool('wit_work_item', { action: 'get_batch', project, ids: part, fields: LIST_FIELDS }),
      ),
    );
    const byId = new Map(batches.flat().map((wi) => [wi.id, flags(toItem(wi))]));
    return unique.map((id) => byId.get(id)).filter(Boolean);
  }

  async function getMeta({ refresh = false } = {}) {
    if (!refresh && metaCache && Date.now() - metaCache.at < META_TTL_MS) return metaCache.data;
    const [iterations, settings, ...types] = await Promise.all([
      callTool('work', { action: 'list_team_iterations', project, team }),
      callTool('work', { action: 'get_team_settings', project, team }),
      ...STATE_TYPES.map((t) =>
        callTool('wit_work_item', { action: 'get_type', project, workItemType: t }).catch(() => null),
      ),
    ]);
    const sprints = (Array.isArray(iterations) ? iterations : []).map(toSprint);
    const current = sprints.find((s) => s.timeFrame === 1) || sprints.find((s) => s.id === settings?.defaultIteration?.id) || null;
    const states = {};
    STATE_TYPES.forEach((t, i) => {
      const def = types[i];
      if (def?.states) states[t] = def.states.map((s) => ({ name: s.name, color: `#${s.color}`, category: s.category }));
    });
    const data = {
      org,
      project,
      team,
      me: env.AZDO_ME || null,
      lang: env.APP_LANG || null,
      areaPath: settings?.defaultAreaPath || project,
      sprints,
      currentSprintId: current?.id || null,
      types: BOARD_TYPES.filter((t) => states[t]),
      createTypes: CREATE_TYPES.filter((t) => states[t]),
      states,
      webUrl: `https://dev.azure.com/${org}/${encodeURIComponent(project)}`,
      ...proc.publicMeta(),
    };
    metaCache = { at: Date.now(), data };
    return data;
  }

  async function getSprintItems(iterationId) {
    const res = await callTool('wit_work_item', { action: 'list_for_iteration', project, team, iterationId });
    const ids = (res?.workItemRelations || []).map((r) => r.target?.id);
    return getItems(ids);
  }

  async function getBacklog() {
    const res = await wiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
        `AND [System.WorkItemType] IN ('Product Backlog Item', 'Bug') ` +
        `AND [System.State] NOT IN ('Done', 'Removed') ` +
        `ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC, [System.Id] DESC`,
      500,
    );
    return getItems((res?.workItems || []).map((w) => w.id));
  }

  async function getMyItems({ includeCompleted = false } = {}) {
    const res = await callTool('wit_work_item', {
      action: 'my',
      project,
      type: 'assignedtome',
      includeCompleted,
      top: 200,
    });
    return getItems((res?.results || []).map((r) => r.id));
  }

  async function search({ q, types, states, assignee, top = 50 }) {
    const text = (q || '').trim();
    if (/^#?\d+$/.test(text)) return getItems([Number(text.replace('#', ''))]);
    if (text) {
      const res = await callTool('search_workitem', {
        searchText: text,
        project: [project],
        top,
        ...(types?.length ? { workItemType: types } : {}),
        ...(states?.length ? { state: states } : {}),
        ...(assignee ? { assignedTo: [assignee] } : {}),
      });
      return (res?.results || []).map(toSearchItem);
    }
    // Sem texto: filtro estruturado por WIQL.
    const where = ['[System.TeamProject] = @project'];
    if (types?.length) where.push(`[System.WorkItemType] IN (${types.map((t) => `'${esc(t)}'`).join(', ')})`);
    if (states?.length) where.push(`[System.State] IN (${states.map((s) => `'${esc(s)}'`).join(', ')})`);
    if (assignee) where.push(`[System.AssignedTo] = '${esc(assignee)}'`);
    const res = await wiql(`SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.ChangedDate] DESC`, top);
    return getItems((res?.workItems || []).map((w) => w.id));
  }

  async function getItem(id) {
    const [wi, comments] = await Promise.all([
      callTool('wit_work_item', { action: 'get', project, id: Number(id), expand: 'All' }),
      callTool('wit_work_item', { action: 'list_comments', project, workItemId: Number(id), top: 100 }).catch(() => null),
    ]);
    if (!wi?.id) throw new McpError(`Work item ${id} not found`, { status: 404, code: 'notFound', params: { id } });
    const item = flags(toItemDetail(wi, org, proc.fields));
    const [children, parents] = await Promise.all([getItems(item.childIds), getItems([item.parentId])]);
    const tasks = children.filter((c) => c.type === 'Task' && c.state !== 'Removed');
    return {
      ...item,
      children,
      // Sugestão do Completed Work do PBI no Done (regra do sprint-fill-pbis): soma das tasks filhas.
      childrenCompletedWork: tasks.length ? Math.round(tasks.reduce((a, t) => a + (t.completedWork || 0), 0) * 100) / 100 : null,
      parent: parents[0] || null,
      comments: (comments?.comments || []).map(toComment).sort((a, b) => a.createdDate.localeCompare(b.createdDate)),
    };
  }

  // TF401320 (regra do processo) vira 422 com os campos que faltam, para o front pedir e reenviar.
  async function withRuleErrors(fn) {
    try {
      return await fn();
    } catch (err) {
      const parsed = proc.parseRuleErrors(err.message);
      if (!parsed) throw err;
      const names = parsed.fields.map((f) => f.name).join(', ');
      const params = { names, additional: parsed.additional };
      throw Object.assign(new McpError(err.message, { status: 422, tool: err.tool, code: 'ruleError', params }), {
        missingFields: parsed.fields,
        additional: parsed.additional,
      });
    }
  }

  async function updateItem(id, { rev, completedWorkAdd, blocked, validation, ...changes }) {
    // Bloqueio/validação viram campo, tags e estado conforme o tipo (process.flagChanges).
    if (blocked !== undefined || validation !== undefined) {
      const cur = await callTool('wit_work_item', {
        action: 'get',
        project,
        id: Number(id),
        fields: ['System.WorkItemType', 'System.State', 'System.Tags'],
      });
      const item = toItem(cur);
      const derived = proc.flagChanges({ ...item, tags: changes.tags ?? item.tags }, { blocked, validation });
      changes = { ...derived, ...changes, ...(derived.tags ? { tags: derived.tags } : {}) };
    }
    // "<campo>Add" de um campo de links: acrescenta um link ao HTML atual.
    const linkAdds = proc.fields
      .filter((d) => d.input === 'links' && changes[`${d.key}Add`])
      .map((d) => {
        const value = changes[`${d.key}Add`];
        delete changes[`${d.key}Add`];
        return { def: d, value };
      });
    const needsHours = completedWorkAdd !== undefined && completedWorkAdd !== null && completedWorkAdd !== '';
    if (needsHours || linkAdds.length) {
      const cur = await callTool('wit_work_item', {
        action: 'get',
        project,
        id: Number(id),
        fields: ['Microsoft.VSTS.Scheduling.CompletedWork', ...linkAdds.map((l) => l.def.ref)],
      });
      if (rev !== undefined && rev !== null && cur?.rev !== undefined && Number(cur.rev) !== Number(rev)) {
        throw new McpError('revision conflict', { status: 409, code: 'revConflict', params: { id, rev: cur.rev } });
      }
      if (needsHours) {
        const add = Number(completedWorkAdd);
        if (Number.isNaN(add)) throw new McpError('invalid hours', { status: 400, code: 'invalidHours' });
        const total = Math.round(((Number(cur?.fields?.['Microsoft.VSTS.Scheduling.CompletedWork']) || 0) + add) * 100) / 100;
        if (total < 0) throw new McpError('negative hours', { status: 400, code: 'negativeHours', params: { total } });
        changes.completedWork = total;
      }
      for (const { def, value } of linkAdds) changes[def.key] = proc.appendLink(cur?.fields?.[def.ref], value);
    }
    const updates = toPatchOps(changes, rev, proc.fields);
    if (!updates.filter((u) => u.op !== 'test').length) return getItem(id);
    await withRuleErrors(() => callTool('wit_work_item_write', { action: 'update', project, id: Number(id), updates }));
    return getItem(id);
  }

  async function createItem({ type, title, parentId, iterationPath, assignee, description, tags = [], ...extra }) {
    if (!type || !String(title || '').trim()) throw new McpError('type and title required', { status: 400, code: 'typeTitleRequired' });
    const built = proc.buildExtraFields(type, { ...extra, description, parentId });
    if (built.missing.length) {
      throw new McpError('required fields', { status: 400, code: 'requiredFields', params: { missing: built.missing } });
    }
    const meta = await getMeta();
    const allTags = [...new Set([...(tags || []), ...built.tags].map((t) => String(t).trim()).filter(Boolean))];
    const fields = [
      { name: 'System.Title', value: String(title).trim() },
      { name: 'System.AreaPath', value: meta.areaPath },
      ...built.fields,
    ];
    if (iterationPath) fields.push({ name: 'System.IterationPath', value: iterationPath });
    if (assignee) fields.push({ name: 'System.AssignedTo', value: assignee });
    if (description) fields.push({ name: 'System.Description', value: description, format: 'Markdown' });
    if (allTags.length) fields.push({ name: 'System.Tags', value: allTags.join('; ') });

    const created = await withRuleErrors(() => callTool('wit_work_item_write', { action: 'create', project, workItemType: type, fields }));
    const id = created?.id;
    if (!id) throw new McpError('no created id', { code: 'noCreatedId' });
    if (parentId) {
      await callTool('wit_work_item_write', {
        action: 'update',
        project,
        id,
        updates: [
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'System.LinkTypes.Hierarchy-Reverse',
              url: `https://dev.azure.com/${org}/_apis/wit/workItems/${Number(parentId)}`,
            },
          },
        ],
      });
    }
    return (await getItems([id]))[0];
  }

  const notClosed = `[System.State] NOT IN ('Done', 'Removed', 'Closed')`;

  // Tudo o que está bloqueado (campo Blocked ou tag), de qualquer sprint.
  async function getBlocked() {
    const b = proc.blocked;
    const res = await wiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND ${notClosed} ` +
        `AND ([${b.field}] = '${esc(b.value)}' OR [System.Tags] CONTAINS '${esc(b.tag)}') ORDER BY [System.ChangedDate] DESC`,
      300,
    );
    return (await getItems((res?.workItems || []).map((w) => w.id))).filter((it) => it.blocked);
  }

  // Tudo o que está em validação (estado de validação ou tag), de qualquer sprint.
  async function getValidation() {
    const v = proc.validation;
    const conds = [`[System.Tags] CONTAINS '${esc(v.tag)}'`];
    if (v.states.length) conds.unshift(`[System.State] IN (${v.states.map((x) => `'${esc(x)}'`).join(', ')})`);
    const res = await wiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND ${notClosed} AND (${conds.join(' OR ')}) ` +
        `ORDER BY [System.ChangedDate] DESC`,
      300,
    );
    return (await getItems((res?.workItems || []).map((w) => w.id))).filter((it) => it.inValidation);
  }

  // Candidatos a pai no formulário "Criar" (Features para PBI/Bug, PBIs para Task).
  async function getParentCandidates(type) {
    if (!['Feature', 'Product Backlog Item', 'Epic'].includes(type)) {
      throw new McpError('invalid parent type', { status: 400, code: 'invalidParentType', params: { type } });
    }
    const res = await wiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
        `AND [System.WorkItemType] = '${esc(type)}' AND [System.State] NOT IN ('Done', 'Removed', 'Closed') ` +
        `ORDER BY [System.ChangedDate] DESC`,
      300,
    );
    return getItems((res?.workItems || []).map((w) => w.id));
  }

  async function addComment(id, text) {
    if (!text?.trim()) throw new McpError('empty comment', { status: 400, code: 'emptyComment' });
    await callTool('wit_work_item_comment_write', {
      action: 'add',
      project,
      workItemId: Number(id),
      text,
      format: 'Markdown',
    });
    const res = await callTool('wit_work_item', { action: 'list_comments', project, workItemId: Number(id), top: 100 });
    return (res?.comments || []).map(toComment).sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  }

  // Pessoas para o seletor de responsável: quem aparece nos itens das últimas sprints e do backlog.
  async function getPeople() {
    const res = await wiql(
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
        `AND [System.AssignedTo] <> '' AND [System.ChangedDate] >= @today - 90 ORDER BY [System.ChangedDate] DESC`,
      500,
    );
    const items = await getItems((res?.workItems || []).map((w) => w.id));
    const people = new Map();
    for (const it of items) if (it.assignee?.email) people.set(it.assignee.email, it.assignee);
    return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  return {
    getMeta,
    getSprintItems,
    getBacklog,
    getMyItems,
    search,
    getItem,
    getItems,
    updateItem,
    createItem,
    addComment,
    getPeople,
    getParentCandidates,
    getBlocked,
    getValidation,
  };
}
