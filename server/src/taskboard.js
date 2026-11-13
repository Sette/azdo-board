// Team taskboard columns (sprint board). The MCP server has no tool for them, so this
// calls the Azure DevOps REST API directly with the same PAT.
// A task's column is not a work item field: it lives on the taskboard, and a column can
// only be set when the item's state is mapped to it (change the state first).
import { normalizeBasicPat } from './auth.js';
import { McpError } from './mcp.js';

const API = 'api-version=7.1-preview.1';

export function createTaskboard({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { AZDO_ORG: org, AZDO_PROJECT: project, AZDO_TEAM: team, PERSONAL_ACCESS_TOKEN: rawPat, AZDO_ME: me } = env;
  if (!org || !project || !team || !rawPat) return null;
  let pat = rawPat;
  try {
    pat = normalizeBasicPat(rawPat, me || '');
  } catch {
    pat = rawPat;
  }
  const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis/work`;
  // Normalized base64 "user:pat" Basic credential.
  const headers = { Authorization: `Basic ${pat}`, 'Content-Type': 'application/json' };

  async function req(path, init = {}) {
    const res = await fetchImpl(`${base}/${path}${path.includes('?') ? '&' : '?'}${API}`, { ...init, headers });
    const text = (await res.text()).replace(/^﻿/, '');
    if (!res.ok) {
      let message = text.slice(0, 300);
      try {
        message = JSON.parse(text).message || message;
      } catch {
        // not JSON (e.g. sign-in page)
      }
      throw new McpError(message, { status: res.status === 400 ? 409 : 502, tool: 'taskboard' });
    }
    if (res.headers.get('content-type')?.includes('text/html')) throw new McpError('taskboard: unexpected HTML response', { status: 502, tool: 'taskboard' });
    return text ? JSON.parse(text) : null;
  }

  return {
    // [{ name, mappings: { Task: 'In Progress', ... } }] or null when the team kept the default columns.
    async columns() {
      const res = await req('taskboardcolumns');
      if (!res?.isCustomized || !res.columns?.length) return null;
      return [...res.columns]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ name: c.name, mappings: Object.fromEntries((c.mappings || []).map((m) => [m.workItemType, m.state])) }));
    },
    // Map workItemId → column name for one sprint.
    async itemColumns(iterationId) {
      const res = await req(`taskboardworkitems/${iterationId}`);
      return new Map((res?.value || []).map((x) => [x.workItemId, x.column]));
    },
    async move(iterationId, id, column) {
      await req(`taskboardworkitems/${iterationId}/${id}`, { method: 'PATCH', body: JSON.stringify({ newColumn: column }) });
    },
  };
}
