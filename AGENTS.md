# AGENTS.md

## What this repo is

Not an application - an opencode *configuration* project implementing the Devin Fusion sidekick pattern. The deliverables are agent prompts (`agent/*.md`), a reference config (`opencode.json`), and the `fusion-setup` skill. There is no app to build or serve.

## Source of truth and the sync trap

The two agent prompts (`build.md`, `sidekick.md`) exist in up to four places. Editing one does NOT update the others - keep them in sync by hand:

- `agent/{build,sidekick}.md` - canonical, repo root.
- `.opencode/skills/fusion-setup/agent/{build,sidekick}.md` - bundled in the skill for distribution.
- `~/.config/opencode/skills/fusion-setup/agent/{build,sidekick}.md` - global mirror, so the skill works outside this folder.
- `~/.config/opencode/agent/{build,sidekick}.md` - what a running opencode session actually loads.

When you change a prompt or the skill, update the repo copy AND re-mirror to `~/.config/opencode/skills/fusion-setup/` so repo and global stay identical.

## Config facts

- `opencode.json` is **gitignored** - `git diff`/`git status` never show it. Inspect it with the read tool, not git.
- opencode loads config once at **startup**. After editing `opencode.json`, any `agent/*.md`, or the skill, the user must fully quit and restart opencode. Nothing hot-reloads.
- Current reference config: build `kiro/claude-opus-4-8`, sidekick `kiro/claude-sonnet-5`, explore `progrok/grok-composer-2.5-fast`. No vision agent - the main model reads images directly.

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

- The build agent cannot edit/grep/glob/list and has a deny-by-default bash allowlist. Delegate all edits and searches to the sidekick/explore subagents.
- Do not chain bash (`&&`, `||`, `;`, `|`, or `echo` separators) - each segment is matched against the allowlist, so the whole line is blocked. Run commands as separate calls.
- For git in another directory, use the tool's `workdir` parameter, not `git -C ...` - the allowlist matches `git diff*`, not `git -C`.
