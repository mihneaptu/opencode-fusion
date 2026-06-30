# opencode-fusion

A minimal, working implementation of the [Devin Fusion "sidekick" pattern](https://cognition.com/blog/devin-fusion) for [opencode](https://opencode.ai).

Two agents run together: a **main agent** that plans and reviews, and a **sidekick** that executes. The main agent cannot edit files - it is mechanically forced to delegate all file changes to the sidekick. This keeps frontier intelligence in charge of the significant decisions (the plan, the interpretation of ambiguity, the final review) while a cheaper, faster model does the mechanical work.

## Why

From [Cognition's blog post](https://cognition.com/blog/devin-fusion):

> the main agent should take minimal actions, and only read what is absolutely necessary. By default it should delegate and monitor, while making the significant decisions: the plan, the interpretation of ambiguity, the final review.

This repo makes that pattern work in opencode - not as a suggestion, but as mechanical enforcement. The main agent's `edit` permission is `deny` and its `bash` is allowlisted to verification commands only. The only path to changing a file is the `task` tool, which delegates to the sidekick.

## How it works

```
User task
  |
  v
Main agent (glm-5.2)
  1. Explores: reads files, greps, runs verification bash
  2. Makes a plan: which files, which lines, what change
  3. Delegates to sidekick via task with a precise spec
  |
  v
Sidekick (grok-composer-2.5-fast)
  4. Writes the code / fixes the lint / runs the change
  5. Returns the result + verification output
  |
  v
Main agent (glm-5.2)
  6. Reviews the diff against the plan
  7. Verifies: runs npm run lint / npm test / git diff itself
  8. If review fails -> sends feedback, re-delegates
  9. Delivers the final result to the user
```

## Requirements

- [opencode](https://opencode.ai) installed
- A [SuperGrok](https://x.ai/grok) subscription (for the sidekick model)
- A main model provider - defaults to [OpenCode Go](https://opencode.ai/docs/providers#opencode-go) ($5 first month, includes glm-5.2)

## Setup

### 1. Install and start the progrok proxy

[progrok](https://github.com/lidge-jun/progrok) turns your SuperGrok OAuth session into a local OpenAI-compatible API endpoint:

```bash
npm install -g progrok
progrok login        # browser OAuth with your xAI account
progrok proxy        # leave this running in a terminal
```

The proxy serves at `http://127.0.0.1:18645/v1`. It injects your xAI OAuth token into requests, so no API key is needed - any non-empty placeholder works.

### 2. Copy the config files

**macOS / Linux:**

```bash
cp opencode.json ~/.config/opencode/opencode.json
cp -r agents/ ~/.config/opencode/agents/
```

**Windows (PowerShell):**

```powershell
Copy-Item opencode.json $env:USERPROFILE\.config\opencode\opencode.json
Copy-Item -Recurse agents $env:USERPROFILE\.config\opencode\agents
```

### 3. Connect your main model provider

In opencode, run:

```
/connect
```

Select **OpenCode Go** (for glm-5.2) or **Anthropic** (for Claude) or any other provider you want as the main agent. Follow the prompts to authenticate.

### 4. Restart opencode

Fully quit and restart opencode so it loads the new config.

### 5. Verify it works

Open a project with some lint errors and ask:

```
fix the lint errors in this project
```

You should see the main agent explore the code, make a plan, then delegate to the sidekick via the `task` tool. The sidekick makes the edits, and the main agent verifies by running `npm run lint` itself.

If the main agent tries to edit files directly, something is wrong with the config - check that `edit: deny` is set in `agents/build.md`.

## Customize

### Swap the main model

The easiest way is to run `/models` in opencode and pick a different model. This swaps the active model for the current session.

To change the persistent default, edit `opencode.json` and change the `model` field:

```json
"model": "anthropic/claude-opus-4-8"
```

Any provider you have connected via `/connect` works. The main agent just needs to be smart enough to plan and review.

### Swap the sidekick model

Edit `agents/sidekick.md` and change the `model` in the frontmatter:

```yaml
model: progrok/grok-build-0.1
```

Or use a completely different provider:

```yaml
model: openai/gpt-5.4-mini
```

The sidekick should be cheaper/faster than the main agent - that is the whole point.

### Adjust the bash allowlist

The main agent's bash is restricted to verification commands. Edit `agents/build.md` to add or remove allowed commands in the `permission.bash` section. Keep `"*": "deny"` first so unlisted commands are blocked by default.

## Files

| File | Purpose |
|------|---------|
| `opencode.json` | Provider config (progrok proxy) + main model |
| `agents/build.md` | Main agent: edit denied, bash allowlisted, task allowed |
| `agents/sidekick.md` | Sidekick: Composer 2.5 Fast, full edit + bash access |

## Credit

Inspired by [Devin Fusion](https://cognition.com/blog/devin-fusion) by [Cognition](https://cognition.com). The sidekick pattern and the principle that "the main agent should take minimal actions" come directly from their work.

## License

MIT