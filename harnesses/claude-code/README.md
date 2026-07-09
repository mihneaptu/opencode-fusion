# Claude Code harness (v1 target)

Sidekick Fusion for [Claude Code](https://code.claude.com): a restricted **build** main agent plus a **sidekick** executor and specialists.

## What you get

| Agent | Role | Tools (summary) |
|-------|------|-----------------|
| `build` | Main: plan, delegate, review | Agent(…), Read, Bash — **no** Write/Edit |
| `plan` | Plan only | Agent(explore, research), read tools — no edits |
| `sidekick` | Execute precise specs | Write, Edit, Bash, search |
| `explore` | Read-only search | Read, Grep, Glob |
| `research` | Docs/web + survey | Read, web tools, explore |
| `design` | UI implementation | Full edit + optional sidekick |
| `reviewer` | Diff audit | Read + bash verify, no edit |
| `vision` | Image → text | Optional; skip if main sees images |

## Install (user-global)

From this repo after `npm run assemble`:

**macOS / Linux / Git Bash**

```bash
mkdir -p ~/.claude/agents
cp harnesses/claude-code/agents/*.md ~/.claude/agents/
```

**Windows (PowerShell)**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\agents" | Out-Null
Copy-Item -Path "harnesses\claude-code\agents\*.md" -Destination "$env:USERPROFILE\.claude\agents\" -Force
```

If `~/.claude/agents` did not exist before this session, **restart Claude Code** once so it picks up the new directory.

## Project-local install

```bash
mkdir -p .claude/agents
cp harnesses/claude-code/agents/*.md .claude/agents/
```

Commit `.claude/agents/` if the team should share the same Fusion roles.

## Run the main orchestrator

```bash
claude --agent build
```

Or set in `.claude/settings.json`:

```json
{
  "agent": "build"
}
```

Then start Claude Code normally. The session uses the build system prompt and tool restrictions.

## Models

Frontmatter defaults (edit after install if you want):

- `build` / `plan` / `reviewer` → `opus`
- `sidekick` / `research` / `design` / `vision` → `sonnet`
- `explore` → `haiku`

Change the `model:` field in each agent file under `~/.claude/agents/` (or re-edit `harnesses/claude-code/frontmatter/` and re-assemble).

## Smoke test

1. In a project with lint errors (or use this repo’s `test-playground/`).
2. `claude --agent build`
3. Ask: `fix the lint errors in this project`
4. Confirm: main does **not** Write/Edit; **sidekick** applies fixes; main runs lint itself.

## Honest gaps vs OpenCode

| Capability | OpenCode | Claude Code |
|------------|----------|-------------|
| Main cannot edit | `edit: deny` + search deny | `disallowedTools: Write, Edit` |
| Bash allowlist on main | Fine-grained patterns | Bash allowed for verify; prompt forbids write-via-shell |
| Multi-vendor main/sidekick | Any providers | Mostly Anthropic models (cost split still works) |
| Nested delegation graph | `task` allowlist | `Agent(name, …)` allowlist on build |

## Rebuild after core edits

```bash
npm run assemble
# then re-copy agents to ~/.claude/agents or .claude/agents
```
