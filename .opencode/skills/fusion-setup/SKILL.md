---
name: fusion-setup
description: Use when a user wants to set up, configure, install, or reconfigure the opencode Fusion two-agent workflow - a strong main/build agent that plans and reviews but cannot edit files, delegating all edits to a cheaper sidekick subagent, plus an explore search agent. Triggers include "set up fusion", "configure fusion", "install fusion", "fusion setup", or changing which models the main, sidekick, or explore agents use. Writes the global opencode config under ~/.config/opencode/.
---

# Fusion setup

This skill configures the Fusion two-agent workflow by writing the user's GLOBAL opencode config at `~/.config/opencode/` (on Windows: `%USERPROFILE%\.config\opencode\`). It does not require cloning any repository.

## What Fusion is

Fusion splits work across agents with asymmetric permissions:

- `build` (main, primary): a strong model that plans, makes judgment calls, and reviews. It CANNOT edit files, search the codebase, or run arbitrary shell. Its only path to changing files is delegating to the sidekick via the `task` tool.
- `plan` (primary): plan mode - the same planning brain as build. Produces a reviewed plan and delegates exploration, but does not execute; switch to build to carry it out. Overrides opencode's built-in plan agent so plan mode stays Fusion-aware.
- `sidekick` (subagent): a cheaper, fast model with full `edit` and `bash` access. It executes precise specs handed to it by the main agent.
- `explore` (subagent): a cheap model used for read-only codebase exploration.
- `research` (subagent): read-only external research - web search and docs. No edit access.
- `design` (subagent): frontend/UI implementation. Loads design skills, edits files, runs the dev/build tooling.
- `reviewer` (subagent): audits a diff before commit (correctness, scope, security). Read-only plus lint/test; no edit access.
- `vision` (subagent): reads images/screenshots the main model cannot see and reports them as text. Only needed when the main model lacks image input.

Think of the repo as a catalog of roles: the core (build/plan/sidekick/explore) is required, and the rest are optional pieces you install only if your workflow needs them. The research/design/reviewer/vision specialists are optional. Each role's model is chosen independently - that is a key reason to use Fusion: put your favorite design model on `design` and a different reviewer model on `reviewer`.

The asymmetry is enforced by the permission layer, not by convention. Preserving the exact permission block below is what makes Fusion work.

## Step 1 - Gather the user's model choices

Ask the user which model to use for each role. Do not assume; let them choose their own provider and models. Collect:

1. Main/build model (a strong model - e.g. an Opus/GPT-class model).
2. Sidekick model (a fast, cheaper coding model).
3. Explore model (cheap; can be the same as sidekick).
4. Research model (read-only external research; a solid general model).
5. Design model (frontend/UI work; pick whichever model does design best in your opinion).
6. Reviewer model (audits diffs; often a strong model, and deliberately can differ from the main model).
7. Vision model (reads images) - ONLY ask this if the user's main/build model does not support image input. Most frontier models read images directly, so skip this question unless the main model cannot. The vision model must be one that accepts image input.

Roles 4-7 are optional a-la-carte pieces. If the user only wants the core build/plan/sidekick/explore roles, skip them - but offer them, since choosing a different model per specialist is a key reason to use Fusion. The `plan` agent (plan mode) reuses the main/build model by default, so it needs no separate question. Do not offer `vision` when the main model already reads images.

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

The template above shows the OpenAI-compatible shape (`@ai-sdk/openai-compatible`). If a provider is a native vendor rather than an OpenAI-compatible gateway, use that vendor's adapter instead - for example `@ai-sdk/anthropic` for an Anthropic-style endpoint or `@ai-sdk/openai` for OpenAI. Only the `npm` value changes; the rest of the block shape is the same.

If two roles use different models from the SAME provider (for example a main model and a cheaper research model both on provider `kirocc`), do NOT emit two provider blocks with the same id - that is a duplicate key. Emit ONE block for that provider with BOTH models listed under its `models` object, like this:

```json
"kirocc": {
  "npm": "@ai-sdk/anthropic",
  "name": "Kirocc",
  "options": { "baseURL": "<baseURL>", "apiKey": "<apiKey>" },
  "models": {
    "claude-opus-4-8": { "name": "Opus", "attachment": true, "modalities": { "input": ["text", "image"] } },
    "claude-sonnet-5": { "name": "Sonnet" }
  }
}
```

## Step 3 - Write ~/.config/opencode/opencode.json

Write the global config using this exact structure. Replace the `<...>` placeholders with the user's choices. Model references are always `provider-id/model-id`. Keep the build agent's `permission` block EXACTLY as shown - it is the core of Fusion and must not be loosened.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "<main-provider>/<main-model-id>",
  "provider": {
    "<main-provider-id>": { "npm": "...", "options": {}, "models": {} },
    "<sidekick-provider-id>": { "npm": "...", "options": {}, "models": {} }
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
    "plan": {
      "mode": "primary",
      "model": "<main-provider>/<main-model-id>",
      "prompt": "{file:agent/plan.md}",
      "permission": {
        "edit": "deny",
        "grep": "deny",
        "glob": "deny",
        "list": "deny",
        "bash": {
          "*": "deny",
          "npm run lint*": "allow",
          "npm test*": "allow",
          "git diff*": "allow",
          "git status*": "allow",
          "git log*": "allow",
          "git show*": "allow"
        },
        "task": "allow"
      }
    },
    "explore": { "model": "<explore-provider>/<explore-model-id>" },
    "sidekick": { "model": "<sidekick-provider>/<sidekick-model-id>" },
    "research": { "model": "<research-provider>/<research-model-id>" },
    "design": { "model": "<design-provider>/<design-model-id>" },
    "reviewer": { "model": "<reviewer-provider>/<reviewer-model-id>" }
  }
}
```

Notes:
- Replace the two `"<...-provider-id>": { ... }` placeholder lines under `provider` with the ACTUAL provider block(s) you built in Step 2. If your main and sidekick share one provider, that is a single block (see Step 2 on merging models); if they use different providers, include one block each. The placeholder shape shown is not valid config on its own - it must be filled in.
- `{file:agent/build.md}` resolves relative to `~/.config/opencode/`, so the prompt file must be installed at `~/.config/opencode/agent/build.md` (Step 4).
- The sidekick's prompt is set by its agent file (Step 4), so it does not need a `prompt` field here.
- If the user already has a `~/.config/opencode/opencode.json`, first back it up (copy to `opencode.json.backup.<timestamp>`), then merge or overwrite per the user's wishes. Never silently discard an existing config.
- Add `"vision": { "model": "<vision-provider>/<vision-model-id>" }` to the `agent` block ONLY if the user configured a vision role (main model lacks image input). Omit it otherwise.

## Step 4 - Install the agent prompt files

Copy the prompt files bundled with this skill into the global agent folder (one per role you configured). `<this-skill-dir>` is the directory this SKILL.md lives in - its bundled prompts are in the `agent/` subfolder next to this file. Every configured role except `explore` needs its prompt file installed (explore is model-only in the JSON); in particular the sidekick DOES need its `agent/sidekick.md` file even though its JSON entry has no `prompt` field:

- `<this-skill-dir>/agent/build.md` -> `~/.config/opencode/agent/build.md`
- `<this-skill-dir>/agent/plan.md` -> `~/.config/opencode/agent/plan.md`
- `<this-skill-dir>/agent/sidekick.md` -> `~/.config/opencode/agent/sidekick.md`
- `<this-skill-dir>/agent/research.md` -> `~/.config/opencode/agent/research.md`
- `<this-skill-dir>/agent/design.md` -> `~/.config/opencode/agent/design.md`
- `<this-skill-dir>/agent/reviewer.md` -> `~/.config/opencode/agent/reviewer.md`
- `<this-skill-dir>/agent/vision.md` -> `~/.config/opencode/agent/vision.md` (only if a vision role was configured)

These carry the full operating instructions and permissions for each role. Each subagent file's frontmatter sets its `mode`, `permission`, and a default `model`; the model in opencode.json (Step 3) takes precedence when present. Install only the files for the roles you configured - if the user skipped research/design/reviewer/vision, skip those.

## Step 5 - Validate and finish

1. Confirm `~/.config/opencode/opencode.json` is valid JSON (parse it).
2. Confirm every agent prompt file you installed exists under `~/.config/opencode/agent/` (build and sidekick at minimum, plus any specialists configured).
3. Tell the user to fully quit and restart opencode - config is loaded once at startup and is not hot-reloaded. After restart, the status bar should show the main model on the Build agent.

## Reconfiguring later

To change a model, edit `agent.<role>.model` (and add a `provider` block if the new model uses a new provider) in `~/.config/opencode/opencode.json`, then restart opencode. No scripts or presets are involved - this skill and a plain JSON edit are the whole surface.
