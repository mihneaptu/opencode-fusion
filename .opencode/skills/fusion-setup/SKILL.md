---
name: fusion-setup
description: Use when a user wants to set up, configure, install, or reconfigure the opencode Fusion agent team - a strong main/build agent that plans and reviews but cannot edit files, delegating all edits to a cheaper sidekick subagent, plus an explore search agent and optional research/design/reviewer/vision specialists. Triggers include "set up fusion", "configure fusion", "install fusion", "fusion setup", "undo fusion" / "remove fusion", changing which models the main, sidekick, or explore agents use, or naming a subscription to start from a ready-made profile - e.g. "set up fusion with my OpenCode Go subscription" (also OpenCode Zen, ChatGPT Plus/Pro, GitHub Copilot, Cerebras Code). Writes the global opencode config under ~/.config/opencode/.
---

# Fusion setup

This skill configures the Fusion agent team (a main agent, a sidekick executor, an explore searcher, and optional specialists) by writing the user's GLOBAL opencode config at `~/.config/opencode/` (on Windows: `%USERPROFILE%\.config\opencode\`). It does not require cloning any repository.

## What Fusion is

Fusion splits work across agents with asymmetric permissions:

- `build` (main, primary): a strong model that plans, makes judgment calls, and reviews. It CANNOT edit files, search the codebase, or run arbitrary shell. Its only path to changing files is delegating to the sidekick via the `task` tool.
- `plan` (primary): plan mode - the same planning brain as build. Produces a reviewed plan and delegates exploration, but does not execute; switch to build to carry it out. Overrides opencode's built-in plan agent so plan mode stays Fusion-aware.
- `sidekick` (subagent): a cheaper, fast model with full `edit` and broad `bash` access (direct `git commit`/`git push` and common wrappers are denied as defense-in-depth - committing stays with the main agent). It executes precise specs handed to it by the main agent.
- `explore` (subagent): a cheap model used for read-only codebase exploration.
- `research` (subagent): read-only external research - web search and docs. No edit access.
- `design` (subagent): frontend/UI implementation. Loads design skills, edits files, runs the dev/build tooling.
- `reviewer` (subagent): critiques a plan before implementation and audits a diff before commit (correctness, scope, security). Read-only plus lint/test; no edit access.
- `vision` (subagent): reads images/screenshots the main model cannot see and reports them as text. Only needed when the main model lacks image input.

Think of the repo as a catalog of roles: the core (build/plan/sidekick/explore) is required, and the rest are optional pieces you install only if your workflow needs them. The research/design/reviewer/vision specialists are optional. Each role's model is chosen independently - that is a key reason to use Fusion: put your favorite design model on `design` and a different reviewer model on `reviewer`.

The asymmetry is enforced by the permission layer, not by convention. Preserving the exact permission frontmatter in the bundled agent files installed during Step 4 is what makes Fusion work.

## Step 0 - Offer a subscription profile

Before the per-role interview, ask whether the user's models come from one of these subscriptions. Each maps to a bundled profile - a ready-made config fragment in `<this-skill-dir>/profiles/` with sane per-role defaults:

| Profile | Subscription |
| --- | --- |
| `opencode-go` | OpenCode Go (low-cost open-model plan on OpenCode Zen) |
| `opencode-zen` | OpenCode Zen pay-as-you-go credits |
| `opencode-zen-free` | OpenCode Zen free-tier models only |
| `chatgpt` | ChatGPT Plus or Pro |
| `github-copilot` | GitHub Copilot |
| `cerebras-code` | Cerebras Code |

If the user names one (including as a `/fusion-setup` argument):

1. Read `<this-skill-dir>/profiles/<name>.json` and show its role -> model table for confirmation. The JSON is the single source of truth - never quote model ids from memory or from this document.
2. Remind them that authentication is out-of-band: the provider must be connected once via `opencode auth login` (or `/connect` inside opencode) with their subscription login or key. NEVER ask for a key in the chat. Profile provider blocks deliberately contain no npm adapter, baseURL, or apiKey - opencode knows these providers natively; the blocks only carry display names.
3. Skip Steps 1-3 and run the installer with the profile (Step 4's delegation rules still apply):

   ```bash
   node <this-skill-dir>/scripts/install.js apply --profile <name> --extras commands,plugin
   ```

   No `--roles` flag is needed: the installer derives the role list from the profile, so every role the profile assigns a model also gets its permission-bearing agent file.
4. To change one or two picks, keep `--profile <name>` and add `--config <fragment.json>` holding just the delta (for example a different `agent.reviewer.model`, plus a provider block only if that model's provider is outside the profile). The fragment wins over the profile. Removing an optional role a profile assigns cannot be expressed as an override - use the custom interview (Steps 1-4) without `--profile` instead.

Caveats worth mentioning when they apply: `opencode-go`, `opencode-zen-free`, and `cerebras-code` include a `vision` role because their main models cannot read images; `opencode-zen-free` runs on free-period models whose prompts may be used for training under OpenCode's policy - warn users to keep sensitive code off it; the single-vendor `chatgpt` and `cerebras-code` profiles keep every role on one vendor, so a user with a second provider may want to override the reviewer for cross-vendor review; `github-copilot` defaults its main to Claude Sonnet 5 for credit-cost sanity - a user who wants max quality can override build to `github-copilot/claude-fable-5` (billed much higher per token). There is deliberately NO Claude Pro/Max profile - Anthropic's terms prohibit using those subscriptions outside Claude Code, so never improvise one; a user who wants Claude models gets them the sanctioned ways: `opencode-zen` (Zen resells them pay-as-you-go) or an Anthropic API key via the Step 1 interview. Subscription lineups rotate - if a profile model errors as unknown, the ids may have drifted; fall back to the custom interview and report it.

If the user has none of these subscriptions, or wants full control over every pick, continue with Step 1.

## Step 1 - Gather the user's model choices

Ask the user which model to use for each role. Do not assume; let them choose their own provider and models. Collect:

1. Main/build model (a strong model - e.g. an Opus/GPT-class model).
2. Sidekick model (a fast, cheaper coding model).
3. Explore model (cheap; can be the same as sidekick).
4. Research model (read-only external research; a solid general model).
5. Design model (frontend/UI work; pick whichever model does design best in your opinion).
6. Reviewer model (critiques plans and audits diffs; often a strong model, and deliberately can differ from the main model).
7. Vision model (reads images) - ONLY ask this if the user's main/build model does not support image input. Most frontier models read images directly, so skip this question unless the main model cannot. The vision model must be one that accepts image input.

Roles 4-7 are optional a-la-carte pieces. If the user only wants the core build/plan/sidekick/explore roles, skip them - but offer them, since choosing a different model per specialist is a key reason to use Fusion. The `plan` agent activates from its installed `agent/plan.md` (Step 4), which overrides opencode's built-in plan agent - it reuses the main/build model and needs no `agent.plan` block in opencode.json and no separate model question. Do not offer `vision` when the main model already reads images.

For each distinct provider the chosen models use, collect the connection details:
- provider id (e.g. `kiro`, `progrok`, `anthropic`, `openai`)
- the npm adapter (for OpenAI-compatible local gateways use `@ai-sdk/openai-compatible`)
- baseURL (for local gateways / custom endpoints)
- if the endpoint needs a key: the NAME of an environment variable that holds it (e.g. `MYPROVIDER_API_KEY`). NEVER ask the user to paste the actual key into the chat - the config references the variable and opencode resolves it at startup, so the secret never appears in the conversation or in plaintext config.
- the model id(s) and a display name

If the user is unsure, offer the OpenAI-compatible local-gateway shape as the default pattern and ask for their baseURL and key env var name.

## Step 2 - Build the provider blocks

For each provider, build a block under `provider`. OpenAI-compatible template:

```json
"<provider-id>": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "<display name>",
  "options": {
    "baseURL": "<baseURL>",
    "apiKey": "{env:<ENV_VAR_NAME>}"
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

The `{env:...}` placeholder is documented opencode config syntax: the key is read from the user's environment at startup, so it never sits in plaintext in opencode.json. An UNSET variable silently resolves to an empty string, which surfaces later as auth errors - tell the user to set the variable in the environment they launch opencode from. If they prefer a key file, `"apiKey": "{file:~/.secrets/<name>}"` works the same way.

Only include `attachment`/`modalities` for models that actually support image input. A main model with image input means no separate vision agent is needed.

The template above shows the OpenAI-compatible shape (`@ai-sdk/openai-compatible`). If a provider is a native vendor rather than an OpenAI-compatible gateway, use that vendor's adapter instead - for example `@ai-sdk/anthropic` for an Anthropic-style endpoint or `@ai-sdk/openai` for OpenAI. Only the `npm` value changes; the rest of the block shape is the same.

If two roles use different models from the SAME provider (for example a main model and a cheaper research model both on provider `kirocc`), do NOT emit two provider blocks with the same id - that is a duplicate key. Emit ONE block for that provider with BOTH models listed under its `models` object, like this:

```json
"kirocc": {
  "npm": "@ai-sdk/anthropic",
  "name": "Kirocc",
  "options": { "baseURL": "<baseURL>", "apiKey": "{env:KIROCC_API_KEY}" },
  "models": {
    "claude-opus-4-8": { "name": "Opus", "attachment": true, "modalities": { "input": ["text", "image"] } },
    "claude-sonnet-5": { "name": "Sonnet" }
  }
}
```

## Step 3 - Build the config fragment

Build a config FRAGMENT with this exact structure and save it to a temporary file (OS temp dir is fine). Do NOT write `~/.config/opencode/opencode.json` yourself - the installer script in Step 4 merges the fragment in deterministically. When running as the restricted Fusion build agent, delegate creation of the temporary fragment and the Step 4 installer command together in one sidekick task so build never needs direct filesystem access. In plan mode, stop after specifying the choices and tell the user to switch to build (or run the command themselves); plan must not execute the install. Replace the `<...>` placeholders with the user's choices. Model references are always `provider-id/model-id`. The JSON only assigns models - each role's mode, permissions, and prompt come from its agent file (Step 4), and the build agent's permission frontmatter is the core of Fusion and must not be loosened.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "<main-provider>/<main-model-id>",
  "provider": {
    "<main-provider-id>": { "npm": "...", "options": {}, "models": {} },
    "<sidekick-provider-id>": { "npm": "...", "options": {}, "models": {} }
  },
  "agent": {
    "build": { "model": "<main-provider>/<main-model-id>" },
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
- opencode auto-loads every markdown file in `~/.config/opencode/agent/` as an agent definition: frontmatter supplies the role's `mode` and `permission`, and the body is its prompt. No `prompt` fields belong in opencode.json - Step 4 installs the files that carry them.
- Backup and merge are the installer's job (Step 4): it backs up any existing config to `opencode.json.backup.<timestamp>` and deep-merges the fragment - your fragment wins on conflicting keys, everything else in the user's config is preserved. Never silently discard an existing config: if the user explicitly wants a clean overwrite instead of a merge, they should move the old `opencode.json` aside first.
- Add `"vision": { "model": "<vision-provider>/<vision-model-id>" }` to the `agent` block ONLY if the user configured a vision role (main model lacks image input). Omit it otherwise.
- OPTIONAL top-level hardening keys (documented opencode fields; add if the user wants a tighter, cheaper, more private local setup):
  - `"small_model": "<cheap-provider>/<cheap-model-id>"` - opencode uses a small model for background tasks like title generation; if unset it may fall back to a remote default. Pin it to one of the user's own cheap local models to keep everything on their providers.
  - `"enabled_providers": ["<provider-a>", "<provider-b>"]` - allowlist of providers to load; keeps the model picker deterministic and ignores any other credentials present.
  - `"compaction": { "prune": true }` - drops stale tool outputs when compacting context, which cuts main-agent token cost in a delegation-heavy Fusion flow.
  - Per custom model, an optional `"limit": { "context": <n>, "output": <n> }` inside the model block lets opencode track remaining context accurately (models on models.dev supply this automatically; custom local gateways do not). Use the real context/output window for that model; do not guess.

## Step 4 - Run the deterministic installer

The skill bundles an installer at `<this-skill-dir>/scripts/install.js` (plain Node, no dependencies). It owns every mechanical step - timestamped backup, deep merge, atomic write, prompt-file copies, an undo manifest, and post-install validation - so none of that depends on improvised file operations. Its version-2 manifest stores the original bytes and permissions of every managed file, plus hashes of the exact installed state. Reapply and undo refuse before writing if the config or a managed file changed after installation; they never guess which content belongs to Fusion. Run it with the fragment from Step 3:

```bash
node <this-skill-dir>/scripts/install.js apply --config <path-to-fragment.json> --roles build,plan,sidekick --extras commands,plugin
```

- `--profile <name>` applies a bundled subscription profile (Step 0) as the base fragment; a `--config` fragment, when also given, overrides it key by key. With a profile, omit `--roles` - the installer derives the list from the profile - and an explicit `--roles` that drops a profile-assigned role is refused. Unknown profile names fail listing the available ones.
- `--roles` is comma-separated and defaults to the core `build,plan,sidekick` (explore needs no file by design). Append exactly the optional roles the user configured, e.g. `--roles build,plan,sidekick,research,reviewer`; include `vision` only if a vision role was configured.
- `--extras commands,plugin` installs the optional slash commands and audit plugin described below; trim or omit per the user's wishes.
- Add `--dry-run` to print the full plan (backup name, merged keys, files) without writing anything - offer this if the user seems cautious.
- The script refuses with exit 1 and changes nothing when validation or ownership checks fail, including invalid JSON/config shapes, unsafe paths, changed managed files, and invalid destination parents. It warns when a model references a provider that has no provider block.
- If the agent running this skill cannot execute bash (for example the Fusion build agent's allowlist), delegate both the fragment creation and this exact command to the sidekick. In plan mode, switch to build or have the user run it. Use the manual fallback below only when Node is unavailable.

### Manual fallback - install the agent prompt files by hand

Only when Node is unavailable. Before merging or copying anything, make a timestamped backup of `opencode.json` and of every destination file that already exists, and record which destinations did not exist. Then copy the prompt files bundled with this skill into the global agent folder (one per role you configured). `<this-skill-dir>` is the directory this SKILL.md lives in - its bundled prompts are in the `agent/` subfolder next to this file. Every configured role except `explore` needs its agent file installed (explore is opencode's built-in read-only subagent and only gets a model in the JSON); in particular the sidekick DOES need its `agent/sidekick.md` file - its permissions and prompt come entirely from that file:

- `<this-skill-dir>/agent/build.md` -> `~/.config/opencode/agent/build.md`
- `<this-skill-dir>/agent/plan.md` -> `~/.config/opencode/agent/plan.md`
- `<this-skill-dir>/agent/sidekick.md` -> `~/.config/opencode/agent/sidekick.md`
- `<this-skill-dir>/agent/research.md` -> `~/.config/opencode/agent/research.md`
- `<this-skill-dir>/agent/design.md` -> `~/.config/opencode/agent/design.md`
- `<this-skill-dir>/agent/reviewer.md` -> `~/.config/opencode/agent/reviewer.md`
- `<this-skill-dir>/agent/vision.md` -> `~/.config/opencode/agent/vision.md` (only if a vision role was configured)

These carry the full operating instructions and permissions for each role. Each subagent file's frontmatter sets its `mode` and `permission`; the files deliberately ship WITHOUT a `model` key, because markdown frontmatter overrides opencode.json on any key it sets - a model baked into the file would silently override the user's Step 3 choice. Models come only from opencode.json. Install only the files for the roles you configured - if the user skipped research/design/reviewer/vision, skip those.

## Step 4b - The optional slash commands and audit plugin

Three optional extras ship next to the skill; the installer's `--extras commands,plugin` flag installs them (manual copy paths below if the script cannot run):

- Slash command: copy `<this-skill-dir>/commands/fusion-setup.md` -> `~/.config/opencode/commands/fusion-setup.md` (note the PLURAL `commands/` directory). This gives a discoverable `/fusion-setup` command that launches this setup flow; it accepts optional arguments for a targeted reconfigure.
- Status command: copy `<this-skill-dir>/commands/fusion-status.md` -> `~/.config/opencode/commands/fusion-status.md`. This gives a `/fusion-status` health check that verifies the setup is installed, loaded, and enforcing (live tool schema, config on disk, installed agent files). It only reports - it changes nothing.
- Audit plugin: copy `<this-skill-dir>/plugins/fusion-audit.js` -> `~/.config/opencode/plugins/fusion-audit.js` (PLURAL `plugins/`). It logs the delegation tree (subagent spawns and edit/write/apply_patch/task tool calls) and aggregates per-agent token usage per session via opencode's logger for auditing - the raw numbers behind "did Fusion actually save money?". It is observational only - it cannot see the calling agent, so it does not enforce anything; permissions do the enforcing. Skip it if the user does not want extra logging.

## Step 5 - Validate and finish

1. The installer validates automatically (it re-parses the written config and checks every installed file exists, failing loudly otherwise). If you used the manual fallback instead, do the same checks yourself: parse `~/.config/opencode/opencode.json`, and confirm every agent prompt file you installed exists under `~/.config/opencode/agent/` (build and sidekick at minimum).
2. If you installed the commands or plugin manually, confirm `~/.config/opencode/commands/fusion-setup.md`, `~/.config/opencode/commands/fusion-status.md`, and/or `~/.config/opencode/plugins/fusion-audit.js` exist.
3. If any provider block references `{env:VAR}`, confirm with the user that the variable is set in the environment they launch opencode from - using a presence-only check that never prints the secret: `[ -n "$VAR" ] && echo set || echo missing` in bash/zsh, `if defined VAR (echo set) else (echo missing)` in cmd. Do NOT suggest `echo $VAR` - that prints the actual credential into the terminal (and into the transcript if run through an agent). An unset variable becomes an empty string and shows up later as auth errors.
4. Tell the user to fully quit and restart opencode - config is loaded once at startup and is not hot-reloaded. After restart, the status bar should show the main model on the Build agent.

## Reconfiguring later

To change a model, build a small fragment with `agent.<role>.model` (and a `provider` block if the new model uses a new provider), then rerun the installer and restart opencode. For a profile-based install, rerun with the same `--profile <name>` plus the small `--config` delta. Do not edit an installer-managed config in place: the ownership check intentionally treats that as a local customization and refuses to overwrite it. Reapply preserves the original pre-Fusion baseline and keeps all previously managed files recorded for a complete undo.

## Undoing Fusion

Run the bundled undo. It restores the exact pre-install config and every destination that Fusion replaced, removes only destinations Fusion originally created, keeps every timestamped config backup, and refuses before changing anything if the installed state was edited afterward or the manifest is unsafe:

```bash
node <this-skill-dir>/scripts/install.js undo
```

Manual fallback after a manual install (no Node):

1. Restore `opencode.json` and every destination that existed before installation from the backups made during the manual install.
2. For destinations recorded as newly created, remove them only if they are still byte-for-byte identical to the bundled file that was installed. If any file changed, leave it in place and report the conflict instead of deleting user work.
3. Apply the same restore-or-remove rule to optional commands and the audit plugin.
4. Tell the user to restart opencode - it falls back to its built-in build/plan agents.

For an automatic install when Node is temporarily unavailable, wait until Node is available and use the manifest-driven undo. If an automatic manifest is missing, the timestamped files recover only `opencode.json`; do not remove prompts or extras unless independent backups or byte-for-byte ownership evidence prove they are still Fusion-owned. Confirm with the user before deleting anything, and never delete the backups themselves.
