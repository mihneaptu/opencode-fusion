# OpenCode harness (v1 reference)

Full Sidekick Fusion with **mechanical** permission enforcement.

## Install (recommended)

1. Copy the skill from this repo:

```text
.opencode/skills/fusion-setup/  →  ~/.config/opencode/skills/fusion-setup/
```

On Windows: `%USERPROFILE%\.config\opencode\skills\fusion-setup\`

2. Restart OpenCode, then say:

```text
set up fusion
```

Or use `/fusion-setup` if you also install the command from `.opencode/commands/`.

## Manual install

1. Assemble agents (if you edited core or frontmatter):

```bash
npm run assemble
```

2. Copy `agent/*.md` to `~/.config/opencode/agent/`.

3. Write `~/.config/opencode/opencode.json` with build permissions as documented in the root README / skill (edit denied, task allowlist, bash allowlist).

4. Restart OpenCode.

## Layout in this repo

| Path | Purpose |
|------|---------|
| `frontmatter/` | OpenCode YAML frontmatter (permissions) |
| `addenda/` | OpenCode-specific tool rules |
| `../../agent/` | Assembled install surface (generated) |
| `../../.opencode/skills/fusion-setup/` | Setup skill + bundled agent copies |

Core behavior lives in `../../core/roles/`. Re-run `npm run assemble` after edits.
