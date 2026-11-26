import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import express from 'express';
import {
  buildContextSummary,
  buildTurnPayload,
  cleanToolLabel,
  createAgentService,
  createJsonStreamExtractor,
  isMutatingToolName,
  stripAnsi,
} from '../src/agents.js';
import { errorHandler } from '../src/routes.js';
import { createSkillsRegistry, parseSkillFrontmatter } from '../src/skills.js';

test('parseSkillFrontmatter e createSkillsRegistry priorizam skills azdevops-*', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-skills-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'smart-commit'));
    fs.writeFileSync(
      path.join(tmp, 'smart-commit', 'SKILL.md'),
      '---\nname: smart-commit\ndescription: Cria commits semânticos\n---\n# Smart Commit\nCorpo.',
    );
    fs.mkdirSync(path.join(tmp, 'azdevops-create-pbi'));
    fs.writeFileSync(
      path.join(tmp, 'azdevops-create-pbi', 'SKILL.md'),
      "---\nname: azdevops-create-pbi\ndescription: 'Cria PBI e planeja tasks'\n---\n# Criar PBI\nPasso 1.",
    );

    const parsed = parseSkillFrontmatter("---\nname: foo\ndescription: 'bar'\n---\nOlá");
    assert.equal(parsed.meta.name, 'foo');
    assert.equal(parsed.meta.description, 'bar');
    assert.equal(parsed.body, 'Olá');

    const reg = createSkillsRegistry({
      repoRoot: tmp,
      dirs: [{ dir: tmp, source: 'claude' }],
    });
    const list = reg.listSkills({ force: true });
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'azdevops-create-pbi');
    assert.equal(list[0].category, 'azdevops');
    assert.equal(list[1].name, 'smart-commit');

    const slash = reg.parseSlashSkill('/azdevops-create-pbi tasks 42');
    assert.equal(slash.skill.name, 'azdevops-create-pbi');
    assert.equal(slash.args, 'tasks 42');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildTurnPayload injeta SKILL.md portável para codex/kiro/agy e preserva nativo no claude', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-payload-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'azdevops-finish-pbi'));
    fs.writeFileSync(
      path.join(tmp, 'azdevops-finish-pbi', 'SKILL.md'),
      '---\nname: azdevops-finish-pbi\ndescription: Fecha PBI\n---\nUse mcp__azure-devops__wit_work_item.',
    );
    const reg = createSkillsRegistry({ repoRoot: tmp, dirs: [{ dir: tmp, source: 'claude' }] });
    const ctx = buildContextSummary({
      env: { AZDO_ORG: 'org', AZDO_PROJECT: 'Proj', AZDO_TEAM: 'Team' },
      userEmail: 'dev@x.com',
      context: { page: '/board', item: { id: 99, type: 'Product Backlog Item', title: 'Login', state: 'Committed' } },
    });
    assert.match(ctx, /#99/);

    const agyPayload = buildTurnPayload({
      provider: 'agy',
      prompt: '/azdevops-finish-pbi 99',
      contextSummary: ctx,
      skillsRegistry: reg,
    });
    assert.match(agyPayload, /<skill_instructions name="azdevops-finish-pbi"/);
    assert.match(agyPayload, /Argumentos \(\$ARGUMENTS\) passados pelo usuário: 99/);

    const claudePayload = buildTurnPayload({
      provider: 'claude',
      prompt: '/azdevops-finish-pbi 99',
      contextSummary: '',
      skillsRegistry: reg,
    });
    assert.match(claudePayload, /\/azdevops-finish-pbi 99$/);
    assert.doesNotMatch(claudePayload, /<skill_instructions/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('createJsonStreamExtractor extrai deltas, tools e session_id para claude e codex', () => {
  const deltas = [];
  const tools = [];
  let sid = null;

  const feedClaude = createJsonStreamExtractor('claude', {
    onDelta: (t) => deltas.push(t),
    onTool: (n, i) => tools.push(cleanToolLabel(n, i)),
    onSessionId: (s) => {
      sid = s;
    },
    onError: () => {},
  });

  feedClaude(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-123' }));
  feedClaude(
    JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'mcp__azure-devops__wit_work_item_write', input: { action: 'create' } } },
    }),
  );
  feedClaude(
    JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Olá ' } },
    }),
  );
  feedClaude(
    JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'mundo!' } },
    }),
  );
  // Mensagem consolidada no fim não deve duplicar texto já emitido em stream_event:
  feedClaude(JSON.stringify({ type: 'result', subtype: 'success', result: 'Olá mundo!', session_id: 'sess-123' }));

  assert.equal(sid, 'sess-123');
  assert.equal(deltas.join(''), 'Olá mundo!');
  assert.deepEqual(tools, ['wit_work_item_write (create)']);
  assert.equal(isMutatingToolName('mcp__azure-devops__wit_work_item_write', { action: 'create' }), true);
  assert.equal(isMutatingToolName('mcp__azure-devops__wit_work_item', { action: 'get' }), false);

  const codexDeltas = [];
  let codexSid = null;
  const feedCodex = createJsonStreamExtractor('codex', {
    onDelta: (t) => codexDeltas.push(t),
    onTool: () => {},
    onSessionId: (s) => {
      codexSid = s;
    },
    onError: () => {},
  });
  feedCodex(JSON.stringify({ type: 'thread.started', thread_id: 'th-456' }));
  feedCodex(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Feito no Codex' } }));
  assert.equal(codexSid, 'th-456');
  assert.equal(codexDeltas.join(''), 'Feito no Codex');
  assert.equal(stripAnsi('\x1b[32mOK\x1b[0m\r\n'), 'OK\n');
});

test('endpoint /api/agents/chat faz streaming SSE e sinaliza mutated em escrita MCP', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'azdo-agent-http-'));
  const fakeBinDir = path.join(tmp, 'bin');
  fs.mkdirSync(fakeBinDir);
  for (const b of ['claude', 'codex', 'kiro-cli', 'agy']) {
    const p = path.join(fakeBinDir, b);
    fs.writeFileSync(p, '#!/bin/sh\necho "1.0.0"\n', { mode: 0o755 });
  }

  const spawned = [];
  const fakeSpawn = (command, args) => {
    if (args[0] === '--version') {
      const ee = new EventEmitter();
      ee.stdout = new PassThrough();
      ee.stderr = new PassThrough();
      ee.kill = () => {};
      setImmediate(() => {
        ee.stdout.end('fake 1.0.0\n');
        ee.emit('close', 0);
      });
      return ee;
    }
    spawned.push({ command, args });
    const ee = new EventEmitter();
    ee.stdout = new PassThrough();
    ee.stderr = new PassThrough();
    ee.kill = () => {};
    setImmediate(() => {
      ee.stdout.write(`${JSON.stringify({ type: 'system', session_id: 'cli-abc' })}\n`);
      ee.stdout.write(
        `${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'mcp__azure-devops__wit_work_item_write', input: { action: 'update' } } } })}\n`,
      );
      ee.stdout.write(`${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Task #12 atualizada!' } } })}\n`);
      ee.stdout.end();
      ee.emit('close', 0);
    });
    return ee;
  };

  const agents = createAgentService({
    env: { PATH: fakeBinDir, AZDO_DEMO: '1', AZDO_ORG: 'demo', AZDO_PROJECT: 'Proj', AZDO_TEAM: 'Team' },
    repoRoot: tmp,
    homeDir: tmp,
    spawnImpl: fakeSpawn,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/agents', agents.createRouter());
  app.use('/api', errorHandler);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const port = server.address().port;
    const metaRes = await fetch(`http://127.0.0.1:${port}/api/agents/meta`);
    const meta = await metaRes.json();
    assert.equal(meta.enabled, true);
    assert.equal(meta.providers.length, 4);
    assert.ok(meta.providers.every((p) => p.installed));

    const chatRes = await fetch(`http://127.0.0.1:${port}/api/agents/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'claude', prompt: 'Atualize a task #12' }),
    });
    assert.equal(chatRes.status, 200);
    const body = await chatRes.text();
    const events = body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)));

    assert.equal(events[0].type, 'init');
    assert.ok(events.some((e) => e.type === 'tool' && e.name === 'wit_work_item_write (update)'));
    assert.ok(events.some((e) => e.type === 'delta' && e.text === 'Task #12 atualizada!'));
    const done = events.find((e) => e.type === 'done');
    assert.equal(done.mutated, true);
    assert.equal(spawned.length, 1);
    assert.ok(spawned[0].args.includes('--strict-mcp-config'));
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
