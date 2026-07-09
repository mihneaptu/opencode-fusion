# Roadmap

**sidekick-fusion** implements the [Devin Fusion sidekick pattern](https://cognition.com/blog/devin-fusion) for coding-agent harnesses: a main agent that plans and reviews (and preferably cannot edit), plus a cheaper sidekick that executes.

## Product rule

Add a harness only when we can do **most** of this:

1. Custom roles (main / sidekick / explore / …)
2. Different models per role (or a clear cost split)
3. Tool or sandbox limits so main is not a free editor
4. Delegation (main spawns sidekick)
5. Enough users that the work is worth maintaining

If we cannot enforce “main does not edit,” we document the gap honestly — we do not pretend parity.

## Supported harnesses

| Harness | Status | What “supported” means |
|---------|--------|------------------------|
| **OpenCode** | **v1 reference** | Full Fusion: edit denied, bash allowlist, task graph, setup skill |
| **Claude Code** | **v1 target** | Full-enough Fusion: restricted main via `--agent`, tool allowlists, spawn graph |
| **Codex** | **v1.1** | Thin adapter: worker/sidekick + read-only explore/reviewer; main restriction may be softer |
| Cursor / VS Code agents | Later / no promise | Different surface; only if demand is clear |
| Gemini CLI, Windsurf, Copilot, Aider, Pi | Out of scope for now | Not a v1 commitment |

**v1.0 tagline:** *OpenCode and Claude Code. Codex is next.*

## Releases

### v1.0 — dual harness

**Goal:** One product, two install paths, shared role meaning.

- [x] Brand: `sidekick-fusion` (not OpenCode-only naming)
- [x] Repo layout: `core/roles` + `harnesses/{opencode,claude-code}` + `npm run assemble`
- [x] OpenCode: frontmatter/addenda under `harnesses/opencode/`; skill still at `.opencode/skills/fusion-setup/`
- [x] Claude Code: assembled agents under `harnesses/claude-code/agents/`
- [x] Claude Code: documented `claude --agent build` + install paths
- [x] README: setup sections for both harnesses; capability table
- [ ] Landing site: dual-harness messaging (optional for code complete)
- [ ] Manual verify checklist run on a real Claude Code session (lint fixture)

**Not in v1.0**

- Codex full parity
- Cursor / Gemini / etc.
- Dynamic mid-session model routing (Devin-only; remains a non-goal)
- A single config file that all harnesses magically share

### v1.1 — Codex thin port

- Custom agents under `~/.codex/agents/` (or project `.codex/agents/`)
- Sidekick/worker + explore + reviewer with sandbox modes
- Document where “main cannot edit” is weaker than OpenCode/Claude Code

### v2 — only if pulled by demand

- Cursor / VS Code custom agents, if users keep asking
- Stronger install UX (CLI installer, fewer copy steps)
- Optional project-local vs global install matrix polish

## How we build (architecture)

```text
sidekick-fusion/
  core/                 # portable role bodies (what each agent is)
    roles/
      build.md          # no harness-specific frontmatter
      sidekick.md
      plan.md
      explore.md
      ...
  harnesses/
    opencode/           # opencode.json shape, fusion-setup skill, permissions
    claude-code/        # YAML frontmatter wrappers + install notes
    codex/              # later: TOML agents
  site/                 # marketing site
  test-playground/      # shared smoke fixture
```

**Rule:** Role *behavior* lives in `core/`. Harness *wiring* (permissions, tool names, install paths, config format) lives only under `harnesses/<name>/`.

Prompts may still mention “delegate to the sidekick,” but must not say “use opencode’s task tool” in `core/` — that wording belongs in the harness adapter.

## How we start (ordered)

Do this in order; do not skip ahead to a third harness.

### Step 0 — Land the rename

Commit and push the `sidekick-fusion` rebrand (package name, README, site links). Local folder may still be named `opencode-fusion`; rename the folder when convenient (after closing tools that hold the path).

### Step 1 — Freeze the pattern (no new harness yet)

Write a short **capability matrix** in the README (already sketched under Supported harnesses). Agree that OpenCode remains the reference implementation for “full” enforcement.

### Step 2 — Extract shared role bodies

1. Create `core/roles/` with the *body* of each agent prompt (the operating instructions).
2. Keep OpenCode working: `agent/*.md` and skill copies either generate from or include core + OpenCode frontmatter.
3. Strip harness-specific tool names from core text where possible (“delegate execution to the sidekick” not “call opencode task”).

**Done when:** OpenCode setup still works exactly as today.

### Step 3 — Claude Code adapter (v1 second harness)

1. Add `harnesses/claude-code/` with one markdown agent per role:
   - frontmatter: `name`, `description`, `tools` / `disallowedTools`, `model`
   - body: include or mirror `core/roles/*`
2. Main (`build`): no Write/Edit; allow Agent(sidekick, explore, …) + Read (+ careful Bash).
3. Sidekick: Write, Edit, Bash, search tools.
4. Explore / reviewer: read-only tool sets.
5. Document: install paths + `claude --agent build`.
6. Smoke test: fix lint errors in `test-playground` via main → sidekick only.

**Done when:** A fresh Claude Code user can follow README steps and see delegation, not main editing.

### Step 4 — Ship v1.0

- Dual setup in README
- Roadmap statuses updated
- Optional: site CTA for both harnesses
- Tag `v1.0.0`

### Step 5 — Codex (after v1.0)

Only when OpenCode + Claude Code are stable.

## Success criteria for v1.0

A new user can:

1. Install Fusion on **OpenCode** and confirm main cannot edit; sidekick can.
2. Install Fusion on **Claude Code** and confirm main orchestrates; sidekick edits.
3. Understand from the README that Codex is planned and other tools are out of scope.

## Non-goals (standing)

- Becoming a general multi-agent skill pack (that market is crowded).
- Claiming mechanical enforcement on harnesses that cannot provide it.
- Supporting every coding CLI on the internet.
