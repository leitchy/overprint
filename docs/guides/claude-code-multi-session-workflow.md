# Claude Code Multi-Session Workflow

A practical guide for running parallel Claude Code sessions across the three NatCap Maps v2 repos.

## How It Works

Three iTerm tabs, each running Claude Code in a different repo. Each session reads its own `CLAUDE.md` for repo-specific context (build commands, conventions) **plus** the global `~/.claude/CLAUDE.md` for shared v2 context (infrastructure, gotchas, workflow). When any session discovers something cross-cutting, update the global file — all tabs see it immediately.

```
~/.claude/CLAUDE.md          ← shared v2 context (all tabs read this)
├── natcap-maps-api/CLAUDE.md    ← Django-specific (Tab 1 only)
├── natcap-maps-app/CLAUDE.md    ← React-specific (Tab 2 only)
└── natcap-gis-platform/CLAUDE.md ← Infra-specific (Tab 3 only)
```

## Starting Sessions

Open three iTerm tabs. In each:

```bash
# Tab 1 — Django API
cd ~/Development/Wollemi/natcap-maps-api && claude

# Tab 2 — React SPA
cd ~/Development/Wollemi/natcap-maps-app && claude

# Tab 3 — Schemas & Infra
cd ~/Development/Wollemi/natcap-gis-platform && claude
```

For parallel feature work within a single repo, use worktrees:
```bash
claude --worktree feature-name
```

## Session Workflow (each tab)

1. **Plan** — Start in plan mode (`Shift+Tab` twice). Describe the task. Iterate on the plan before writing code.
2. **Execute** — Switch to execute. Use auto-accept for trusted operations.
3. **Verify** — Run tests, check browser, confirm behaviour.
4. **Stuck?** — Back to plan mode. Replan rather than brute-force.
5. **Capture** — Update CLAUDE.md with any pitfalls discovered. Global file for cross-cutting, repo file for repo-specific.
6. **Simplify** — Run `/simplify` to clean up before PR.
7. **PR** — Commit, push, create PR.

## Cross-Repo Change Flow

Changes always flow in one direction:

```
schema migration          →  API route           →  web map consumer
(natcap-gis-platform)        (natcap-maps-api)       (natcap-maps-app)
```

Example: adding a new tile layer
1. **Tab 3**: Create PostGIS view in `views` schema, apply to DB, restart Martin
2. **Tab 1**: Add API endpoint if detail data needed beyond tiles
3. **Tab 2**: Add MapLibre source + layer, wire up UI

## Coordinating Between Tabs

Sessions don't share memory directly. Coordinate by:

- **Global CLAUDE.md** — update `~/.claude/CLAUDE.md` with new gotchas/conventions; all tabs see it next conversation
- **Telling Claude** — paste output from one tab into another (e.g. "Tab 1 says the cookie endpoint is live at `/api/auth/cookie/`")
- **Git** — push from one tab, pull from another if they share a repo
- **Plan file** — the shared plan at `~/.claude/plans/` is visible to all sessions in the same project

## Verification Quick Reference

| Repo | Command | What it checks |
|---|---|---|
| `natcap-maps-api` | `uv run pytest` | Endpoint shape, auth, signed cookies, API parity |
| `natcap-maps-app` | `npm test` | Unit tests (hooks, stores) |
| `natcap-maps-app` | `npm run test:e2e` | Playwright browser tests (map, auth, layers) |
| `natcap-gis-platform` | `psql` + manual | Schema applied, views return data, Martin serves tiles |

## Key Commands

| Command | What it does |
|---|---|
| `Shift+Tab` (×2) | Toggle plan mode |
| `/simplify` | Review changed code for quality, clean up before PR |
| `claude --worktree name` | Isolated worktree for parallel feature work |
| `Esc` | Cancel current generation |

## Repo Bootstrap Checklist

When creating a new repo for v2, add from day 1:

- [ ] `CLAUDE.md` — project context, build/test/deploy, known pitfalls
- [ ] `.claude/settings.json` — permissions + PostToolUse format hooks
- [ ] `.claude/commands/` — `/deploy`, `/test`, `/check`, `/diff-cf`
- [ ] `.claude/agents/` — `build-validator.md`, `code-simplifier.md`, `verify-app.md`
- [ ] Pointer in repo CLAUDE.md → global `~/.claude/CLAUDE.md` for shared context

## Tips

- **Plan first**: The plan mode → execute loop is faster than diving straight into code. Especially for cross-repo work where mistakes are expensive.
- **One tab at a time**: Give each tab a clear, scoped task. Don't context-switch between tabs mid-task.
- **Capture immediately**: When a session hits a gotcha, update the relevant CLAUDE.md before moving on. Future sessions (and future you) will thank you.
- **iTerm notifications**: Enable iTerm notifications so you know when a long-running tab finishes. Preferences → Profiles → Terminal → Notifications.
