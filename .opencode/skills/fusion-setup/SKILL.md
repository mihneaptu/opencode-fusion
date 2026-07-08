---
name: fusion-setup
description: Use when a user wants to set up, configure, install, or reconfigure the opencode Fusion two-agent workflow - a strong main/build agent that plans and reviews but cannot edit files, delegating all edits to a cheaper sidekick subagent, plus an explore search agent. Triggers include "set up fusion", "configure fusion", "install fusion", "fusion setup", or changing which models the main, sidekick, or explore agents use. Writes the global opencode config under ~/.config/opencode/.
---

# Fusion setup

This skill configures the Fusion two-agent workflow by writing the user's GLOBAL opencode config at `~/.config/opencode/` (on Windows: `%USERPROFILE%\.config\opencode\`). It does not require cloning any repository.

## What Fusion is

Fusion splits work across agents with asymmetric permissions:

- `build` (main, primary): a strong model that plans, makes judgment calls, and reviews. It CANNOT edit files, search the codebase, or run arbitrary shell. Its only path to changing files is delegating to the sidekick via the `task` tool.
- `sidekick` (subagent): a cheaper, fast model with full `edit` and `bash` access. It executes precise specs handed to it by the main agent.
- `explore` (subagent): a cheap model used for read-only codebase exploration.

The asymmetry is enforced by the permission layer, not by convention. Preserving the exact permission block below is what makes Fusion work.

## Step 1 - Gather the user's model choices

Ask the user which model to use for each role. Do not assume; let them choose their own provider and models. Collect:

1. Main/build model (a strong model - e.g. an Opus/GPT-class model).
2. Sidekick model (a fast, cheaper coding model).
3. Explore model (cheap; can be the same as sidekick).

For each distinct provider the chosen models use, collect the connection details:
- provider id (e.g. `kiro`, `progrok`, `anthropic`, `openai`)
- the npm adapter (for OpenAI-compatible local gateways use `@ai-sdk/openai-compatible`)
- baseURL and apiKey (for local gateways / custom endpoints)
- the model id(s) and a display name

If the user is unsure, offer the OpenAI-compatible local-gateway shape as the default pattern and ask for their baseURL/apiKey.

## Step 2 - Build the provider blocks

For each provider, build a block under `provider`. OpenAI-compatible template:

```json
"<provider-id>": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "<display name>",
  "options": {
    "baseURL": "<baseURL>",
    "apiKey": "<apiKey>"
  },
  "models": {
    "<model-id>": {
      "name": "<display name>",
      "attachment": true,
      "modalities": { "input": ["text", "image"] }
    }
  }
}
```

Only include `attachment`/`modalities` for models that actually support image input. A main model with image input means no separate vision agent is needed.

## Step 3 - Write ~/.config/opencode/opencode.json

Write the global config using this exact structure. Replace the `<...>` placeholders with the user's choices. Model references are always `provider-id/model-id`. Keep the build agent's `permission` block EXACTLY as shown - it is the core of Fusion and must not be loosened.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "<main-provider>/<main-model-id>",
  "provider": {
    "<provider blocks from Step 2>": {}
  },
  "agent": {
    "build": {
      "mode": "primary",
      "model": "<main-provider>/<main-model-id>",
      "prompt": "{file:agent/build.md}",
      "permission": {
        "edit": "deny",
        "grep": "deny",
        "glob": "deny",
        "list": "deny",
        "bash": {
          "*": "deny",
          "npm run lint*": "allow",
          "npm test*": "allow",
          "npm run build*": "allow",
          "npx tsc --noEmit*": "allow",
          "npx vitest run*": "allow",
          "git diff*": "allow",
          "git status*": "allow",
          "git log*": "allow",
          "git show*": "allow",
          "git add*": "allow",
          "git commit*": "allow",
          "git push*": "allow",
          "node --version*": "allow",
          "npm --version*": "allow"
        },
        "task": "allow"
      }
    },
    "explore": { "model": "<explore-provider>/<explore-model-id>" },
    "sidekick": { "model": "<sidekick-provider>/<sidekick-model-id>" }
  }
}
```

Notes:
- `{file:agent/build.md}` resolves relative to `~/.config/opencode/`, so the prompt file must be installed at `~/.config/opencode/agent/build.md` (Step 4).
- The sidekick's prompt is set by its agent file (Step 4), so it does not need a `prompt` field here.
- If the user already has a `~/.config/opencode/opencode.json`, first back it up (copy to `opencode.json.backup.<timestamp>`), then merge or overwrite per the user's wishes. Never silently discard an existing config.

## Step 4 - Install the agent prompt files

Copy the two prompt files bundled with this skill into the global agent folder:

- `<this-skill-dir>/agent/build.md` -> `~/.config/opencode/agent/build.md`
- `<this-skill-dir>/agent/sidekick.md` -> `~/.config/opencode/agent/sidekick.md`

These carry the full operating instructions for each role. The sidekick file's frontmatter also sets its `mode`, `permission` (edit+bash allow), and can set its `model`; keep that intact.

## Step 5 - Validate and finish

1. Confirm `~/.config/opencode/opencode.json` is valid JSON (parse it).
2. Confirm both agent prompt files exist under `~/.config/opencode/agent/`.
3. Tell the user to fully quit and restart opencode - config is loaded once at startup and is not hot-reloaded. After restart, the status bar should show the main model on the Build agent.

## Reconfiguring later

To change a model, edit `agent.<role>.model` (and add a `provider` block if the new model uses a new provider) in `~/.config/opencode/opencode.json`, then restart opencode. No scripts or presets are involved - this skill and a plain JSON edit are the whole surface.
