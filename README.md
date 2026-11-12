# azdo-board

A Jira-style board for Azure DevOps. Every action on screen (dragging a card, editing a field, creating an issue, commenting, changing sprint) becomes a real change in Azure DevOps.

The backend doesn't call the REST API directly: it is an **MCP client** of the official Azure DevOps MCP server ([`@azure-devops/mcp`](https://github.com/microsoft/azure-devops-mcp)), authenticated with a Personal Access Token.

```
React + Vite (:5173) ──/api──▶ Express (:3001) ──stdio──▶ @azure-devops/mcp ──▶ Azure DevOps
```

It runs locally, for one user, with your PAT. The server only listens on `127.0.0.1`.

## Features

- **Board**: sprint kanban (current sprint by default). *PBIs & Bugs* or *Tasks* mode, columns from your process states, plus **Blocked** and **Validation** columns. Drag a card to change its state, block it or send it to validation. Group by assignee or parent PBI; filter by text, people, type and "only my issues". Done PBIs start collapsed.
- **Backlog**: open PBIs and Bugs grouped by current sprint, future sprints, closed sprints with open issues and backlog. Drag between sections to change the sprint.
- **Issues**: "assigned to me" and search (text, `#id`, type, state, assignee).
- **Blocked** and **Validation** pages: everything blocked or waiting for validation, in any sprint.
- **Issue view** (`?item=<id>` on any page): inline editing of title, description and acceptance criteria (Markdown), state, assignee, sprint, priority, tags and your process fields; child issues; comments; flag as blocked / send to validation.
- **Create** dialog with the fields your process requires.
- **Process rules** (required fields, what a state transition asks for) come from a config file, so the app follows your Azure DevOps process instead of failing with `TF401320`.
- **English or Portuguese**, switchable in the top bar.

## Getting started

```bash
cp .env.example .env                               # fill in AZDO_ORG, AZDO_PROJECT, AZDO_TEAM, AZDO_ME, PERSONAL_ACCESS_TOKEN
cp process.config.example.json process.config.json # optional: adapt to your process
npm install
npm run dev                                        # API on :3001, UI on http://127.0.0.1:5173
```

To serve everything from Express (no Vite): `npm run build && npm start`, then open `http://127.0.0.1:3001`.

Requirements: Node 20+ and a PAT with **Work Items (Read & Write)**.

### `.env`

| Variable | Purpose |
|---|---|
| `AZDO_ORG` | Organization (the part after `dev.azure.com/`) |
| `AZDO_PROJECT` / `AZDO_TEAM` | Project and team shown on the board |
| `AZDO_ME` | Your e-mail: "only my issues", "assign to me", default assignee |
| `PERSONAL_ACCESS_TOKEN` | PAT with Work Items (Read & Write) |
| `APP_LANG` | Default UI language when the user hasn't picked one (`en` or `pt`) |
| `PROCESS_CONFIG` | Path to the process rules file (default `process.config.json`, then `process.config.example.json`) |
| `PORT` | API port (default 3001) |
| `MCP_DEBUG=1` | Prints the MCP server's stderr |

## Process rules

Azure DevOps processes are customized per organization: custom fields, fields required on creation or on a state transition. Describe yours in `process.config.json` (it is git-ignored; `process.config.example.json` targets the default Scrum process).

| Key | What it does |
|---|---|
| `fields` | Extra fields: `key`, `ref` (Azure reference name), `label`, `types`, `input` (`number`, `select`, `rich`, `links`, `readonly`), `options`, `default` or `defaultByMonth`, `azName` (name Azure uses in errors), `warnIfEmpty`, `warnIfEmptyWhenDone`, `blocksUpdates`, `multi`, `hint` |
| `create` | Per type: `required` and `optional` field keys in the Create dialog |
| `typeRules` | Per type: `descriptionRequired`, `parentType`, `parentRequired`, `inheritFromParent` (assignee and sprint) |
| `transitions` | Per type and target state: fields asked before saving. `completedWorkAdd` asks for hours and adds them to Completed Work; `<linksField>Add` appends a link; `default: "effort"` / `"childrenCompletedWork"` pre-fill values; `onlyIfEmpty` skips fields already filled |
| `detailFields` | Per type: fields shown in the issue view's Details panel |
| `planning` | Optional tag choice required on creation (e.g. planned/unplanned), never copied from the parent |
| `blocked` | `field`/`value` for types that have a Blocked field (Task in Scrum), `tag` for the others |
| `validation` | `states` that mean "in validation"; for types without such a state, `tagState` maps the type to the state it moves to and `tag` marks it |
| `links` | `prPrefix` for GitHub PR links appended to a `links` field |

Labels and hints accept a string or `{ "en": "...", "pt": "..." }`.

If Azure still rejects a save with `TF401320`, the API returns 422 with the missing field and the same dialog asks for it and retries.

## How it behaves

- **Concurrency**: every edit sends a `test /rev` operation. If the item changed in Azure after you loaded it, the save is rejected (409) and the issue reloads. Edits on the same issue are queued and use the newest revision.
- **Hours**: Completed Work on tasks is always added to, never overwritten (negative hours fix mistakes; the total never goes below zero). The server reads the current value and writes it with the revision check.
- **Tags**: written with `replace`, since `add` on `System.Tags` only appends.
- **Markdown**: editing a description or rich field stores it as Markdown in Azure (existing HTML is converted).

## Tests

```bash
npm test     # node:test on the server, with a mocked MCP client and a neutral process fixture
```

## Notes

- Every call goes through the MCP server over stdio, so it is slower than the REST API. The UI caches with react-query. Swapping `server/src/mcp.js`/`azdo.js` for REST calls would not touch the UI.
- `npm audit` reports issues in `@azure-devops/mcp` dependencies (`@azure/msal-node`, an older MCP SDK). They affect interactive login and HTTP transports, which this project doesn't use (PAT + stdio).

## License

[MIT](LICENSE)
