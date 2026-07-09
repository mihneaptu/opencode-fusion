# AGENTS.md

## What this repo is

Not an application - an opencode *configuration* project implementing the Devin Fusion sidekick pattern. The deliverables are agent prompts (`agent/*.md`), a reference config (`opencode.json`), and the `fusion-setup` skill. There is no app to build or serve.

## Source of truth and the sync trap

The agent prompts (`build.md`, `plan.md`, `sidekick.md`, `research.md`, `design.md`, `reviewer.md`, `vision.md`) exist in up to four places. Editing one does NOT update the others - keep them in sync by hand:

- `agent/*.md` - canonical, repo root.
- `.opencode/skills/fusion-setup/agent/*.md` - bundled in the skill for distribution.
- `~/.config/opencode/skills/fusion-setup/agent/*.md` - global mirror, so the skill works outside this folder.
- `~/.config/opencode/agent/*.md` - what a running opencode session actually loads (installed by the skill).

When you change a prompt or the skill, update the repo copy AND re-mirror to `~/.config/opencode/skills/fusion-setup/` so repo and global stay identical.

## Config facts

- `opencode.json` is **gitignored** - `git diff`/`git status` never show it. Inspect it with the read tool, not git.
- opencode loads config once at **startup**. After editing `opencode.json`, any `agent/*.md`, or the skill, the user must fully quit and restart opencode. Nothing hot-reloads.
- Current reference config (as actually wired in the live global config): default/build `kirocc/claude-opus-4-8` (reasoningEffort xhigh), sidekick `progrok/grok-4.5` (reasoningEffort high), explore `progrok/grok-4.5` (reasoningEffort high). Providers are local OpenAI-compatible endpoints: `kirocc` (http://127.0.0.1:3456/v1) and `progrok` (http://127.0.0.1:18645/v1). The optional specialists (plan, research, design, reviewer, vision) ship as prompts in `agent/` but are not currently wired into the live config; add them under `agent.<role>` in opencode.json to enable them. No vision agent in the reference config - the main model reads images directly.
- The team: `build` and `plan` are primary (Fusion-aware, cannot edit); `sidekick` executes; `explore`/`research` are read-only; `design` edits UI; `reviewer` audits diffs read-only. Most subagents carry `task: allow`, but `vision` is a deliberate leaf (`task: deny`). Nested delegation (a subagent spawning another subagent) is UNVERIFIED at runtime - confirm after a restart before relying on it.
- `vision` is an optional catalog piece, not in the reference config: the reference main model (Opus) reads images directly, so `vision` is omitted. It exists in `agent/vision.md` for anyone whose main model lacks image input; the skill installs it only when asked. It keeps `bash: allow` for the clipboard-capture snippet.
- `plan.md` overrides opencode's built-in plan agent so plan mode stays Fusion-aware (delegates exploration, does not execute, cannot commit). Without it, plan mode would be vanilla opencode.

## Testing (how we verify changes here)

`test-playground/` is the lint fixture: a real npm project (`type: module`, eslint 9 flat config in `eslint.config.js`; rules no-unused-vars, no-undef, eqeqeq, no-var, prefer-const, semi).

1. **Skill loads:** after restart, confirm `fusion-setup` shows up in the skill list.
2. **Skill configures:** in a fresh session say `set up fusion`; it should ask per-role models, write `~/.config/opencode/opencode.json`, install the prompts, and (after restart) show the chosen main model on the Build agent in the status bar.
3. **Fusion flow end-to-end:** `test-playground/src/index.js` is usually already lint-clean. To re-test, re-seed lint errors into it, then ask the main agent to fix them. Verify the main agent delegates to the sidekick (never edits directly) and then runs `npm run lint` itself. Run lint from the fixture: `npm --prefix test-playground run lint`.
4. **Audit agent behavior (ground truth):** surface signals (status bar, visible output) can look fine while the agent misbehaved - edited directly instead of delegating, or made a bad judgment call. The real record is `~/.local/share/opencode/opencode.db` (SQLite; `message` and `part` tables keyed by `session_id`): it holds the agent's reasoning and exact tool calls. Find the relevant session by id and read it. A user report is one reason to look, but audit proactively - do not depend on anyone noticing a problem first.

## Commands

- Root: `npm test` (`node --test`) only - no root tests exist yet, no lint/build at root.
- Lint fixture: `npm run lint` inside `test-playground/`.

## Git

- Default branch is `main`. Do not auto-commit on `main` without explicit instruction.
- `opencode.json` is gitignored, so config changes never appear in commits. The versioned config surface is `agent/*.md` and `.opencode/skills/`.

## Gotchas when running as the build agent

- The build and plan agents cannot edit/grep/glob/list and have a deny-by-default bash allowlist. Delegate all edits and searches to the sidekick/explore subagents. (plan mode additionally cannot git add/commit - it is read-only inspection plus delegation.)
- Do not chain bash (`&&`, `||`, `;`, `|`, or `echo` separators) - each segment is matched against the allowlist, so the whole line is blocked. Run commands as separate calls.
- For git in another directory, use the tool's `workdir` parameter, not `git -C ...` - the allowlist matches `git diff*`, not `git -C`.
