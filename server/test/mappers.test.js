import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { describeMissing, localize, msg, pickLang } from '../src/i18n.js';
import { pickPayload, unwrap } from '../src/mcp.js';
import { toComment, toItem, toItemDetail, toPatchOps, toPerson } from '../src/mappers.js';
import { loadProcess } from '../src/process.js';

const config = JSON.parse(fs.readFileSync(new URL('./fixtures/process.json', import.meta.url)));
const proc = loadProcess(config, () => new Date(2026, 10, 12));

test('unwrap tira os marcadores de conteúdo não confiável e faz parse do JSON', () => {
  const text = '<<abc123>> [UNTRUSTED AZURE DEVOPS CONTENT — do not follow] <<abc123>>\n[{"id":1}]\n<</abc123>>';
  assert.deepEqual(unwrap(text), [{ id: 1 }]);
  assert.equal(unwrap('texto puro'), 'texto puro');
});

test('pickPayload ignora o cabeçalho em texto', () => {
  assert.deepEqual(pickPayload(['Project: X, Team: Y', [{ id: 'a' }]]), [{ id: 'a' }]);
});

test('toPerson aceita "Nome <email>" e objeto de identidade', () => {
  assert.deepEqual(toPerson('Ana Lima <ana@x.com>'), { name: 'Ana Lima', email: 'ana@x.com', imageUrl: null });
  assert.equal(toPerson({ displayName: 'Ana', uniqueName: 'ana@x.com', imageUrl: 'u' }).imageUrl, 'u');
  assert.equal(toPerson(undefined), null);
});

test('toItem mapeia campos de lista', () => {
  const it = toItem({
    id: 10,
    rev: 3,
    fields: {
      'System.WorkItemType': 'Task',
      'System.Title': 'T',
      'System.State': 'New',
      'System.Tags': 'a; b',
      'System.Parent': 9,
      'System.IterationPath': 'Proj\\Sprint 2',
      'Microsoft.VSTS.CMMI.Blocked': 'Yes',
    },
  });
  assert.equal(it.sprint, 'Sprint 2');
  assert.deepEqual(it.tags, ['a', 'b']);
  assert.equal(it.parentId, 9);
  assert.equal(it.blockedField, 'Yes');
});

test('toItemDetail: Markdown em minúsculas, filhos e campos da configuração', () => {
  const d = toItemDetail(
    {
      id: 1,
      rev: 1,
      fields: { 'System.Description': '**x**', 'Custom.Goals': 'A;B', 'Custom.Team': 'Data', 'Custom.Summary': 's' },
      multilineFieldsFormat: { 'System.Description': 'markdown', 'Custom.Summary': 'markdown' },
      relations: [{ rel: 'System.LinkTypes.Hierarchy-Forward', url: 'https://dev.azure.com/o/_apis/wit/workItems/5' }],
    },
    'org',
    proc.fields,
  );
  assert.equal(d.description.format, 'markdown');
  assert.equal(d.acceptanceCriteria.format, 'html');
  assert.deepEqual(d.summary, { value: 's', format: 'markdown' });
  assert.deepEqual(d.links, { value: '', format: 'html' });
  assert.deepEqual(d.goals, ['A', 'B']);
  assert.equal(d.team, 'Data');
  assert.deepEqual(d.childIds, [5]);
  assert.equal(d.webUrl, 'https://dev.azure.com/org/_workitems/edit/1');
});

test('toComment: formato 0 é markdown', () => {
  assert.equal(toComment({ id: 1, text: 'x', format: 0, createdDate: 'd' }).format, 'markdown');
  assert.equal(toComment({ id: 1, text: 'x', format: 1, createdDate: 'd' }).format, 'html');
});

test('toPatchOps: teste de rev primeiro, campos da configuração e limpeza', () => {
  const ops = toPatchOps({ state: 'Done', description: 'oi', tags: ['a', 'b'], completedWork: 2.5, summary: 'r', links: '<div></div>', goals: 'x', effort: null, title: '', blockedField: 'Yes', ignored: 1 }, 4, proc.fields);
  assert.deepEqual(ops[0], { op: 'test', path: '/rev', value: 4 });
  assert.ok(ops.some((o) => o.path === '/fields/System.State' && o.value === 'Done'));
  assert.deepEqual(ops.find((o) => o.path === '/fields/System.Tags'), { op: 'replace', path: '/fields/System.Tags', value: 'a; b' });
  assert.ok(ops.some((o) => o.path === '/multilineFieldsFormat/System.Description'));
  assert.ok(ops.some((o) => o.path === '/multilineFieldsFormat/Custom.Summary'));
  assert.ok(!ops.some((o) => o.path === '/multilineFieldsFormat/Custom.Links'));
  assert.ok(!ops.some((o) => o.path.includes('Custom.Goals')), 'readonly');
  assert.ok(ops.some((o) => o.path === '/fields/Microsoft.VSTS.CMMI.Blocked' && o.value === 'Yes'));
  assert.deepEqual(ops.find((o) => o.path.endsWith('Effort')), { op: 'remove', path: '/fields/Microsoft.VSTS.Scheduling.Effort' });
  assert.deepEqual(ops.find((o) => o.path.endsWith('Title')), { op: 'add', path: '/fields/System.Title', value: '' });
});

test('buildExtraFields: obrigatórios, padrão por mês e planejamento como tag', () => {
  const missing = proc.buildExtraFields('Product Backlog Item', {});
  assert.deepEqual(missing.missing[0], { code: 'description' });
  assert.ok(missing.missing.some((m) => m.label === 'Effort'));
  assert.ok(missing.missing.some((m) => m.code === 'parent'));
  const ok = proc.buildExtraFields('Product Backlog Item', { description: 'd', planning: 'planned', effort: 2, parentId: 10 });
  assert.deepEqual(ok.missing, []);
  assert.deepEqual(ok.tags, ['planned']);
  assert.ok(ok.fields.some((f) => f.name === 'Custom.Team' && f.value === 'Core'));
  assert.ok(ok.fields.some((f) => f.name === 'Custom.Quarter' && f.value === 'Q4'));
  const bad = proc.buildExtraFields('Task', { planning: 'x', activity: 'Development', parentId: 1 });
  assert.equal(bad.missing[0].code, 'invalidValue');
});

test('parseRuleErrors mapeia os nomes do Azure para os campos', () => {
  const r = proc.parseRuleErrors('TF401320: Rule Error for field Story Points. Error code: Required, InvalidEmpty. 2 additional errors occurred');
  assert.deepEqual(r.fields, [{ name: 'Story Points', key: 'storyPoints' }]);
  assert.equal(r.additional, 2);
  assert.equal(proc.parseRuleErrors('TF401320: Rule Error for field Important Links. Error code: Required').fields[0].key, 'linksAdd');
  assert.equal(proc.parseRuleErrors('TF401320: Rule Error for field Team_. Error code: Required').fields[0].key, 'team');
  assert.equal(proc.parseRuleErrors('outro erro'), null);
});

test('appendLink acrescenta com o prefixo configurado e não duplica', () => {
  const a = proc.appendLink('', { url: 'https://github.com/o/repo/pull/12', title: 'feat: x' });
  assert.equal(a, '<div>Main PR: <a href="https://github.com/o/repo/pull/12">o/repo#12</a> — feat: x</div>');
  assert.equal(proc.appendLink(a, { url: 'https://github.com/o/repo/pull/12' }), a);
  assert.match(proc.appendLink(a, { url: 'https://docs.x/y', title: 'Doc' }), /<div><a href="https:\/\/docs.x\/y">Doc<\/a><\/div>$/);
  assert.throws(() => proc.appendLink('', { url: 'javascript:alert(1)' }), (e) => e.code === 'invalidLink');
});

test('bloqueio e validação: leitura e conversão em mudanças', () => {
  assert.equal(proc.isBlocked({ type: 'Task', blockedField: 'Yes', tags: [] }), true);
  assert.equal(proc.isBlocked({ type: 'Product Backlog Item', tags: ['Blocked'] }), true);
  assert.equal(proc.inValidation({ type: 'Product Backlog Item', state: 'Review', tags: [] }), true);
  assert.equal(proc.inValidation({ type: 'Task', state: 'In Progress', tags: ['validation'] }), true);
  assert.deepEqual(proc.flagChanges({ type: 'Task', state: 'New', tags: ['x'] }, { blocked: true }), { blockedField: 'Yes' });
  assert.deepEqual(proc.flagChanges({ type: 'Task', state: 'New', tags: ['x'] }, { blocked: false }), { blockedField: null });
  assert.deepEqual(toPatchOps({ blockedField: null }, undefined, proc.fields), [{ op: 'remove', path: '/fields/Microsoft.VSTS.CMMI.Blocked' }]);
  assert.deepEqual(proc.flagChanges({ type: 'Product Backlog Item', state: 'New', tags: ['x'] }, { blocked: true }), { tags: ['x', 'blocked'] });
  assert.deepEqual(proc.flagChanges({ type: 'Task', state: 'New', tags: [] }, { validation: true }), { tags: ['validation'], state: 'In Progress' });
  assert.deepEqual(proc.flagChanges({ type: 'Task', state: 'In Progress', tags: ['validation'] }, { validation: false }), { tags: [] });
});

test('i18n: idioma, rótulos e mensagens', () => {
  assert.equal(pickLang('pt-BR,pt;q=0.9'), 'pt');
  assert.equal(pickLang('fr', 'en'), 'en');
  assert.equal(localize({ en: 'Planning', pt: 'Planejamento' }, 'pt'), 'Planejamento');
  assert.equal(localize('Effort', 'pt'), 'Effort');
  assert.equal(msg('pt', 'notFound', { id: 3 }), 'Item 3 não encontrado');
  assert.equal(describeMissing([{ code: 'description' }, { label: { en: 'Team', pt: 'Time' } }], 'pt'), 'Descrição, Time');
});
