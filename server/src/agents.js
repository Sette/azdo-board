// Orquestrador local dos CLIs de agentes (Claude Code, Codex, Kiro CLI e Antigravity/AGY)
// com streaming SSE, repasse seguro de credenciais MCP do Azure DevOps e suporte a skills.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { normalizeBasicPat, patFingerprint } from './auth.js';
import { McpError } from './mcp.js';
import { createSkillsRegistry } from './skills.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../..');
export const MCP_BRIDGE_PATH = path.resolve(here, './mcp-bridge.js');

export const PROVIDER_SPECS = [
  { id: 'claude', label: 'Claude Code', shortLabel: 'Claude', binary: 'claude' },
  { id: 'codex', label: 'OpenAI Codex', shortLabel: 'Codex', binary: 'codex' },
  { id: 'kiro', label: 'Kiro CLI', shortLabel: 'Kiro', binary: 'kiro-cli' },
  { id: 'agy', label: 'Antigravity (AGY)', shortLabel: 'AGY', binary: 'agy' },
];

const SAFE_CHILD_ENV_KEYS = [
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TZ',
  'TERM',
  'COLORTERM',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS',
  'SSH_AUTH_SOCK',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  // Variáveis de autenticação de provedores caso configuradas no ambiente:
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'OPENAI_API_KEY',
  'CODEX_HOME',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
];

// Remove sequências ANSI CSI/OSC e caracteres de controle de spinner do terminal.
export function stripAnsi(input) {
  return String(input || '')
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[@-_]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '');
}

export function isMutatingToolName(name, input) {
  const n = String(name || '').toLowerCase();
  if (/write|create|update|delete|remove|patch|add_child|add_comment|comment|link|unlink|attachment|move/i.test(n)) {
    return true;
  }
  const action = String(input?.action || '').toLowerCase();
  if (action && /^(create|update|delete|remove|add|patch|move|comment|upload|link|unlink)/.test(action)) {
    return true;
  }
  return false;
}

export function cleanToolLabel(rawName, input) {
  const short = String(rawName || 'tool')
    .replace(/^mcp__azure[-_]devops__/, '')
    .replace(/^@?azure[-_]devops[/:.]/, '');
  const action = typeof input?.action === 'string' ? input.action : null;
  return action ? `${short} (${action})` : short;
}

export function buildExtendedPath(baseEnv = process.env, homeDir = os.homedir()) {
  const dirs = [];
  const add = (p) => {
    if (p && !dirs.includes(p)) dirs.push(p);
  };

  add(path.join(homeDir, '.local', 'bin'));
  add(path.dirname(process.execPath));

  const nvmVersionsDir = path.join(baseEnv.NVM_DIR || path.join(homeDir, '.nvm'), 'versions', 'node');
  try {
    const versions = fs
      .readdirSync(nvmVersionsDir)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) add(path.join(nvmVersionsDir, v, 'bin'));
  } catch {
    /* nvm opcional */
  }

  for (const part of String(baseEnv.PATH || '').split(path.delimiter)) {
    add(part.trim());
  }
  add('/usr/local/bin');
  add('/usr/bin');
  add('/bin');

  return dirs.join(path.delimiter);
}

export function resolveExecutable(binary, searchPath) {
  if (!binary) return null;
  if (path.isAbsolute(binary)) {
    try {
      fs.accessSync(binary, fs.constants.X_OK);
      return binary;
    } catch {
      return null;
    }
  }
  for (const dir of String(searchPath || '').split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, binary);
    try {
      const st = fs.statSync(full);
      if (st.isFile()) {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      }
    } catch {
      /* próximo diretório */
    }
  }
  return null;
}

function probeVersion(binPath, env) {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    let child;
    try {
      child = spawn(binPath, ['--version'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return done(null);
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(null);
    }, 3000);
    child.stdout?.on('data', (d) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      done(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const firstLine = stripAnsi(out).trim().split('\n')[0]?.trim() || null;
      done(firstLine ? firstLine.slice(0, 80) : null);
    });
  });
}

export function buildContextSummary({ env, userEmail, context }) {
  const lines = [
    'Você é o Copiloto integrado ao dashboard azdo-board (Azure DevOps).',
    `- Organização Azure DevOps: ${env.AZDO_ORG || '(demo)'}`,
    `- Projeto: ${env.AZDO_PROJECT || '(demo)'}`,
    `- Time: ${env.AZDO_TEAM || '(demo)'}`,
    ...(userEmail || env.AZDO_ME ? [`- Usuário atual: ${userEmail || env.AZDO_ME}`] : []),
    '- Servidor MCP conectado: `azure-devops` (@azure-devops/mcp). SEMPRE passe `project` (e `team` quando aceito pela tool) nas chamadas MCP.',
    '- Não altere o código-fonte do repositório `azdo-board` a menos que o usuário peça explicitamente; seu foco principal é consultar/operar o Azure DevOps via MCP e executar skills.',
    '- Antes de criar ou alterar work items em lote no Azure DevOps, respeite as confirmações previstas nas skills.',
  ];

  if (context && typeof context === 'object') {
    const ctxLines = [];
    if (context.page) ctxLines.push(`Página aberta no dash: ${context.page}`);
    if (context.sprintName || context.sprintPath) {
      ctxLines.push(`Sprint em foco: ${context.sprintName || context.sprintPath}${context.sprintPath ? ` (IterationPath: ${context.sprintPath})` : ''}`);
    }
    if (context.item && context.item.id) {
      const it = context.item;
      ctxLines.push(
        `Work Item aberto na tela: #${it.id} [${it.type || 'Item'}] "${it.title || ''}" | Estado: ${it.state || '?'} | Sprint: ${it.sprint || it.iterationPath || 'Backlog'} | Responsável: ${it.assignee || 'Não atribuído'}${it.parentId ? ` | Pai: #${it.parentId}` : ''}${Array.isArray(it.tags) && it.tags.length ? ` | Tags: ${it.tags.join('; ')}` : ''}`,
      );
    }
    if (ctxLines.length) {
      lines.push('', 'Contexto atual da tela do usuário:', ...ctxLines.map((l) => `- ${l}`));
    }
  }

  return lines.join('\n');
}

export function buildTurnPayload({
  provider,
  prompt,
  contextSummary,
  skillsRegistry,
  history = [],
  hasNativeResume = false,
  homeDir = os.homedir(),
}) {
  const slash = skillsRegistry.parseSlashSkill(prompt);
  const parts = [];

  if (!hasNativeResume) {
    parts.push(`<dashboard_context>\n${contextSummary}\n</dashboard_context>`);
    if (history.length > 0) {
      const formatted = history
        .slice(-8)
        .map((h) => `${h.role === 'user' ? 'Usuário' : 'Assistente'}:\n${h.text}`)
        .join('\n\n---\n\n');
      parts.push(`<conversation_history>\n${formatted}\n</conversation_history>`);
    }
  }

  // Claude Code resolve /skill nativamente em ~/.claude/skills; para os demais CLIs (ou skills fora do ~/.claude),
  // injetamos o SKILL.md completo com instruções de portabilidade de tools MCP e sub-skills.
  if (slash && (provider !== 'claude' || slash.skill.source !== 'claude')) {
    const skillsDir = path.join(homeDir, '.claude', 'skills');
    parts.push(
      [
        `<skill_instructions name="${slash.skill.name}" path="${slash.skill.filePath}">`,
        'Adaptação de ambiente para este CLI:',
        '- As tools do servidor MCP `azure-devops` estão disponíveis diretamente na sua sessão (equivalentes às tools `mcp__azure-devops__*` citadas abaixo, ex.: `wit_work_item`, `wit_work_item_write`, `wit_query`, `work`).',
        `- Quando a skill mandar chamar outra skill via "Skill tool" (ex.: \`azdevops-generate-item-description\` ou \`azdevops-generate-tasks\`), leia o arquivo correspondente em \`${skillsDir}/<nome-da-skill>/SKILL.md\` e siga seus passos.`,
        `- Argumentos ($ARGUMENTS) passados pelo usuário: ${slash.args || '(vazio)'}`,
        '',
        slash.skill.content,
        '</skill_instructions>',
      ].join('\n'),
    );
    parts.push(
      slash.args
        ? `Execute a skill /${slash.skill.name} com o seguinte contexto/argumentos: ${slash.args}`
        : `Execute a skill /${slash.skill.name} considerando o contexto atual.`,
    );
  } else {
    parts.push(String(prompt || '').trim());
  }

  return parts.join('\n\n');
}

// Parser de eventos JSONL para Claude Code (`--output-format stream-json --include-partial-messages`)
// e compatível com variações do Antigravity CLI (`agy -p --output-format stream-json`).
export function createJsonStreamExtractor(provider, { onDelta, onTool, onSessionId, onError }) {
  let sawDeltaText = false;
  let lastCodexAgentText = '';

  function handleClaudeOrAgy(obj) {
    const sid = obj.session_id || obj.sessionId || obj.conversation_id || obj.conversationId;
    if (sid) onSessionId(String(sid));

    if (obj.type === 'stream_event' && obj.event) {
      const ev = obj.event;
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        sawDeltaText = true;
        onDelta(ev.delta.text);
      } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
        onTool(ev.content_block.name, ev.content_block.input);
      }
      return;
    }

    if ((obj.type === 'delta' || obj.type === 'text_delta' || obj.type === 'chunk') && typeof obj.text === 'string') {
      sawDeltaText = true;
      onDelta(obj.text);
      return;
    }

    if (obj.type === 'tool_use' || obj.type === 'tool_call') {
      onTool(obj.name || obj.tool || obj.tool_name, obj.input || obj.arguments || obj.args);
      return;
    }

    if (obj.type === 'assistant' && obj.message?.content) {
      const blocks = Array.isArray(obj.message.content) ? obj.message.content : [];
      for (const b of blocks) {
        if (b?.type === 'tool_use') {
          onTool(b.name, b.input);
        } else if (b?.type === 'text' && b.text && !sawDeltaText) {
          sawDeltaText = true;
          onDelta(b.text);
        }
      }
      return;
    }

    if (obj.type === 'message' && obj.role === 'assistant' && typeof obj.content === 'string' && !sawDeltaText) {
      sawDeltaText = true;
      onDelta(obj.content);
      return;
    }

    if (obj.type === 'error') {
      const errText = obj.error?.message || obj.message || JSON.stringify(obj);
      onError(String(errText));
      return;
    }

    if (obj.type === 'result') {
      if (obj.is_error) {
        onError(String(obj.result || obj.error || 'Agent execution failed'));
        return;
      }
      const resText = typeof obj.result === 'string' ? obj.result : typeof obj.response === 'string' ? obj.response : null;
      if (resText && !sawDeltaText) {
        sawDeltaText = true;
        onDelta(resText);
      }
    }
  }

  function handleCodex(obj) {
    if (obj.type === 'thread.started' && obj.thread_id) {
      onSessionId(String(obj.thread_id));
      return;
    }
    if ((obj.type === 'item.started' || obj.type === 'item.updated' || obj.type === 'item.completed') && obj.item) {
      const it = obj.item;
      if (obj.type === 'item.started') {
        if (it.type === 'mcp_tool_call') {
          onTool(it.tool || it.name || 'mcp_tool', it.arguments || it.input);
        } else if (it.type === 'command_execution' && it.command) {
          onTool('shell', { action: String(it.command).slice(0, 48) });
        }
      }
      if (it.type === 'agent_message' && typeof it.text === 'string') {
        if (it.text.startsWith(lastCodexAgentText)) {
          const diff = it.text.slice(lastCodexAgentText.length);
          if (diff) onDelta(diff);
        } else if (obj.type === 'item.completed' && it.text !== lastCodexAgentText) {
          onDelta((lastCodexAgentText ? '\n\n' : '') + it.text);
        }
        lastCodexAgentText = it.text;
        if (obj.type === 'item.completed') lastCodexAgentText = '';
      }
      return;
    }
    if (obj.type === 'error' || obj.type === 'turn.failed') {
      const msg = obj.message || obj.error?.message || 'Codex execution failed';
      onError(String(msg));
    }
  }

  return function feedLine(rawLine) {
    const line = rawLine.trim();
    if (!line) return;
    let parsed = null;
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        parsed = JSON.parse(line);
      } catch {
        parsed = null;
      }
    }
    if (!parsed) {
      // Fallback caso o CLI imprima texto plano (ex.: agy sem envelope JSON em alguma mensagem).
      if (provider === 'agy') {
        sawDeltaText = true;
        onDelta(`${stripAnsi(rawLine)}\n`);
      }
      return;
    }
    if (provider === 'codex') handleCodex(parsed);
    else handleClaudeOrAgy(parsed);
  };
}

export function activeCredFallbackPath(uid = process.getuid?.() ?? 'default') {
  return path.join(os.tmpdir(), `azdo-board-mcp-${uid}.json`);
}

function writePrivateJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* sistemas sem chmod POSIX */
  }
}

export function createAgentService({
  env = process.env,
  repoRoot = REPO_ROOT,
  bridgePath = MCP_BRIDGE_PATH,
  homeDir = os.homedir(),
  skillsRegistry = createSkillsRegistry({ repoRoot, homeDir }),
  spawnImpl = spawn,
} = {}) {
  const isCloudRun = Boolean(env.K_SERVICE);
  const enabled = !isCloudRun && !/^(0|false|no|off)$/i.test(String(env.AGENTS_ENABLED ?? 'true').trim());
  const extendedPath = buildExtendedPath(env, homeDir);

  let providersCache = null;
  const sessions = new Map(); // sessionId -> { id, ownerKey, provider, cliSessionId, history, updatedAt }
  const activeRuns = new Map(); // runId -> { ownerKey, abort }

  async function detectProviders({ force = false } = {}) {
    if (!enabled) return [];
    if (providersCache && !force && Date.now() - providersCache.at < 60_000) {
      return providersCache.items;
    }
    const childEnv = { ...env, PATH: extendedPath };
    const items = await Promise.all(
      PROVIDER_SPECS.map(async (spec) => {
        const binPath = resolveExecutable(spec.binary, extendedPath);
        const version = binPath ? await probeVersion(binPath, childEnv) : null;
        return {
          id: spec.id,
          label: spec.label,
          shortLabel: spec.shortLabel,
          binary: spec.binary,
          binPath,
          installed: Boolean(binPath),
          version,
        };
      }),
    );
    providersCache = { at: Date.now(), items };
    return items;
  }

  function resolveOwnerAndCreds(req) {
    const demo = env.AZDO_DEMO === '1';
    const userEmail = req.user?.email || env.AZDO_ME || '';
    let b64Pat = '';
    if (!demo) {
      const raw = req.userPat || env.PERSONAL_ACCESS_TOKEN || '';
      if (!raw) {
        throw new McpError('Azure DevOps PAT required', { status: 403, code: 'patRequired' });
      }
      b64Pat = normalizeBasicPat(raw, userEmail);
    }
    const ownerKey = demo ? 'demo' : patFingerprint(b64Pat);
    return {
      ownerKey,
      creds: {
        org: env.AZDO_ORG || 'demo-org',
        project: env.AZDO_PROJECT || 'Demo',
        team: env.AZDO_TEAM || 'Demo Team',
        me: userEmail,
        pat: b64Pat,
        demo,
        apiPort: Number(env.PORT || 3001),
        updatedAt: Date.now(),
      },
    };
  }

  function getOrCreateSession(sessionId, ownerKey, provider) {
    if (sessionId && sessions.has(sessionId)) {
      const existing = sessions.get(sessionId);
      if (existing.ownerKey === ownerKey && existing.provider === provider) {
        existing.updatedAt = Date.now();
        return existing;
      }
    }
    if (sessions.size >= 50) {
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    const id = crypto.randomUUID();
    const created = {
      id,
      ownerKey,
      provider,
      cliSessionId: null,
      history: [],
      updatedAt: Date.now(),
    };
    sessions.set(id, created);
    return created;
  }

  function buildSpawnCommand({ provider, binPath, session, effectivePrompt, contextSummary, credFile, claudeMcpFile }) {
    if (provider === 'claude') {
      const args = [
        '-p',
        '--verbose',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--strict-mcp-config',
        '--mcp-config',
        claudeMcpFile,
        '--allowedTools',
        'mcp__azure-devops__*,Read,Glob,Grep,Skill,Bash(git status:*),Bash(git log:*),Bash(git diff:*),Bash(git branch:*)',
      ];
      if (session.cliSessionId) {
        args.push('--resume', session.cliSessionId);
      } else {
        args.push('--append-system-prompt', contextSummary);
      }
      args.push(effectivePrompt);
      return { command: binPath, args };
    }

    if (provider === 'codex') {
      const mcpOverrides = [
        '-c',
        `mcp_servers.azure-devops.command=${JSON.stringify(process.execPath)}`,
        '-c',
        `mcp_servers.azure-devops.args=${JSON.stringify([bridgePath])}`,
        '-c',
        'mcp_servers.azure-devops.env_vars=["AZDO_MCP_CRED_FILE","AZDO_ORG","AZDO_PROJECT","AZDO_TEAM","AZDO_ME","PERSONAL_ACCESS_TOKEN","AZDO_DEMO"]',
      ];
      const args = session.cliSessionId
        ? ['exec', 'resume', session.cliSessionId, '--json', '--skip-git-repo-check', '-s', 'danger-full-access', ...mcpOverrides, effectivePrompt]
        : ['exec', '--json', '--skip-git-repo-check', '-s', 'danger-full-access', ...mcpOverrides, effectivePrompt];
      return { command: binPath, args };
    }

    if (provider === 'agy') {
      const args = [
        '--mode',
        'auto',
        '--dangerously-skip-permissions',
        '-p',
        '--output-format',
        'stream-json',
      ];
      if (session.cliSessionId) args.push('--resume', session.cliSessionId);
      args.push(effectivePrompt);
      return { command: binPath, args };
    }

    if (provider === 'kiro') {
      const args = [
        'chat',
        '--no-interactive',
        '-a',
        '--wrap',
        'never',
        '--agent',
        'azdo-copilot',
        effectivePrompt,
      ];
      return { command: binPath, args };
    }

    throw new McpError(`Unsupported agent provider: ${provider}`, { status: 400, code: 'invalidAgentProvider' });
  }

  function buildChildProcessEnv(creds, credFile) {
    const childEnv = {
      PATH: extendedPath,
      HOME: homeDir,
      AZDO_MCP_CRED_FILE: credFile,
      AZDO_ORG: creds.org,
      AZDO_PROJECT: creds.project,
      AZDO_TEAM: creds.team,
      AZDO_ME: creds.me,
      PERSONAL_ACCESS_TOKEN: creds.pat,
      AZDO_DEMO: creds.demo ? '1' : '0',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      CI: '1',
    };
    for (const k of SAFE_CHILD_ENV_KEYS) {
      if (env[k] !== undefined && childEnv[k] === undefined) {
        childEnv[k] = env[k];
      }
    }
    return childEnv;
  }

  function createRouter() {
    const r = Router();

    r.get('/meta', async (_req, res, next) => {
      try {
        if (!enabled) {
          return res.json({ enabled: false, providers: [], skills: [] });
        }
        const providers = await detectProviders();
        const skills = skillsRegistry.listSkills();
        return res.json({
          enabled: true,
          providers: providers.map(({ binPath, ...pub }) => pub),
          skills,
        });
      } catch (err) {
        return next(err);
      }
    });

    r.post('/stop', (req, res) => {
      const runId = String(req.body?.runId || '');
      const entry = activeRuns.get(runId);
      if (entry) {
        entry.abort();
        return res.json({ ok: true, stopped: true });
      }
      return res.json({ ok: true, stopped: false });
    });

    r.post('/chat', async (req, res, next) => {
      if (!enabled) {
        return next(new McpError('Local AI CLI agents are disabled in this environment', { status: 403, code: 'agentsDisabled' }));
      }

      let ownerAndCreds;
      try {
        ownerAndCreds = resolveOwnerAndCreds(req);
      } catch (err) {
        return next(err);
      }

      const providerId = String(req.body?.provider || 'claude').trim().toLowerCase();
      const prompt = String(req.body?.prompt || '').trim();
      if (!prompt) {
        return next(new McpError('Empty prompt', { status: 400, code: 'emptyAgentPrompt' }));
      }

      const providers = await detectProviders();
      const spec = providers.find((p) => p.id === providerId);
      if (!spec) {
        return next(new McpError(`Unknown provider: ${providerId}`, { status: 400, code: 'invalidAgentProvider' }));
      }
      if (!spec.installed || !spec.binPath) {
        return next(new McpError(`${spec.label} (${spec.binary}) is not installed on PATH`, { status: 400, code: 'agentNotInstalled', params: { name: spec.label } }));
      }

      const { ownerKey, creds } = ownerAndCreds;
      const session = getOrCreateSession(req.body?.sessionId, ownerKey, providerId);
      const runId = crypto.randomUUID();

      const credFile = path.join(os.tmpdir(), `azdo-mcp-run-${runId}.json`);
      const claudeMcpFile = path.join(os.tmpdir(), `azdo-claude-mcp-${runId}.json`);
      const cleanupFiles = () => {
        for (const f of [credFile, claudeMcpFile]) {
          try {
            fs.unlinkSync(f);
          } catch {
            /* já removido */
          }
        }
      };

      try {
        writePrivateJson(credFile, creds);
        writePrivateJson(activeCredFallbackPath(), creds);
        if (providerId === 'claude') {
          writePrivateJson(claudeMcpFile, {
            mcpServers: {
              'azure-devops': {
                command: process.execPath,
                args: [bridgePath],
                env: {
                  AZDO_MCP_CRED_FILE: credFile,
                },
              },
            },
          });
        }
      } catch (err) {
        cleanupFiles();
        return next(err);
      }

      const hasNativeResume = Boolean(session.cliSessionId) && providerId !== 'kiro';
      const contextSummary = buildContextSummary({
        env,
        userEmail: creds.me,
        context: req.body?.context,
      });
      const effectivePrompt = buildTurnPayload({
        provider: providerId,
        prompt,
        contextSummary: providerId === 'claude' && !session.cliSessionId ? '' : contextSummary,
        skillsRegistry,
        history: session.history,
        hasNativeResume,
        homeDir,
      });

      let spawnSpec;
      try {
        spawnSpec = buildSpawnCommand({
          provider: providerId,
          binPath: spec.binPath,
          session,
          effectivePrompt,
          contextSummary,
          credFile,
          claudeMcpFile,
        });
      } catch (err) {
        cleanupFiles();
        return next(err);
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let closed = false;
      const send = (payload) => {
        if (closed || res.writableEnded) return;
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      send({ type: 'init', runId, sessionId: session.id, provider: providerId });

      const keepAlive = setInterval(() => {
        if (!closed && !res.writableEnded) res.write(': keepalive\n\n');
      }, 15_000);
      keepAlive.unref?.();

      let assistantText = '';
      let stderrBuf = '';
      let mutated = false;
      let reportedError = null;

      const childEnv = buildChildProcessEnv(creds, credFile);
      let child;
      try {
        child = spawnImpl(spawnSpec.command, spawnSpec.args, {
          cwd: repoRoot,
          env: childEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        clearInterval(keepAlive);
        cleanupFiles();
        send({ type: 'error', message: err.message });
        res.end();
        return undefined;
      }

      const abortChild = () => {
        if (!child || child.killed) return;
        try {
          child.kill('SIGTERM');
          setTimeout(() => {
            try {
              if (!child.killed) child.kill('SIGKILL');
            } catch {
              /* processo já encerrado */
            }
          }, 2000).unref?.();
        } catch {
          /* processo já encerrado */
        }
      };

      activeRuns.set(runId, { ownerKey, abort: abortChild });

      res.on('close', () => {
        if (!res.writableEnded) {
          closed = true;
          abortChild();
        }
      });

      if (providerId === 'kiro') {
        child.stdout?.on('data', (chunk) => {
          const clean = stripAnsi(chunk.toString());
          if (!clean) return;
          assistantText += clean;
          if (/wit_work_item_write|create_work_item|update_work_item|add_child|add_comment/i.test(clean)) {
            mutated = true;
          }
          send({ type: 'delta', text: clean });
        });
      } else {
        let lineBuf = '';
        const feedLine = createJsonStreamExtractor(providerId, {
          onDelta: (text) => {
            assistantText += text;
            send({ type: 'delta', text });
          },
          onTool: (toolName, input) => {
            if (isMutatingToolName(toolName, input)) mutated = true;
            send({ type: 'tool', name: cleanToolLabel(toolName, input) });
          },
          onSessionId: (sid) => {
            session.cliSessionId = sid;
          },
          onError: (errMsg) => {
            reportedError = errMsg;
          },
        });

        child.stdout?.on('data', (chunk) => {
          lineBuf += chunk.toString('utf8');
          let nl = lineBuf.indexOf('\n');
          while (nl >= 0) {
            const line = lineBuf.slice(0, nl);
            lineBuf = lineBuf.slice(nl + 1);
            feedLine(line);
            nl = lineBuf.indexOf('\n');
          }
        });

        child.stdout?.on('end', () => {
          if (lineBuf.trim()) {
            feedLine(lineBuf);
            lineBuf = '';
          }
        });
      }

      child.stderr?.on('data', (chunk) => {
        const clean = stripAnsi(chunk.toString());
        if (stderrBuf.length < 8000) stderrBuf += clean;
      });

      child.on('error', (err) => {
        reportedError = err.message;
      });

      child.on('close', (code) => {
        clearInterval(keepAlive);
        activeRuns.delete(runId);
        cleanupFiles();

        if (closed) return;

        if (assistantText.trim()) {
          session.history.push({ role: 'user', text: prompt });
          session.history.push({ role: 'assistant', text: assistantText.trim() });
          if (session.history.length > 24) {
            session.history.splice(0, session.history.length - 24);
          }
        }

        if (reportedError || (code !== 0 && !assistantText.trim())) {
          const detail = reportedError || stderrBuf.trim().slice(-600) || `${spec.label} exited with code ${code}`;
          send({ type: 'error', message: detail });
        }

        send({
          type: 'done',
          sessionId: session.id,
          mutated,
          exitCode: code ?? 0,
        });
        res.end();
      });

      return undefined;
    });

    return r;
  }

  function closeAll() {
    for (const run of activeRuns.values()) {
      run.abort();
    }
    activeRuns.clear();
  }

  return {
    enabled,
    detectProviders,
    skillsRegistry,
    createRouter,
    closeAll,
  };
}
