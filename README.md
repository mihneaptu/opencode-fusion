# opencode-fusion

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A minimal, working implementation of the [Devin Fusion "sidekick" pattern](https://cognition.com/blog/devin-fusion) for [opencode](https://opencode.ai).

Two agents run together: a **main agent** that plans and reviews, and a **sidekick** that executes. The main agent cannot edit files - it is mechanically forced to delegate all file changes to the sidekick. This keeps frontier intelligence in charge of the significant decisions (the plan, the interpretation of ambiguity, the final review) while a cheaper, faster model does the mechanical work.

The repo also ships two supporting agents: an **explore** agent (same Composer 2.5 model as the sidekick) for fast read-only codebase exploration, and a **vision** agent (Grok 4.3) that reads images and screenshots - useful when the main agent's model lacks image input.

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

**Supporting agents:** When the main agent needs to explore the codebase, it delegates to the **explore** agent (Composer 2.5) instead of reading files itself. When the user shares an image the main agent cannot see, it delegates to the **vision** agent (Grok 4.3) to transcribe and describe it. Both are spawned via the `task` tool and can run in parallel.

| Agent | Role | Model (in `opencode.json`) |
|-------|------|------------------------------|
| `build` | Main: plan, delegate, review | `agent.build.model` |
| `sidekick` | Execute edits and commands | `agent.sidekick.model` |
| `explore` | Fast read-only exploration | `agent.explore.model` |
| `vision` | Images and screenshots | `agent.vision.model` |

## Quick Setup

### Option A: Interactive (Windows / PowerShell)

```powershell
git clone https://github.com/mihneaptu/opencode-fusion.git
cd opencode-fusion
./setup.ps1
```

The script asks which models you want for each agent role, writes the global config, copies agent prompts, and tells you which providers to connect.

### Option B: Preset-based (macOS / Linux / Git Bash)

```bash
git clone https://github.com/mihneaptu/opencode-fusion.git
cd opencode-fusion
chmod +x setup.sh
./setup.sh
```

Choose from three presets (see [Config Presets](#config-presets) below).

### Option C: Manual

See [Manual Setup](#manual-setup) below.

## Config Presets

Ready-made configurations in `configs/`. Copy one to `~/.config/opencode/opencode.json` or let `setup.sh` do it for you.

| Preset | Main | Sidekick | Vision | Requires |
|--------|------|----------|--------|----------|
| `default.json` | GLM 5.2 (free) | Grok Composer 2.5 (fast) | Grok 4.3 | SuperGrok + progrok proxy |
| `opus-glm.json` | Claude Opus 4.1 (powerful) | GLM 5.2 (free) | built-in | Anthropic /connect |
| `sonnet-composer.json` | Claude Sonnet 4.6 (balanced) | Grok Composer 2.5 (fast) | Grok 4.3 | Anthropic + SuperGrok |

To use a preset manually:
```bash
cp configs/default.json ~/.config/opencode/opencode.json
```
Then copy the agent prompts:
```bash
mkdir -p ~/.config/opencode/agent
cp agents/*.md ~/.config/opencode/agent/
```

## Requirements

- [opencode](https://opencode.ai) installed
- A [SuperGrok](https://x.ai/grok) subscription (for the sidekick model)
- A main model provider - defaults to [OpenCode Go](https://opencode.ai/docs/providers#opencode-go) ($5 first month, includes glm-5.2)

## Manual Setup

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
mkdir -p ~/.config/opencode/agent
cp agents/*.md ~/.config/opencode/agent/
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force $env:USERPROFILE\.config\opencode\agent
Copy-Item opencode.json $env:USERPROFILE\.config\opencode\opencode.json
Copy-Item agents\*.md $env:USERPROFILE\.config\opencode\agent\
```

opencode reads global agents from `~/.config/opencode/agent/`. The `setup.ps1` and `setup.sh` scripts use this path automatically. If you previously copied agents to `~/.config/opencode/agents/` (plural), move them to `agent/` (singular) or remove the duplicate to avoid conflicts.

The vision agent is also installed project-locally in `.opencode/agents/vision.md`, so it works without the global copy when you open this project in opencode.

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

You should see the main agent delegate exploration to the explore agent or sidekick, receive the findings, make a plan, then delegate execution to the sidekick via the `task` tool. The sidekick makes the edits, and the main agent verifies by running `npm run lint` itself.

## Built with opencode-fusion

This repo was created using the opencode-fusion pattern itself. The main agent planned the structure, reviewed every change, and verified against real command output. The sidekick wrote all the files, ran git and gh commands, and reported back. Every commit on `main` went through the flow above.

## Customize

### Swap Models

All agent models are configured in one place: `opencode.json` under `agent`:

| Agent | Config key | Example |
|-------|-----------|---------|
| Main (build) | `agent.build.model` | `"anthropic/claude-opus-4-1"` |
| Sidekick | `agent.sidekick.model` | `"opencode-go/glm-5.2"` |
| Explore | `agent.explore.model` | `"progrok/grok-composer-2.5-fast"` |
| Vision | `agent.vision.model` | `"progrok/grok-4.3"` |

Or just re-run `./setup.ps1` to pick new models interactively.

You can also run `/models` in opencode to swap the active model for the current session. For a persistent default main model, change the top-level `model` field in `opencode.json`. Use a real model id from a provider you have connected via `/connect`. The sidekick should stay cheaper/faster than the main agent when possible.

Vision models must have `"attachment": true` and `"modalities": { "input": ["text", "image"] }` in the provider config, or opencode will reject image reads with "this model does not support image input."

### Adjust the bash allowlist

The main agent's bash is allowlisted to verification and git commit commands (`npm run lint`, `npm test`, `git diff`, `git status`, `git log`, `git show`, `git add`, `git commit`, `git push`). Edit `agents/build.md` to add or remove allowed commands in the `permission.bash` section. Keep `"*": "deny"` first so unlisted commands are blocked by default.

## Troubleshooting

### The main agent edits files directly

The config was not loaded. Fully quit and restart opencode - it loads the config at startup, not mid-session. Then check that `edit: deny` is set in `agents/build.md`.

### The sidekick is not being invoked

Check that `task: allow` is set in `agents/build.md`. If the `task` permission is missing or set to `deny`, the main agent cannot delegate.

### The sidekick model returns 404 or 400

The model ID may have changed. Run `progrok models --detail` to see the live list of available models. Note: the composer coding models (`grok-composer-2.5-fast`, `grok-composer-2.5`) are callable on `/v1/chat/completions` but intentionally not listed in `/v1/models` yet - so don't assume the sidekick model id is wrong just because it's missing from the list. If it really has changed, update `agent.sidekick.model` (and `agent.explore.model` if needed) in `opencode.json`.

### The vision agent says "this model does not support image input"

The model needs `attachment: true` and `modalities.input` including `"image"` in its provider config entry. Check `opencode.json` under `provider.progrok.models` - the `grok-4.3` entry should have these set. Note that `grok-composer-2.5-fast` does **not** support image input (xAI's API rejects it), so only `grok-4.3` or another vision-capable model works for the vision agent.

### The proxy is not running or connection refused on port 18645

`progrok proxy` must be left running in a terminal. If you closed it or it crashed, restart it with `progrok proxy`. Check it with `progrok status`. If the port is already in use, stop the existing process first, then restart.

## Files

| File | Purpose |
|------|---------|
| `setup.ps1` | Interactive setup script (Windows) |
| `setup.sh` | Preset-based setup script (macOS/Linux) |
| `configs/default.json` | GLM 5.2 + Grok preset |
| `configs/opus-glm.json` | Opus + GLM preset |
| `configs/sonnet-composer.json` | Sonnet + Composer preset |
| `opencode.json` | Provider config (progrok proxy), all agent models under `agent` |
| `agents/build.md` | Main agent: edit denied, bash allowlisted, task allowed, exploration + parallelization rules |
| `agents/sidekick.md` | Sidekick prompt (model in `opencode.json`) |
| `agents/vision.md` | Vision agent prompt (model in `opencode.json`) |
| `.opencode/agents/vision.md` | Project-local copy of vision agent (loads automatically) |
| `flow-diagram.png` | Architecture diagram (Main Agent vs Sidekick swimlane) |
| `LICENSE` | MIT license |

## Disclaimer

This project is not affiliated with, endorsed by, or built by the OpenCode team. [opencode](https://opencode.ai) is a separate project by [Anomaly](https://anoma.ly). This repo provides configuration that works with opencode but is not part of it.

## Credit

Inspired by [Devin Fusion](https://cognition.com/blog/devin-fusion) by [Cognition](https://cognition.com). The sidekick pattern and the principle that "the main agent should take minimal actions" come directly from their work.

## License

MIT