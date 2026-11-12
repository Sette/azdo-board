import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoAzdo } from '../src/demo/index.js';
import { parseWiql, runWiql } from '../src/demo/wiql.js';

const rows = [
  { id: 1, fields: { 'System.WorkItemType': 'Bug', 'System.State': 'New', 'System.Tags': 'a; Blocked', 'System.AssignedTo': 'Ana <ana@x.com>', 'Microsoft.VSTS.Common.BacklogPriority': 20 } },
  { id: 2, fields: { 'System.WorkItemType': 'Task', 'System.State': 'Done', 'Microsoft.VSTS.Common.BacklogPriority': 10 } },
  { id: 3, fields: { 'System.WorkItemType': 'Product Backlog Item', 'System.State': 'Committed', 'Microsoft.VSTS.Common.BacklogPriority': 5 } },
];
const ctx = { project: 'P', me: 'ana@x.com', now: new Date('2026-01-10T12:00:00Z') };
const ids = (q) => runWiql(q, rows, ctx).map((r) => r.id);

test('demo WIQL: operators, AND/OR, parentheses and ORDER BY', () => {
  assert.deepEqual(ids(`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] NOT IN ('Done', 'Removed') ORDER BY [Microsoft.VSTS.Common.BacklogPriority] ASC`), [3, 1]);
  assert.deepEqual(ids(`SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ('Bug', 'Task') AND ([System.Tags] CONTAINS 'blocked' OR [System.State] = 'Done')`), [1, 2]);
  assert.deepEqual(ids(`SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @me`), [1]);
  assert.deepEqual(ids(`SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] <> ''`), [1]);
  assert.deepEqual(ids(`SELECT [System.Id] FROM WorkItems WHERE [System.Title] = 'It''s'`), []);
  assert.equal(parseWiql(`SELECT [System.Id] FROM WorkItems WHERE [System.ChangedDate] >= @today - 90`).cond.value.today, -90);
});

test('demo mode: real azdo.js on in-memory data (board, columns, conflicts, create)', async () => {
  const azdo = createDemoAzdo({ lang: 'en', now: () => new Date('2026-03-04T15:00:00Z') });
  const meta = await azdo.getMeta();
  assert.equal(meta.project, 'Fabrikam Web');
  assert.deepEqual(meta.taskboard.map((c) => c.name), ['New', 'In Progress', 'Validation', 'Blocked', 'Done']);

  const items = await azdo.getSprintItems(meta.currentSprintId);
  const byId = new Map(items.map((it) => [it.id, it]));
  assert.equal(byId.get(302).column, 'Validation');
  assert.equal(byId.get(302).inValidation, true);
  assert.equal(byId.get(308).blocked, true);

  // Stale revision → conflict, like Azure's test /rev.
  await assert.rejects(() => azdo.updateItem(303, { rev: 1, title: 'x' }), (e) => e.status === 409);

  // New → Validation: state first, then the taskboard column.
  const cur = await azdo.getItem(303);
  const moved = await azdo.updateItem(303, { rev: cur.rev, state: 'In Progress', column: 'Validation' });
  assert.equal(moved.column, 'Validation');
  assert.ok((await azdo.getValidation()).some((it) => it.id === 303));

  // Create with parent: required fields come from the demo process config.
  await assert.rejects(() => azdo.createItem({ type: 'Task', title: 'x', parentId: 201 }), (e) => e.code === 'requiredFields');
  const created = await azdo.createItem({ type: 'Task', title: 'New task', parentId: 201, planning: 'planned', activity: 'Testing' });
  assert.equal(created.parentId, 201);
  assert.ok(created.tags.includes('planned'));
});
