# opencode-fusion

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A minimal, working implementation of the [Devin Fusion "sidekick" pattern](https://cognition.com/blog/devin-fusion) for [opencode](https://opencode.ai).

Two agents run together: a **main agent** that plans and reviews, and a **sidekick** that executes. The main agent cannot edit files - it is mechanically forced to delegate all file changes to the sidekick. This keeps frontier intelligence in charge of the significant decisions (the plan, the interpretation of ambiguity, the final review) while a cheaper, faster model does the mechanical work.

## Why

From [Cognition's blog post](https://cognition.com/blog/devin-fusion):

> the main agent should take minimal actions, and only read what is absolutely necessary. By default it should delegate and monitor, while making the significant decisions: the plan, the interpretation of ambiguity, the final review.

This repo makes that pattern work in opencode - not as a suggestion, but as mechanical enforcement. The main agent's `edit` permission is `deny` and its `bash` is allowlisted to verification commands only. The only path to changing a file is the `task` tool, which delegates to the sidekick.

## How it works

![System architecture: a two-column swimlane showing the flow between the Main Agent (left) and Sidekick (right)](flow-diagram.png)

The flow:

1. **User task** triggers the Main Agent, which delegates **Code exploration** to the Sidekick.
2. The Sidekick explores and **sends data back** as file snippets.
3. The Main Agent uses those snippets to make a **Plan**, then **assigns the task** to the Sidekick (write code / write tests / fix lint).
4. The Sidekick writes the code and **sends it back** for review.
5. The Main Agent **reviews the code**. If edits are needed, it **sends feedback** to the Sidekick, which **fixes the bugs** and sends back.
6. The fixed code becomes the **Final code** delivered to the user.

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

The proxy serves at `http://127.0.0.1:18645/v1`. It injects your xAI OAuth token into requests, so no real API key is needed; `opencode.json` ships with `"apiKey": "anything"`, which progrok replaces with your OAuth token before forwarding to xAI.

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

You should see the main agent delegate exploration to the sidekick, receive the findings, make a plan, then delegate execution to the sidekick via the `task` tool. The sidekick makes the edits, and the main agent verifies by running `npm run lint` itself.

## Built with opencode-fusion

This repo was created using the opencode-fusion pattern itself. The main agent planned the structure, reviewed every change, and verified against real command output. The sidekick wrote all the files, ran git and gh commands, and reported back. Every commit on `main` went through the flow above.

## Customize

### Swap the main model

The easiest way is to run `/models` in opencode and pick a different model. This swaps the active model for the current session.

To change the persistent default, edit `opencode.json` and change the `model` field:

```json
"model": "anthropic/claude-sonnet-4-6"
```

Use a real model id from a provider you have connected via `/connect` - run `/models` to see what's available. The main agent just needs to be smart enough to plan and review.

### Swap the sidekick model

Edit `agents/sidekick.md` and change the `model` in the frontmatter. Another progrok coding model works out of the box:

```yaml
model: progrok/grok-build-0.1
```

Or use a completely different provider - the id must match a model you can access via `/connect`:

```yaml
model: anthropic/claude-sonnet-4-6
```

Whichever you pick, the sidekick should be cheaper/faster than the main agent - that is the whole point.

### Adjust the bash allowlist

The main agent's bash is restricted to verification commands. Edit `agents/build.md` to add or remove allowed commands in the `permission.bash` section. Keep `"*": "deny"` first so unlisted commands are blocked by default.

## Troubleshooting

### The main agent edits files directly

The config was not loaded. Fully quit and restart opencode - it loads the config at startup, not mid-session. Then check that `edit: deny` is set in `agents/build.md`.

### The sidekick is not being invoked

Check that `task: allow` is set in `agents/build.md`. If the `task` permission is missing or set to `deny`, the main agent cannot delegate.

### The sidekick model returns 404 or 400

The model ID may have changed. Run `progrok models --detail` to see the live list of available models. Note: the composer coding models (`grok-composer-2.5-fast`, `grok-composer-2.5`) are callable on `/v1/chat/completions` but intentionally not listed in `/v1/models` yet - so don't assume the sidekick model id is wrong just because it's missing from the list. If it really has changed, update the `model` field in `agents/sidekick.md`.

### The proxy is not running or connection refused on port 18645

`progrok proxy` must be left running in a terminal. If you closed it or it crashed, restart it with `progrok proxy`. Check it with `progrok status`. If the port is already in use, stop the existing process first, then restart.

## Files

| File | Purpose |
|------|---------|
| `opencode.json` | Provider config (progrok proxy) + main model |
| `agents/build.md` | Main agent: edit denied, bash allowlisted, task allowed |
| `agents/sidekick.md` | Sidekick: Composer 2.5 Fast, full edit + bash access |

## Disclaimer

This project is not affiliated with, endorsed by, or built by the OpenCode team. [opencode](https://opencode.ai) is a separate project by [Anomaly](https://anoma.ly). This repo provides configuration that works with opencode but is not part of it.

## Credit

Inspired by [Devin Fusion](https://cognition.com/blog/devin-fusion) by [Cognition](https://cognition.com). The sidekick pattern and the principle that "the main agent should take minimal actions" come directly from their work.

## License

MIT