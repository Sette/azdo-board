import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createAzdo as create } from '../src/azdo.js';
import { loadProcess } from '../src/process.js';

const config = JSON.parse(fs.readFileSync(new URL('./fixtures/process.json', import.meta.url)));
const proc = loadProcess(config);
const createAzdo = (opts) => create({ proc, ...opts });

const env = { AZDO_ORG: 'org', AZDO_PROJECT: 'Proj', AZDO_TEAM: 'Team', AZDO_ME: 'me@x.com' };

function fakeTools(handlers) {
  const calls = [];
  const callTool = async (name, args) => {
    calls.push({ name, args });
    const key = args.action ? `${name}:${args.action}` : name;
    if (!handlers[key]) throw new Error(`sem mock para ${key}`);
    return handlers[key](args);
  };
  return { calls, callTool };
}

const wi = (id, extra = {}) => ({ id, rev: 1, fields: { 'System.Title': `T${id}`, 'System.WorkItemType': 'Task', 'System.State': 'New', ...extra } });

test('getSprintItems usa list_for_iteration e get_batch, sempre com project', async () => {
  const { calls, callTool } = fakeTools({
    'wit_work_item:list_for_iteration': () => ({ workItemRelations: [{ target: { id: 1 } }, { target: { id: 2 } }, { target: { id: 1 } }] }),
    'wit_work_item:get_batch': ({ ids }) => ids.map((id) => wi(id)),
  });
  const items = await createAzdo({ callTool, env }).getSprintItems('it-1');
  assert.deepEqual(items.map((i) => i.id), [1, 2]);
  assert.ok(calls.every((c) => c.args.project === 'Proj'));
  assert.equal(calls[0].args.team, 'Team');
});

test('getMeta acha a sprint atual e os estados por tipo', async () => {
  const { callTool } = fakeTools({
    'work:list_team_iterations': () => [
      { id: 'a', name: 'S1', path: 'Proj\\S1', attributes: { timeFrame: 0 } },
      { id: 'b', name: 'S2', path: 'Proj\\S2', attributes: { timeFrame: 1 } },
    ],
    'work:get_team_settings': () => ({ defaultAreaPath: 'Proj' }),
    'wit_work_item:get_type': ({ workItemType }) => ({ states: [{ name: 'New', color: 'b2b2b2', category: 'Proposed' }], name: workItemType }),
  });
  const meta = await createAzdo({ callTool, env }).getMeta();
  assert.equal(meta.currentSprintId, 'b');
  assert.equal(meta.me, 'me@x.com');
  assert.equal(meta.states.Task[0].color, '#b2b2b2');
  assert.ok(meta.createFields['Product Backlog Item'].length > 0);
  assert.equal(meta.planning.options[0], 'planned');
});

test('createItem valida obrigatórios antes de chamar o Azure', async () => {
  const { calls, callTool } = fakeTools({});
  await assert.rejects(() => createAzdo({ callTool, env }).createItem({ type: 'Task', title: 'x' }), (e) => e.code === 'requiredFields');
  assert.equal(calls.length, 0);
});

test('createItem cria a task e liga ao pai', async () => {
  const { calls, callTool } = fakeTools({
    'work:list_team_iterations': () => [],
    'work:get_team_settings': () => ({ defaultAreaPath: 'Proj' }),
    'wit_work_item:get_type': () => null,
    'wit_work_item_write:create': () => ({ id: 77 }),
    'wit_work_item_write:update': () => ({ id: 77 }),
    'wit_work_item:get_batch': () => [wi(77, { 'System.Parent': 5 })],
  });
  const item = await createAzdo({ callTool, env }).createItem({ type: 'Task', title: 'x', parentId: 5, planning: 'planned', activity: 'Development' });
  assert.equal(item.parentId, 5);
  const create = calls.find((c) => c.args.action === 'create');
  assert.ok(create.args.fields.some((f) => f.name === 'System.Tags' && f.value === 'planned'));
  assert.ok(create.args.fields.some((f) => f.name === 'Microsoft.VSTS.Common.Activity'));
  const link = calls.find((c) => c.args.action === 'update');
  assert.equal(link.args.updates[0].value.rel, 'System.LinkTypes.Hierarchy-Reverse');
  assert.match(link.args.updates[0].value.url, /workItems\/5$/);
});

test('search por #id vai direto no get_batch', async () => {
  const { calls, callTool } = fakeTools({ 'wit_work_item:get_batch': ({ ids }) => ids.map((id) => wi(id)) });
  const res = await createAzdo({ callTool, env }).search({ q: '#123' });
  assert.equal(res[0].id, 123);
  assert.equal(calls.length, 1);
});

test('updateItem soma horas ao Completed Work atual e confere o rev', async () => {
  const { calls, callTool } = fakeTools({
    'wit_work_item:get': (a) =>
      a.fields
        ? { id: 5, rev: 3, fields: { 'Microsoft.VSTS.Scheduling.CompletedWork': 1.5 } }
        : { id: 5, rev: 4, fields: { 'System.WorkItemType': 'Task' }, relations: [] },
    'wit_work_item:list_comments': () => ({ comments: [] }),
    'wit_work_item_write:update': () => ({ id: 5 }),
  });
  const azdo = createAzdo({ callTool, env });
  await azdo.updateItem(5, { rev: 3, state: 'Done', completedWorkAdd: 2 });
  const up = calls.find((c) => c.args.action === 'update');
  assert.deepEqual(up.args.updates[0], { op: 'test', path: '/rev', value: 3 });
  assert.ok(up.args.updates.some((u) => u.path === '/fields/Microsoft.VSTS.Scheduling.CompletedWork' && u.value === 3.5));
  await assert.rejects(() => azdo.updateItem(5, { rev: 3, completedWorkAdd: -9 }), (e) => e.code === 'negativeHours');
  await assert.rejects(() => azdo.updateItem(5, { rev: 2, completedWorkAdd: 1 }), (e) => e.status === 409);
});

test('updateItem transforma TF401320 em 422 com os campos que faltam', async () => {
  const { callTool } = fakeTools({
    'wit_work_item_write:update': () => {
      throw new Error('TF401320: Rule Error for field Completed Work. Error code: Required, InvalidEmpty. One additional error occurred');
    },
  });
  await assert.rejects(
    () => createAzdo({ callTool, env }).updateItem(5, { rev: 1, state: 'Done' }),
    (e) => e.status === 422 && e.code === 'ruleError' && e.missingFields[0].key === 'completedWork' && e.additional === 1,
  );
});

test('updateItem converte blocked em campo na Task e em tag no PBI', async () => {
  for (const [type, check] of [
    ['Task', (u) => u.some((x) => x.path === '/fields/Microsoft.VSTS.CMMI.Blocked' && x.value === 'Yes')],
    ['Product Backlog Item', (u) => u.some((x) => x.path === '/fields/System.Tags' && x.value === 'a; blocked')],
  ]) {
    const { calls, callTool } = fakeTools({
      'wit_work_item:get': (a) =>
        a.fields ? { id: 5, rev: 2, fields: { 'System.WorkItemType': type, 'System.State': 'New', 'System.Tags': 'a' } } : { id: 5, rev: 3, fields: { 'System.WorkItemType': type }, relations: [] },
      'wit_work_item:list_comments': () => ({ comments: [] }),
      'wit_work_item_write:update': () => ({ id: 5 }),
    });
    await createAzdo({ callTool, env }).updateItem(5, { rev: 2, blocked: true });
    assert.ok(check(calls.find((c) => c.args.action === 'update').args.updates), type);
  }
});

test('getBlocked e getValidation filtram pelo processo', async () => {
  const { callTool } = fakeTools({
    'wit_query:wiql': () => ({ workItems: [{ id: 1 }, { id: 2 }] }),
    'wit_work_item:get_batch': () => [
      wi(1, { 'Microsoft.VSTS.CMMI.Blocked': 'Yes', 'System.State': 'In Progress' }),
      wi(2, { 'System.Tags': 'validation-later', 'System.State': 'In Progress' }),
    ],
  });
  const azdo = createAzdo({ callTool, env });
  assert.deepEqual((await azdo.getBlocked()).map((i) => i.id), [1]);
  assert.deepEqual((await azdo.getValidation()).map((i) => i.id), []);
});

test('taskboard: sprint items get their column; a state change also moves the column', async () => {
  const moves = [];
  const taskboard = {
    columns: async () => [
      { name: 'New', mappings: { Task: 'New' } },
      { name: 'In Progress', mappings: { Task: 'In Progress' } },
      { name: 'Validation', mappings: { Task: 'In Progress' } },
      { name: 'Done', mappings: { Task: 'Done' } },
    ],
    itemColumns: async () => new Map([[5, 'Validation']]),
    move: async (iterationId, id, column) => moves.push({ iterationId, id, column }),
  };
  const state = { value: 'In Progress' };
  const { calls, callTool } = fakeTools({
    'work:list_team_iterations': () => [{ id: 'b', name: 'S2', path: 'Proj\\S2', attributes: { timeFrame: 1 } }],
    'work:get_team_settings': () => ({ defaultAreaPath: 'Proj' }),
    'wit_work_item:get_type': () => null,
    'wit_work_item:list_for_iteration': () => ({ workItemRelations: [{ target: { id: 5 } }] }),
    'wit_work_item:get_batch': ({ ids }) => ids.map((id) => wi(id, { 'System.State': state.value })),
    'wit_work_item:get': () => wi(5, { 'System.State': state.value, 'System.IterationPath': 'Proj\\S2' }),
    'wit_work_item:list_comments': () => ({ comments: [] }),
    'wit_work_item_write:update': () => ({ id: 5 }),
  });
  const columnProc = loadProcess({ ...config, blocked: { ...config.blocked, column: 'Blocked' }, validation: { ...config.validation, column: 'Validation' } });
  const azdo = create({ callTool, env, proc: columnProc, taskboard });

  const [item] = await azdo.getSprintItems('b');
  assert.equal(item.column, 'Validation');
  assert.equal(item.inValidation, true);

  // Explicit column (drag to Validation) without a state change.
  let detail = await azdo.updateItem(5, { rev: 1, column: 'Validation' });
  assert.deepEqual(moves.at(-1), { iterationId: 'b', id: 5, column: 'Validation' });
  assert.equal(calls.some((c) => c.args.action === 'update'), false);
  assert.equal(detail.inValidation, true);

  // State change without a column: first column mapped to the new state.
  state.value = 'Done';
  detail = await azdo.updateItem(5, { rev: 1, state: 'Done' });
  assert.deepEqual(moves.at(-1), { iterationId: 'b', id: 5, column: 'Done' });

  // A column that doesn't match the state is refused.
  await assert.rejects(() => azdo.updateItem(5, { rev: 1, column: 'Validation' }), (e) => e.code === 'columnState');
});
