// Cliente MCP: sobe o servidor @azure-devops/mcp via stdio e expõe callTool() + pool multi-usuário.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);

// Variáveis seguras do sistema repassadas ao subprocesso MCP (sem vazar SESSION_SECRET, etc.).
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

export class McpError extends Error {
  // code + params: mensagem traduzida na resposta (ver i18n.js).
  constructor(message, { status = 502, tool, code, params } = {}) {
    super(message);
    this.status = status;
    this.tool = tool;
    this.code = code;
    this.params = params;
  }
}

function serverEntry() {
  const pkg = require.resolve('@azure-devops/mcp/package.json');
  return path.join(path.dirname(pkg), 'dist', 'index.js');
}

function buildChildEnv(baseEnv, b64Pat) {
  const childEnv = { PERSONAL_ACCESS_TOKEN: b64Pat };
  for (const key of SAFE_ENV_KEYS) {
    if (baseEnv[key] !== undefined) childEnv[key] = baseEnv[key];
  }
  return childEnv;
}

// O servidor envolve o JSON em marcadores "<<hash>> [UNTRUSTED ...] <<hash>> ... <</hash>>".
export function unwrap(text) {
  if (typeof text !== 'string') return text;
  let body = text.trim();
  const open = body.match(/^<<([0-9a-f]+)>>[^\n]*<<\1>>\s*/);
  if (open) {
    body = body.slice(open[0].length);
    const close = `<</${open[1]}>>`;
    const end = body.lastIndexOf(close);
    if (end >= 0) body = body.slice(0, end);
  }
  body = body.trim();
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// Algumas tools devolvem um cabeçalho em texto antes do JSON: fica com a parte estruturada.
export function pickPayload(parts) {
  const structured = parts.filter((p) => p !== null && typeof p === 'object');
  if (structured.length === 1) return structured[0];
  if (structured.length > 1) return structured;
  return parts.join('\n');
}

async function spawnMcpClient({ org, pat, env = process.env, onClose }) {
  if (!org) throw new McpError('AZDO_ORG is not set', { status: 500, code: 'missingEnv', params: { name: 'AZDO_ORG' } });
  if (!pat) {
    throw new McpError('PERSONAL_ACCESS_TOKEN is not set', {
      status: 500,
      code: 'missingEnv',
      params: { name: 'PERSONAL_ACCESS_TOKEN' },
    });
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry(), org, '-a', 'pat'],
    env: buildChildEnv(env, pat),
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (d) => {
    const line = d.toString().trim();
    if (line && env.MCP_DEBUG) console.error('[mcp]', line);
  });

  const client = new Client({ name: 'azdo-board', version: '0.1.0' });
  transport.onclose = () => {
    onClose?.();
  };
  await client.connect(transport);
  return client;
}

export async function invokeClientTool(client, name, args = {}, { timeoutMs = 60_000 } = {}) {
  let result;
  try {
    result = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
  } catch (err) {
    throw new McpError(`${name}: ${err.message}`, { tool: name });
  }
  const parts = (result.content || []).filter((c) => c.type === 'text').map((c) => unwrap(c.text));
  if (result.isError) {
    const text = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
    const conflict = /TF26071|TF26072|test operation|\/rev/i.test(text);
    const unauthorized = /401|403|unauthorized|TF400813|non-authoritative/i.test(text);
    throw new McpError(text || `${name} failed`, {
      status: conflict ? 409 : unauthorized ? 401 : 502,
      code: unauthorized ? 'invalidPat' : undefined,
      tool: name,
    });
  }
  return pickPayload(parts);
}

// Pool limitado de clientes MCP por usuário (hash SHA-256 do PAT), ideal para times de até ~10 pessoas no Cloud Run.
export function createMcpPool({
  env = process.env,
  maxClients = Number(env.MAX_MCP_CLIENTS || 12),
  idleTtlMs = Number(env.MCP_IDLE_TTL_MS || 15 * 60 * 1000),
  connectImpl = spawnMcpClient,
} = {}) {
  const entries = new Map(); // key -> { promise, lastUsedAt }
  const keyFor = (pat) => crypto.createHash('sha256').update(String(pat)).digest('hex');

  async function closeEntry(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    const client = await entry.promise.catch(() => null);
    await client?.close?.().catch(() => {});
  }

  async function sweepIdle(now = Date.now()) {
    const expired = [];
    for (const [k, entry] of entries) {
      if (now - entry.lastUsedAt >= idleTtlMs) expired.push(k);
    }
    await Promise.all(expired.map((k) => closeEntry(k)));
  }

  const timer = setInterval(() => {
    sweepIdle().catch(() => {});
  }, Math.min(60_000, Math.max(5_000, Math.floor(idleTtlMs / 2))));
  timer.unref?.();

  async function getClientForPat(pat) {
    const key = keyFor(pat);
    let entry = entries.get(key);
    if (entry) {
      entry.lastUsedAt = Date.now();
      // Reinsere no fim do Map para manter ordem LRU.
      entries.delete(key);
      entries.set(key, entry);
      return entry.promise;
    }

    if (entries.size >= maxClients) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey) await closeEntry(oldestKey);
    }

    const created = {
      lastUsedAt: Date.now(),
      promise: null,
    };
    created.promise = connectImpl({
      org: env.AZDO_ORG,
      pat,
      env,
      onClose: () => {
        if (entries.get(key) === created) entries.delete(key);
      },
    }).catch((err) => {
      if (entries.get(key) === created) entries.delete(key);
      throw err;
    });
    entries.set(key, created);
    return created.promise;
  }

  async function callToolForPat(pat, name, args = {}, opts) {
    const client = await getClientForPat(pat);
    return invokeClientTool(client, name, args, opts);
  }

  async function evictPat(pat) {
    if (!pat) return;
    await closeEntry(keyFor(pat));
  }

  async function closeAll() {
    clearInterval(timer);
    const keys = [...entries.keys()];
    await Promise.all(keys.map((k) => closeEntry(k)));
  }

  return {
    getClientForPat,
    callToolForPat,
    evictPat,
    sweepIdle,
    closeAll,
    size: () => entries.size,
  };
}

// Instância singleton para modo local single-user (sem GOOGLE_CLIENT_ID).
let clientPromise = null;

export function getClient() {
  if (!clientPromise) {
    clientPromise = spawnMcpClient({
      org: process.env.AZDO_ORG,
      pat: process.env.PERSONAL_ACCESS_TOKEN,
      env: process.env,
      onClose: () => {
        console.warn('[mcp] connection closed; reconnecting on next call');
        clientPromise = null;
      },
    })
      .then((c) => {
        console.log('[mcp] connected to Azure DevOps', process.env.AZDO_ORG);
        return c;
      })
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

export async function listTools() {
  const client = await getClient();
  return (await client.listTools()).tools;
}

export async function callTool(name, args = {}, opts = {}) {
  const client = await getClient();
  return invokeClientTool(client, name, args, opts);
}

export async function closeClient() {
  if (!clientPromise) return;
  const client = await clientPromise.catch(() => null);
  clientPromise = null;
  await client?.close();
}
