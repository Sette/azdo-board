#!/usr/bin/env node
// Ponte stdio MCP unificada para os 4 CLIs (Claude Code, Codex, Kiro CLI e AGY).
// Resolve credenciais do usuário logado (arquivo temporário 0600) ou do .env local,
// normaliza o PAT em base64 e delega para @azure-devops/mcp (ou proxy local em modo demo).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { normalizeBasicPat } from './auth.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const SAFE_ENV_KEYS = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'NODE_ENV',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'LANG',
  'LC_ALL',
  'TZ',
  'MCP_DEBUG',
];

function parseDotEnv(filePath) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function readCredJson(filePath, maxAgeMs = 24 * 3600 * 1000) {
  if (!filePath) return null;
  try {
    const st = fs.statSync(filePath);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return null;
    if (Date.now() - st.mtimeMs > maxAgeMs) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function resolveBridgeConfig() {
  const uid = process.getuid?.() ?? 'default';
  const fallbackFile = path.join(os.tmpdir(), `azdo-board-mcp-${uid}.json`);
  const fromRunFile = readCredJson(process.env.AZDO_MCP_CRED_FILE);
  const fromActiveFile = fromRunFile || readCredJson(fallbackFile);
  const dotEnv = parseDotEnv(path.join(repoRoot, '.env'));

  const demo =
    fromActiveFile?.demo === true ||
    process.env.AZDO_DEMO === '1' ||
    (!fromActiveFile && dotEnv.AZDO_DEMO === '1');

  const org = fromActiveFile?.org || process.env.AZDO_ORG || dotEnv.AZDO_ORG || '';
  const me = fromActiveFile?.me || process.env.AZDO_ME || dotEnv.AZDO_ME || '';
  const rawPat = fromActiveFile?.pat || process.env.PERSONAL_ACCESS_TOKEN || dotEnv.PERSONAL_ACCESS_TOKEN || '';
  const apiPort = Number(fromActiveFile?.apiPort || process.env.PORT || dotEnv.PORT || 3001);

  return { demo, org, me, rawPat, apiPort };
}

async function startDemoStdioServer(apiPort) {
  const baseUrl = `http://127.0.0.1:${apiPort}/api`;
  const callApi = async (method, urlPath, body) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'x-requested-with': 'azdo-board',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  };

  const server = new Server(
    { name: 'azure-devops', version: '0.1.0-demo' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'wit_work_item',
        description: 'Read Azure DevOps work items (get, list_backlog, search) in demo mode',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get', 'backlog', 'search', 'meta'] },
            id: { type: 'number' },
            q: { type: 'string' },
          },
          required: ['action'],
        },
      },
      {
        name: 'wit_work_item_write',
        description: 'Create, update or comment on Azure DevOps work items in demo mode',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'update', 'comment'] },
            id: { type: 'number' },
            type: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            state: { type: 'string' },
            parentId: { type: 'number' },
            changes: { type: 'object' },
            text: { type: 'string' },
          },
          required: ['action'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      let data;
      if (name === 'wit_work_item') {
        if (args.action === 'get') data = await callApi('GET', `/items/${args.id}`);
        else if (args.action === 'backlog') data = await callApi('GET', '/backlog');
        else if (args.action === 'meta') data = await callApi('GET', '/meta');
        else data = await callApi('GET', `/search?q=${encodeURIComponent(args.q || '')}`);
      } else if (name === 'wit_work_item_write') {
        if (args.action === 'create') {
          data = await callApi('POST', '/items', {
            type: args.type || 'Task',
            title: args.title,
            description: args.description,
            parentId: args.parentId,
          });
        } else if (args.action === 'update') {
          data = await callApi('PATCH', `/items/${args.id}`, args.changes || { state: args.state, title: args.title, description: args.description });
        } else if (args.action === 'comment') {
          data = await callApi('POST', `/items/${args.id}/comments`, { text: args.text });
        } else {
          throw new Error(`Unsupported write action: ${args.action}`);
        }
      } else {
        throw new Error(`Unknown demo tool: ${name}`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function main() {
  const { demo, org, me, rawPat, apiPort } = resolveBridgeConfig();
  if (demo) {
    await startDemoStdioServer(apiPort);
    return;
  }

  if (!org) {
    process.stderr.write('[mcp-bridge] AZDO_ORG is not configured.\n');
    process.exit(1);
  }
  if (!rawPat) {
    process.stderr.write('[mcp-bridge] PERSONAL_ACCESS_TOKEN is not configured.\n');
    process.exit(1);
  }

  const b64Pat = normalizeBasicPat(rawPat, me);
  const pkg = require.resolve('@azure-devops/mcp/package.json');
  const entry = path.join(path.dirname(pkg), 'dist', 'index.js');

  const childEnv = { PERSONAL_ACCESS_TOKEN: b64Pat };
  for (const k of SAFE_ENV_KEYS) {
    if (process.env[k] !== undefined) childEnv[k] = process.env[k];
  }

  const child = spawn(process.execPath, [entry, org, '-a', 'pat'], {
    env: childEnv,
    stdio: 'inherit',
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      if (!child.killed) child.kill(sig);
    });
  }

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  process.stderr.write(`[mcp-bridge] ${err.message}\n`);
  process.exit(1);
});
