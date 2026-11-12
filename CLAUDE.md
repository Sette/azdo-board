# CLAUDE.md — azdo-board

Jira-style board for Azure DevOps. Read `README.md` first.

## Layout

- `server/` (Node, Express 5, ESM, plain JS)
  - `src/mcp.js`: starts `@azure-devops/mcp` (local dependency, pinned version) over stdio and exposes `callTool`. Responses come wrapped in `<<hash>> [UNTRUSTED ...]` markers, sometimes with a text header before the JSON: `unwrap` + `pickPayload` handle that.
  - `src/azdo.js`: every operation (sprint, backlog, search, item, update, create, comments, people, parents, blocked, validation). `createAzdo({ callTool, env, proc })` lets tests inject a mock and a process fixture.
  - `src/process.js`: loads the process rules (`process.config.json`, `PROCESS_CONFIG` or the example) and exposes `buildExtraFields`, `parseRuleErrors`, `appendLink`, `isBlocked`, `inValidation`, `flagChanges`, `publicMeta`.
  - `src/taskboard.js`: team sprint-board columns via REST (the MCP server has no tool for them). Column is set after the state (Azure refuses a column not mapped to the current state).
  - `src/mappers.js`: MCP format → front-end DTOs, and DTO → JSON Patch (`toPatchOps(changes, rev, fields)`, with `test /rev`).
  - `src/i18n.js`: API error messages (en/pt) by error `code`; the front sends `x-lang`.
  - `src/routes.js`: thin REST routes and the error handler.
- `web/` (React 19, Vite, Tailwind 4, react-query, dnd-kit)
  - `src/lib/i18n.jsx`: UI strings (en/pt), `useI18n()` → `t`, `tl` (config labels), `typeLabel`, `locale`. Never hard-code UI text.
  - `src/lib/hooks.js`: queries, `useUpdateItem` (optimistic + per-item queue with newest rev), `useItemParam` (`?item=`).
  - `src/components/SaveItem.jsx`: every save goes through `useSaveItem().save(item, changes, optimistic)`, which opens the required-fields dialog for transitions or 422 (`TF401320`) before retrying.
  - `src/pages/`: `Board`, `Backlog`, `Issues`, `FlagList` (Blocked/Validation).

## Rules

- Always pass `project` (and `team` when the tool takes it) to MCP calls; otherwise the server tries to prompt for one.
- Check the real tool schema (`listTools()`) before using a new tool; the `@azure-devops/mcp` API changes between versions.
- Rich-field format comes lower-case (`multilineFieldsFormat: { 'System.Description': 'markdown' }`); comments use an enum (0 = markdown, 1 = html).
- `System.Tags` is written with `replace` (`add` only appends). Blocked is cleared with `remove` (Azure only accepts the blocked value).
- Task hours always add (`completedWorkAdd`, computed server-side with the current value and `test /rev`). Links fields only append (`<key>Add`).
- Task taskboard column ≠ field: `updateItem({ column })` moves it after the state patch; a state change without a column goes to the first column of that state.
- Done → Removed is not a valid transition in the Scrum process: go through New.
- Organization-specific rules live only in `process.config.json` (git-ignored), never in code or tests.
- Test against real Azure DevOps only with test items, and move them to Removed afterwards.

## Commands

```bash
npm run dev     # api + web
npm test        # server tests
npm run build   # web build (served by Express on npm start)
```
