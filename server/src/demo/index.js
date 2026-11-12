// Demo mode (AZDO_DEMO=1): the real azdo.js on top of an in-memory MCP and taskboard,
// with fictional data. No Azure DevOps, no PAT.
import fs from 'node:fs';
import { createAzdo } from '../azdo.js';
import { loadProcess } from '../process.js';
import { DEMO_ENV, createStore } from './data.js';
import { createDemoCallTool, createDemoTaskboard } from './fakeMcp.js';

export function createDemoAzdo({ lang = process.env.APP_LANG || 'en', now = () => new Date() } = {}) {
  const config = JSON.parse(fs.readFileSync(new URL('./process.demo.json', import.meta.url)));
  const env = { ...DEMO_ENV, APP_LANG: lang };
  const store = createStore(now());
  return createAzdo({
    callTool: createDemoCallTool(store, { env, now }),
    env,
    proc: loadProcess(config, now),
    taskboard: createDemoTaskboard(store),
  });
}
