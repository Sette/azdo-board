// Cliente MCP: sobe o servidor @azure-devops/mcp via stdio e expõe callTool().
import { createRequire } from 'node:module';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);

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

let clientPromise = null;

async function connect() {
  const { AZDO_ORG, PERSONAL_ACCESS_TOKEN } = process.env;
  if (!AZDO_ORG) throw new McpError('AZDO_ORG is not set', { status: 500, code: 'missingEnv', params: { name: 'AZDO_ORG' } });
  if (!PERSONAL_ACCESS_TOKEN) throw new McpError('PERSONAL_ACCESS_TOKEN is not set', { status: 500, code: 'missingEnv', params: { name: 'PERSONAL_ACCESS_TOKEN' } });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry(), AZDO_ORG, '-a', 'pat'],
    env: { ...process.env, PERSONAL_ACCESS_TOKEN },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (d) => {
    const line = d.toString().trim();
    if (line && process.env.MCP_DEBUG) console.error('[mcp]', line);
  });

  const client = new Client({ name: 'azdo-board', version: '0.1.0' });
  transport.onclose = () => {
    console.warn('[mcp] connection closed; reconnecting on next call');
    clientPromise = null;
  };
  await client.connect(transport);
  console.log('[mcp] connected to Azure DevOps', AZDO_ORG);
  return client;
}

export function getClient() {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
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

export async function callTool(name, args = {}, { timeoutMs = 60_000 } = {}) {
  const client = await getClient();
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
    throw new McpError(text || `${name} failed`, { status: conflict ? 409 : 502, tool: name });
  }
  return pickPayload(parts);
}

// Algumas tools devolvem um cabeçalho em texto antes do JSON: fica com a parte estruturada.
export function pickPayload(parts) {
  const structured = parts.filter((p) => p !== null && typeof p === 'object');
  if (structured.length === 1) return structured[0];
  if (structured.length > 1) return structured;
  return parts.join('\n');
}

export async function closeClient() {
  if (!clientPromise) return;
  const client = await clientPromise.catch(() => null);
  clientPromise = null;
  await client?.close();
}
