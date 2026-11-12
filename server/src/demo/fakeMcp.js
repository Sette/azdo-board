// In-memory stand-in for the Azure DevOps MCP server (demo mode). It answers only the
// tool actions azdo.js uses, in the same shape the real server returns, so the mappers
// and the rest of the app run unchanged. Changes live in memory until the server restarts.
import { McpError } from '../mcp.js';
import { ME, STATES, TASKBOARD } from './data.js';
import { runWiql } from './wiql.js';

const PARENT = 'System.LinkTypes.Hierarchy-Reverse';
const CHILD = 'System.LinkTypes.Hierarchy-Forward';

export function createDemoCallTool(store, { env, now = () => new Date() }) {
  const org = env.AZDO_ORG;
  const itemUrl = (id) => `https://dev.azure.com/${org}/_apis/wit/workItems/${id}`;
  const wiqlCtx = () => ({ project: env.AZDO_PROJECT, me: env.AZDO_ME, now: now() });

  function snapshot(it, { relations = false } = {}) {
    const wi = { id: it.id, rev: it.rev, fields: { ...it.fields, 'System.Rev': it.rev } };
    if (relations) {
      const rel = [];
      if (it.fields['System.Parent']) rel.push({ rel: PARENT, url: itemUrl(it.fields['System.Parent']) });
      for (const c of store.items.values()) if (c.fields['System.Parent'] === it.id) rel.push({ rel: CHILD, url: itemUrl(c.id) });
      wi.relations = [...rel, ...it.links];
      wi.multilineFieldsFormat = { ...it.formats };
    }
    return wi;
  }

  function touch(it) {
    it.rev += 1;
    it.fields['System.ChangedDate'] = now().toISOString();
    it.fields['System.ChangedBy'] = ME;
  }

  function applyPatch(it, updates) {
    for (const u of updates) {
      if (u.op === 'test' && u.path === '/rev') {
        if (Number(u.value) !== it.rev) {
          throw new McpError(`Error updating work item: test operation failed for /rev (expected ${u.value}, actual ${it.rev})`, { status: 409, tool: 'wit_work_item_write' });
        }
        continue;
      }
      const [, kind, ref] = /^\/(fields|multilineFieldsFormat|relations)\/(.+)$/.exec(u.path) || [];
      if (kind === 'fields') {
        if (u.op === 'remove') delete it.fields[ref];
        else it.fields[ref] = u.value;
      } else if (kind === 'multilineFieldsFormat') {
        it.formats[ref] = String(u.value).toLowerCase();
      } else if (kind === 'relations' && u.op === 'add') {
        const target = Number(String(u.value?.url).split('/').pop());
        if (u.value?.rel === PARENT) it.fields['System.Parent'] = target;
        else it.links.push(u.value);
      }
    }
    touch(it);
  }

  const get = (id) => store.items.get(Number(id));

  const handlers = {
    'work:list_team_iterations': () =>
      store.sprints.map((s) => ({ id: s.id, name: s.name, path: s.path, attributes: { startDate: s.startDate, finishDate: s.finishDate, timeFrame: s.timeFrame } })),
    'work:get_team_settings': () => ({
      defaultAreaPath: env.AZDO_PROJECT,
      defaultIteration: { id: store.sprints.find((s) => s.timeFrame === 1)?.id },
    }),
    'wit_work_item:get_type': ({ workItemType }) => {
      const states = STATES[workItemType];
      return states ? { name: workItemType, states: states.map(([name, category, color]) => ({ name, category, color })) } : null;
    },
    'wit_work_item:list_for_iteration': ({ iterationId }) => {
      const sprint = store.sprints.find((s) => s.id === iterationId);
      const ids = [...store.items.values()].filter((it) => sprint && it.fields['System.IterationPath'] === sprint.path).map((it) => it.id);
      return { workItemRelations: ids.map((id) => ({ target: { id } })) };
    },
    'wit_work_item:get_batch': ({ ids }) => ids.map(get).filter(Boolean).map((it) => snapshot(it)),
    'wit_work_item:get': ({ id }) => {
      const it = get(id);
      return it ? snapshot(it, { relations: true }) : null;
    },
    'wit_work_item:list_comments': ({ workItemId }) => ({ comments: [...(store.comments.get(Number(workItemId)) || [])] }),
    'wit_work_item:my': ({ includeCompleted }) => ({
      results: [...store.items.values()]
        .filter((it) => String(it.fields['System.AssignedTo'] || '').includes(`<${env.AZDO_ME}>`))
        .filter((it) => includeCompleted || !['Done', 'Removed'].includes(it.fields['System.State']))
        .map((it) => ({ id: it.id })),
    }),
    'wit_work_item_write:update': ({ id, updates }) => {
      const it = get(id);
      if (!it) throw new McpError(`Work item ${id} not found`, { status: 404, tool: 'wit_work_item_write' });
      applyPatch(it, updates);
      return snapshot(it);
    },
    'wit_work_item_write:create': ({ workItemType, fields }) => {
      const id = store.nextId++;
      const at = now().toISOString();
      const it = {
        id,
        rev: 0,
        formats: {},
        links: [],
        fields: {
          'System.Id': id,
          'System.WorkItemType': workItemType,
          'System.State': 'New',
          'System.CreatedBy': ME,
          'System.CreatedDate': at,
          'Microsoft.VSTS.Common.BacklogPriority': id * 10,
        },
      };
      for (const f of fields) {
        it.fields[f.name] = f.value;
        if (f.format) it.formats[f.name] = String(f.format).toLowerCase();
      }
      store.items.set(id, it);
      touch(it);
      return snapshot(it);
    },
    'wit_work_item_comment_write:add': ({ workItemId, text }) => {
      const list = store.comments.get(Number(workItemId)) || store.comments.set(Number(workItemId), []).get(Number(workItemId));
      const at = now().toISOString();
      const c = { id: store.nextCommentId++, text, format: 0, createdBy: ME, createdDate: at, modifiedDate: at };
      list.push(c);
      return c;
    },
    search_workitem: ({ searchText, workItemType, state, assignedTo, top = 50 }) => {
      const words = String(searchText).toLowerCase().split(/\s+/).filter(Boolean);
      const results = [...store.items.values()]
        .filter((it) => {
          const f = it.fields;
          const text = `${f['System.Title']} ${f['System.Description'] || ''} ${f['System.Tags'] || ''}`.toLowerCase();
          return (
            words.every((w) => text.includes(w)) &&
            (!workItemType?.length || workItemType.includes(f['System.WorkItemType'])) &&
            (!state?.length || state.includes(f['System.State'])) &&
            (!assignedTo?.length || assignedTo.some((a) => String(f['System.AssignedTo'] || '').includes(a)))
          );
        })
        .slice(0, top)
        .map((it) => ({ fields: Object.fromEntries(Object.entries({ ...it.fields, 'System.Rev': it.rev }).map(([k, v]) => [k.toLowerCase(), v])) }));
      return { count: results.length, results };
    },
    'wit_query:wiql': ({ wiql, top = 200 }) => ({
      workItems: runWiql(wiql, [...store.items.values()], wiqlCtx())
        .slice(0, top)
        .map((it) => ({ id: it.id })),
    }),
  };

  return async function callTool(name, args = {}) {
    const key = args.action ? `${name}:${args.action}` : name;
    const handler = handlers[key];
    if (!handler) throw new McpError(`demo mode: ${key} is not implemented`, { status: 501, tool: name });
    return structuredClone(await handler(args));
  };
}

// Same interface as createTaskboard() (server/src/taskboard.js), in memory.
export function createDemoTaskboard(store) {
  const columnOf = (it) => {
    const state = it.fields['System.State'];
    const saved = store.columns.get(it.id);
    if (saved && TASKBOARD.find((c) => c.name === saved)?.mappings.Task === state) return saved;
    return TASKBOARD.find((c) => c.mappings.Task === state)?.name;
  };
  return {
    async columns() {
      return structuredClone(TASKBOARD);
    },
    async itemColumns(iterationId) {
      const sprint = store.sprints.find((s) => s.id === iterationId);
      const out = new Map();
      for (const it of store.items.values()) {
        if (it.fields['System.WorkItemType'] !== 'Task' || it.fields['System.IterationPath'] !== sprint?.path) continue;
        const col = columnOf(it);
        if (col) out.set(it.id, col);
      }
      return out;
    },
    async move(_iterationId, id, column) {
      const it = store.items.get(Number(id));
      const state = it?.fields['System.State'];
      if (TASKBOARD.find((c) => c.name === column)?.mappings.Task !== state) {
        throw new McpError(`Taskboard column '${column}' is not mapped to current work item state '${state}'.`, { status: 409, tool: 'taskboard' });
      }
      store.columns.set(it.id, column);
    },
  };
}
