# opencode-fusion

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A minimal, working multi-model team for [opencode](https://opencode.ai): a **main agent** that plans and reviews but **cannot edit files**, delegating every change to a cheaper, faster **sidekick**. Inspired by the [Devin Fusion "sidekick" pattern](https://cognition.com/blog/devin-fusion) from Cognition.

The main agent's file editing is mechanically denied. Its only way to change a file is to hand a spec to the sidekick. That keeps frontier intelligence on the decisions that matter (the plan, the interpretation of ambiguity, the review) while a cheap model does the mechanical work. Cognition reports the pattern holds frontier-level quality at roughly **35% lower cost** on their own FrontierCode benchmark, and in a July 2026 follow-up measured a Fable 5-led setup at **54% below pure Fable 5** with near-identical quality: cheaper in absolute dollars than an Opus 4.8-led setup, despite Fable's 2x per-token price.

The main pair is backed by read-only helpers (**explore**, **research**) and optional specialists (**design**, **reviewer**, **vision**), each on a model you choose. See the [full team](#how-it-works).

[Quick start](#quick-start) • [How it works](#how-it-works) • [Setup](#setup) • [Customize](#customize) • [FAQ](#faq) • [Troubleshooting](#troubleshooting)

## Demo

https://github.com/user-attachments/assets/6d9e96e2-654a-4bc4-82af-3c3f1a8bde91

One full delegation cycle in 38 seconds: the main agent plans, hands a spec to the sidekick, reviews the returned diff, and verifies the result, without ever touching a file itself.

## Quick start

Install the setup skill globally, then let opencode configure everything conversationally:

```bash
npx skills add mihneaptu/opencode-fusion --skill fusion-setup -g -a opencode -y
```

```
set up fusion
```

The installer needs **Node 20.12 or newer**. On older Node (including Ubuntu's apt default) it crashes with a `styleText` error; [Troubleshooting](#troubleshooting) has three workarounds. The skill interviews you for a model per role, writes the global config, installs the agent prompts, and tells you when to restart. On a subscription (OpenCode Go/Zen, ChatGPT, or GitHub Copilot)? Name it and the skill starts from a ready-made [profile](#subscription-profiles) instead of asking per role. Manual setup and provider examples live in [Setup](#setup).

## Why it works

From [Cognition's blog post](https://cognition.com/blog/devin-fusion):

> We've found that the main agent should take minimal actions, and only read what is absolutely necessary. By default it should delegate and monitor, while making the significant decisions: the plan, the interpretation of ambiguity, the final review.

This repo turns that into a hard constraint: the main agent's edit, search, and freeform bash tools are denied at the permission layer, so delegating to the sidekick is its only way to change a file. Two payoffs fall out of the split:

**Lower cost.** Implementation mechanics are most of a session's tokens. A cheaper sidekick handles them at near-parity while the expensive main model spends its tokens only on judgment: the plan, the spec, the review. The main agent's prompt enforces this discipline: emit judgment not volume, keep context lean, reason once then hand off. Cognition's [follow-up study](https://cognition.com/blog/making-fable-cheaper-than-opus) bears this out: in 81% of Fable-led Fusion runs, the lead model never made a single code edit. That is the behavior this repo makes mechanical rather than advisory.

**Cross-vendor review, for free.** When the main agent and sidekick are different model families (for example Opus reviewing Grok), every diff gets an independent second-family read before it lands. Models from one family share blind spots; a reviewer from a different lineage catches what same-family review misses. You get this just by picking a main and sidekick from different vendors.

## How it works

![System architecture: a two-column swimlane showing the flow between the Main Agent (left) and Sidekick (right)](flow-diagram.png)

The diagram shows one delegation cycle: the main agent delegates exploration, plans from what comes back, hands the sidekick a spec, reviews the returned diff, loops until it passes, then delivers the result.

| Agent | Role | Config key | Required | Suggested model (2026) |
|-------|------|------------|----------|------------------------|
| `build` | Main: plan, delegate, review | `agent.build.model` | core | `claude-fable-5` |
| `plan` | Plan mode: same brain as build, plans but does not execute | `agent/plan.md` (file) | core | reuses main model |
| `sidekick` | Execute edits and commands | `agent.sidekick.model` | core | `grok-4.5` |
| `explore` | Fast read-only exploration (opencode's built-in agent; no prompt file) | `agent.explore.model` | core | `grok-4.5` |
| `research` | Read-only external research (web, docs) | `agent.research.model` | optional | `claude-sonnet-5` |
| `design` | Frontend/UI implementation | `agent.design.model` | optional | `kimi-k3` |
| `reviewer` | Critique a plan before implementation; audit a diff before commit | `agent.reviewer.model` | optional | `gpt-5.6-sol` |
| `vision` | Transcribe images the main model cannot see | `agent.vision.model` | optional | `gemini-3.5-flash` |

Models move fast. Treat these as 2026 starting points, not requirements. Use any provider you like; in config each model is written as `provider/model-id` (for example `openai/gpt-5.6-sol`), and the sidekick should stay cheaper and faster than the main agent. The mix above spans several vendors on purpose, so the main agent's review of each sidekick diff is cross-vendor. If a subscription covers your models, a [profile](#subscription-profiles) fills this table in for you.

## Enforced vs. advised

The pattern's guarantees live in two different layers, and being precise about which is which answers most "what if the model just ignores the instructions?" questions.

**Enforced: the permission layer.** opencode checks these on every tool call, no matter what the model reads, remembers, or intends:

- The main agent's `edit`, `grep`, `glob`, and `list` are denied. Denied tools are removed from the model's tool schema entirely; there is no edit tool for it to decline to use.
- Its bash is deny-by-default with a short verification and git allowlist, so file-writing commands are blocked. `git commit` and `git push` additionally require per-command user approval; common direct force/mirror/delete/prune forms are denied by later rules.
- Direct `git commit` and `git push` invocations plus common Git wrapper forms are denied for the sidekick and design agents, making review-then-commit the normal enforced path.
- Delegation is bounded by an explicit `task` allowlist: the main agent reaches only its named specialists, and the sidekick can spawn only read-only searchers.

If the main agent "won't delegate," the result is visible inaction: nothing on disk changes. The failure mode is never a silent bypass.

**Advised: the prompt layer.** Spec precision, diff-review rigor, cost discipline, parallelization, and skill usage are instructions in the agent prompts. opencode loads skills at the model's discretion (nothing can force an agent to read or apply one), which is exactly why no guarantee here depends on them; the skill in this repo is just the installer. If the model slacks at this layer, the cost is quality or wasted tokens, never an unauthorized edit.

**Not guaranteed: the threat model.** The permission layer bounds which tools each agent can call. It is not a sandbox, and it is worth being precise about what it does not protect:

- The `.env` denies on the executors stop the common accidental read (`cat .env` landing a key in a transcript), not a determined one. An agent with broad bash has many equivalent ways to read a file or the process environment, so treat those rules as accidental-leak prevention, not secret isolation. The `{env:VAR}` config syntax keeps keys out of plaintext config and out of the chat; it does not hide them from the environment agents run in.
- Git command rules match command text and are defense-in-depth, not a shell sandbox: wrappers, alternate executables, or obfuscation can bypass a finite pattern list when an executor has broad bash. They protect against common accidental commits and destructive pushes, not a hostile process. Editing files is the sidekick's job, and catching a wrong edit is what the main agent's diff review (and the optional reviewer) are for.
- The design agent's path-aware opencode tools are fenced to the workspace (`external_directory: deny`), but processes launched through broad bash are not OS-sandboxed by that rule. The sidekick keeps opencode's default `ask` for paths outside the project, because setup and reconfigure legitimately write the global config. Note that `--auto` mode auto-approves `ask` rules, so use external sandboxing too if an executor must never leave the repo.

**Auditable: verify instead of trusting.** The optional [`fusion-audit` plugin](#slash-commands-and-optional-plugins) logs the delegation tree, and opencode's session DB records every agent's actual tool calls (`opencode db path` prints its location, typically `~/.local/share/opencode/opencode.db`). "Did it really delegate?" is checkable ground truth, not vibes.

## Setup

Fusion lives entirely in your **global** opencode config at `~/.config/opencode/` (Windows: `%USERPROFILE%\.config\opencode\`). There is no build step and nothing to clone into your projects.

### Recommended: let opencode set it up

This repo ships a skill, `fusion-setup`, that configures everything conversationally. Install it globally (Node 20.12+):

```bash
npx skills add mihneaptu/opencode-fusion --skill fusion-setup -g -a opencode -y
```

Or copy the `fusion-setup` folder from this repo's `.opencode/skills/` into `~/.config/opencode/skills/`. Skills are discovered on demand; no restart is needed to pick one up. Then say:

```
set up fusion
```

It asks which model and provider you want for each role, writes `~/.config/opencode/opencode.json`, installs the agent prompts under `~/.config/opencode/agent/`, and tells you to restart. The mechanical steps (timestamped backup, config merge, atomic write, file copies, validation, and undo) run through a small deterministic script bundled with the skill, so the sensitive part of setup does not depend on model compliance. To change models later, say "reconfigure fusion" or edit the config directly (see [Customize](#customize)); "undo fusion" restores the recorded backup and removes exactly what was installed.

### Subscription profiles

If your models come from a subscription, skip the per-role interview: name the subscription during setup (or run `/fusion-setup opencode-go`) and the skill applies a bundled profile: a ready-made role-to-model mapping the installer merges like any other config fragment. Directly: `node <skill-dir>/scripts/install.js apply --profile <name> --extras commands,plugin`.

| Profile | Subscription | Main / sidekick | Beyond the core roles |
|---------|--------------|-----------------|-----------------------|
| `opencode-go` | [OpenCode Go](https://opencode.ai/go) | GLM 5.2 / DeepSeek V4 Flash | research, design, reviewer, vision |
| `opencode-zen` | [OpenCode Zen](https://opencode.ai/docs/zen/) pay-as-you-go | Claude Fable 5 / GLM 5.2 | research, design, reviewer |
| `opencode-zen-free` | OpenCode Zen free-tier models | Big Pickle / MiMo V2.5 Free | vision |
| `chatgpt` | ChatGPT Plus or Pro | GPT-5.6 Sol / GPT-5.6 Luna | core roles only |
| `github-copilot` | GitHub Copilot | Claude Sonnet 5 / GPT-5.4 Mini | research, reviewer |

Authentication stays out-of-band: connect the provider once with `opencode auth login` (or `/connect` inside opencode). Profiles contain no keys, adapters, or endpoints (opencode knows these providers natively), and the skill never asks for a key in chat. To adjust a pick, keep the profile and add a small override fragment (`--profile <name> --config <delta.json>`; your fragment wins on conflicts).

Four notes. `opencode-go` and `opencode-zen-free` include a `vision` role because their main models cannot read images. `opencode-zen-free` runs on free-period models (Big Pickle is a stealth model). OpenCode's policy allows prompts to be used for training while a model is free, so keep sensitive code off this profile. The single-vendor `chatgpt` profile keeps every role on one vendor, so the cross-vendor review benefit needs a one-line reviewer override if you have a second provider; `github-copilot` defaults to Claude Sonnet 5 as the main for credit-cost sanity; override `agent.build.model` to `github-copilot/claude-fable-5` if you want max quality and accept the burn rate. There is no Claude Pro/Max provider profile: a Claude subscription login cannot be placed in `opencode.json` or exposed as `agent.build.model`. The optional bridge below can ask the official Claude Code CLI for a constrained plan review. Subscription lineups rotate; `npm run check-profiles` verifies every shipped id against [models.dev](https://models.dev), and CI runs it on each push.

### Optional Claude Pro/Max plan review

The `claude` installer extra adds a small OpenCode plugin that invokes the official Claude Code CLI. It gives the Fusion build and plan agents two custom tools: `fusion_claude_status` and `fusion_claude_review`. Claude receives only the self-contained plan packet that Fusion sends. It cannot inspect the workspace, use tools, edit files, continue the session, or become the main model.

1. [Install Claude Code](https://code.claude.com/docs/en/setup) and run `claude auth login` yourself with a Pro or Max account. On Windows use the native build (the installer script or `claude install`): the bridge launches `claude` without a shell, which the npm `claude.cmd` shim does not support.
2. Run the Fusion installer with your normal OpenCode profile or config and add the extra: `--extras commands,plugin,claude`.
3. Fully quit and restart OpenCode. Ask Fusion to check `fusion_claude_status`, or say: "Have Claude review the plan before implementation."

The plugin never reads or copies Claude's stored OAuth token. Before every review it checks for a first-party Pro/Max login, removes API-key and alternate-provider routing from the Claude process, defaults to `claude-fable-5` at high effort (the review tool accepts an optional full `claude-*` model id and an effort of low/medium/high/xhigh/max per call), uses [Claude Code print mode](https://code.claude.com/docs/en/cli-usage), disables tools and customizations, and turns off session persistence. Reviews run from a neutral temporary directory rather than your workspace, and the tools refuse any caller other than the build and plan agents at runtime, so even a hand-copied plugin without the installer's global deny serves no other agent. OpenCode denies these tools globally and grants them only to the build and plan agents through [custom-tool permissions](https://opencode.ai/docs/agents/).

This remains an optional third-party integration. [Anthropic says](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) subscription usage is designed for its native applications, including Claude Code, and that some third-party-tool access may be allowed at its discretion or charged to usage credits. The bridge does not misrepresent itself or convert OAuth into an API credential, but it is not a promise that subscription access or billing behavior will never change.

<details>
<summary><b>Manual setup</b> (configure the JSON by hand)</summary>

Write `~/.config/opencode/opencode.json` yourself. Pick your own models; the structure is what matters. The JSON only assigns each role its model. The mechanical core of Fusion (the build agent's `edit: deny` and bash allowlist) lives in the agent files you install below, and must not be loosened.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "subagent_depth": 2,
  "model": "<main-provider>/<main-model-id>",
  "provider": {
    "<your provider blocks here>": {}
  },
  "agent": {
    "build": { "model": "<main-provider>/<main-model-id>" },
    "explore": { "model": "<explore-provider>/<explore-model-id>" },
    "sidekick": { "model": "<sidekick-provider>/<sidekick-model-id>" }
  }
}
```

The specialists are optional and a-la-carte. To add one, give it a model entry in the `agent` block alongside `explore`/`sidekick`, for example `"reviewer": { "model": "<provider>/<model-id>" }`, and install its prompt file. Their prompts and permissions live in the skill bundle: `.opencode/skills/fusion-setup/agent/` holds `research.md`, `design.md`, `reviewer.md`, and `vision.md`. Add `vision` only if your main model cannot read images. Plan mode uses `agent/plan.md` and reuses the main model. `explore` is the one role with no prompt file: it is opencode's built-in read-only subagent, so it gets a model entry in the JSON and nothing else; there is intentionally no `agent/explore.md` in this repo.

Then install the agent files. opencode auto-loads every markdown file in `~/.config/opencode/agent/` as an agent definition. The frontmatter carries the role's mode and permissions (this is where the edit denial is mechanically enforced), and the body is its prompt:

```bash
mkdir -p ~/.config/opencode/agent
cp .opencode/skills/fusion-setup/agent/{build,plan,sidekick}.md ~/.config/opencode/agent/
```

Model references are always `provider-id/model-id`. If a model uses a provider opencode does not know yet, add a `provider` block for it (see the OpenAI-compatible template in the `fusion-setup` skill).

> [!IMPORTANT]
> Restart opencode after writing the config; it loads config once at startup, not mid-session.

</details>

<details>
<summary>Example provider: Grok as the sidekick via progrok</summary>

Any provider works, but if you want to use xAI's Grok Composer as the fast sidekick model, [progrok](https://github.com/lidge-jun/progrok) turns a SuperGrok OAuth session into a local OpenAI-compatible endpoint:

```bash
npm install -g progrok
progrok login        # browser OAuth with your xAI account
progrok proxy        # leave this running in a terminal
```

The proxy serves at `http://127.0.0.1:18645/v1`. Point a provider block at that baseURL with any placeholder apiKey; progrok injects your real OAuth token before forwarding to xAI.

</details>

## Verify it works

Open a project with some lint errors and ask:

```
fix the lint errors in this project
```

You should see the main agent delegate exploration, receive the findings, make a plan, then delegate execution to the sidekick via the `task` tool. The sidekick makes the edits, and the main agent verifies by running `npm run lint` itself before reporting back.

> [!NOTE]
> Along the way you may see the occasional command struck through with a permission error (for example the agent trying `git ls-files`). That is not a bug. The main and plan agents run bash deny-by-default, so anything outside their short allowlist is mechanically blocked, and the agent recovers on its own by reading the file or delegating the search. A denied command is the guardrail working, not the setup failing.

## Customize

### Swap models

All agent models live in one place: `~/.config/opencode/opencode.json` under `agent`, one `model` value per agent (keys and suggested models are in the [table above](#how-it-works)).

Change the value, add a `provider` block if the model uses a new provider, and restart opencode. For a persistent default main model, also update the top-level `model` field. The sidekick should stay cheaper and faster than the main agent when possible.

> [!WARNING]
> Do not add a `model:` line to the agent `.md` files themselves: frontmatter overrides `opencode.json` on any key it sets, so a model baked in there would silently win over your config.

> [!TIP]
> Run `/models` in opencode to swap the active model for the current session only.

### Adjust the bash allowlist

The main agent's bash is allowlisted to verification and git commands (`npm run lint`, `npm test`, `git diff`, `git status`, `git log`, `git show`, `git add`); `git commit` and `git push` prompt for per-command approval, and force/mirror/delete-ref pushes are denied. Edit the installed `~/.config/opencode/agent/build.md` to add or remove allowed commands in the `permission.bash` section. Keep `"*": "deny"` first so unlisted commands are blocked by default, and keep the specific push denies *after* `"git push*"`; opencode resolves overlapping patterns by last-match-wins. Note that the allowlist matches each command individually: do not chain commands with `&&`, `||`, `;`, or `|`, because the chain will not match any single pattern and gets blocked.

<details>
<summary><b>Depth requirement and optional hardening</b></summary>

`"subagent_depth": 2` (top level) is required when sidekick delegates a read-only lookup to explore or research. OpenCode 1.18.2+ defaults to `1`, which allows the main agent to start sidekick but blocks that nested helper call. The Fusion installer sets a minimum of `2` and preserves larger existing values.

The remaining documented keys make a local Fusion setup cheaper, more private, and more deterministic. They are optional:

- `"small_model": "<provider>/<cheap-model>"` (top level): opencode runs background tasks like session-title generation on a small model; if you do not set this it can fall back to a remote default. Pin it to one of your own cheap local models to keep everything on your providers.
- `"enabled_providers": ["..."]` (top level): allowlist the providers opencode loads, so a stray credential elsewhere cannot add models to the picker.
- `"compaction": { "prune": true }` (top level): drops stale tool outputs when compacting, cutting main-agent token cost in a delegation-heavy flow.
- `"limit": { "context": <n>, "output": <n> }` (inside a custom model block): lets opencode track remaining context for models not on models.dev, such as local gateways. Use the model's real window; do not guess.
- Sidekick bash denylist: the sidekick has broad `bash`, but its prompt frontmatter denies direct `git commit`/`git push` and common wrapper forms (committing is the main agent's job, after review), blocks common `.env` reads, and asks before `git reset --hard`, `git clean`, and `rm -rf` (plus their PowerShell/cmd equivalents: `Remove-Item -Recurse`/`-Force`, `rd /s`, `del /s`). These are defense-in-depth command guards, not process isolation.

</details>

## Limitations

- **No dynamic mid-session routing.** Devin Fusion's second technique, swapping the active model mid-task during context compaction, needs Devin's closed product surface and is not possible in opencode. This repo implements the sidekick pattern only; model assignments are fixed per role at startup. It is an explicit non-goal, not a missing feature.
- **Config loads at startup.** opencode reads config once when it launches. Any change to `opencode.json` or an agent prompt requires a full restart to take effect.
- **Loop protection has two layers.** `subagent_depth: 2` caps Fusion at the required main -> executor -> read-only helper chain. The `task` permission graph independently controls which named agents each role may launch, so allowing the second level does not expose arbitrary subagents.
- **Targets opencode 1.x.** These files are written against opencode's stable 1.x config schema (verified on 1.18.x). The opencode v2 beta (`opencode2`) uses a different schema (plural `agents`, array-based `permissions`) and is not supported by this repo yet.

## FAQ

<details>
<summary><b>What happens when the sidekick can't satisfy the spec?</b></summary>

The main agent's prompt carries an explicit escalation ladder, so the retry loop always terminates:

1. **First miss:** re-delegate with feedback naming the specific problem.
2. **Second miss:** stop describing and start dictating. The main agent authors the exact patch itself (file, line range, verbatim code) and hands it over to apply. Applying a verbatim patch needs no judgment, so this ends the capability question: the sidekick becomes a pair of hands. You lose the cost saving on that one task, but you cannot deadlock.
3. **Dictated patch still fails verification:** the plan is wrong, not the sidekick, and the main agent revises the plan. It reports a blocker only when verification fails for reasons outside the code (broken environment, flaky tests), with the real command output attached.

The mechanical block is on the main agent's *tools*, not on the content of its specs. Dictating an exact diff was always within the rules; the prompt makes it an explicit step instead of an emergent discovery.

</details>

<details>
<summary><b>What if the agents ignore the prompts, or never load the skills?</b></summary>

You lose quality, not guarantees; see [Enforced vs. advised](#enforced-vs-advised). Delegation is not a behavior the main agent chooses: its edit and search tools are removed from its tool schema at the permission layer, so handing work to the sidekick is the only path that exists. Skills are advisory in every harness (opencode loads them at the model's discretion), which is why nothing load-bearing lives in one. And you can verify instead of trusting: the `fusion-audit` plugin and opencode's session DB record what every agent actually did.

</details>

<details>
<summary><b>How is this different from superpowers or other orchestration approaches?</b></summary>

Different layer. Skill libraries like [superpowers](https://github.com/obra/superpowers) teach agents *how to work*: process knowledge (TDD, debugging, planning) delivered as skills and hooks. That guidance is valuable, but a hook injects text, and the model can still not comply. Fusion configures *what agents can do*: capabilities are removed at the permission layer, so the pattern holds even when the model has a bad day. The second difference is the point of the pattern: per-role model routing for cost (expensive judgment, cheap execution) with cross-vendor review as a side effect, which skill libraries do not do. Versus code-level frameworks like LangGraph or CrewAI: no framework and no code; this is configuration on a normal interactive session. The approaches compose: superpowers supports opencode, so its skills can run inside a Fusion setup.

</details>

## Troubleshooting

<details>
<summary>Common issues</summary>

If you installed the optional command, run `/fusion-status` first; it checks the usual suspects in one shot: live enforcement in the running session, the config on disk, and the installed agent files.

### `npx skills add ...` crashes with a `styleText` SyntaxError

```
SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
```

Your Node is too old for the installer. The install command runs Vercel's [`skills`](https://github.com/vercel-labs/skills) CLI, and since `skills@1.5.16` its bundle uses `util.styleText`, which only exists in **Node 20.12+**, even though the package still declares support for Node 18 ([vercel-labs/skills#1672](https://github.com/vercel-labs/skills/issues/1672)). Node 18 (Ubuntu's apt default, end-of-life since April 2025) crashes at startup with the error above. Any of these fixes work:

- **Upgrade Node** (recommended; Node 18 is EOL anyway): install Node 22 via [nvm](https://github.com/nvm-sh/nvm) or [NodeSource](https://github.com/nodesource/distributions), then re-run the command.
- **Pin the last compatible installer**: `npx skills@1.5.15 add mihneaptu/opencode-fusion --skill fusion-setup -g -a opencode -y`; 1.5.15 is the last release without the `styleText` import, and the skill it installs is identical.
- **Skip npx entirely**: clone this repo and copy `.opencode/skills/fusion-setup/` into `~/.config/opencode/skills/`; the skill itself is plain markdown with no Node dependency.

### The main agent edits files directly

The config was not loaded. Fully quit and restart opencode; it loads config at startup, not mid-session. Then confirm `edit: deny` is set in the installed `~/.config/opencode/agent/build.md` frontmatter.

### The sidekick is not being invoked

Check the build agent's `permission.task` graph in `~/.config/opencode/agent/build.md`: it must deny broadly with `"*": deny` first, then allow `"sidekick": allow` (and the other named specialists). Do not use bare `task: allow`, which exposes every subagent, including the built-in `general`.

### A model returns 404 or 400

The model id may be wrong or changed. Confirm the exact `provider-id/model-id` against your provider, and that the provider block's `baseURL`/`apiKey` are correct. If the key uses `{env:VAR}` substitution, check the variable is actually set in the environment opencode launches from; an unset variable silently becomes an empty string. For progrok's Grok models, the composer coding models are callable but intentionally not listed in `/v1/models`, so a missing entry there does not mean the id is wrong.

### A bash command gets blocked unexpectedly

First check whether the block is actually expected: commands outside the allowlist (searches like `git ls-files`, file writes, `git checkout`) are *meant* to be denied, and the agent recovers by reading or delegating; see [Verify it works](#verify-it-works).

If an *allowlisted* command gets blocked, the usual cause is chaining: the allowlist matches whole commands against fixed patterns, so `&&`, `||`, `;`, `|`, or wrapping in `echo` breaks the match and blocks the line. Run each allowed command as its own separate call.

### A search reports "zero matches" for something that exists

The search tools run ripgrep with standard ignore rules, so delegated searches silently skip anything matched by `.gitignore`. A gitignored path (local fixtures, generated code) produces a confident "no matches" even when the text is right there, and the main agent will relay that as fact. If agents need to search a gitignored directory, add a root `.ignore` file whitelisting it (for example `!fixtures/`): ripgrep reads `.ignore` with higher precedence than `.gitignore`, and git pays no attention to it. Note that `git diff` has the same blind spot: changes to gitignored files never appear in it, so the main agent reviews those by reading the file directly.

</details>

## Slash commands and optional plugins

<details>
<summary>Four optional pieces</summary>

Four optional pieces ship with the skill:

- **`/fusion-setup` command** (`commands/fusion-setup.md`): a discoverable slash command that launches the setup flow. Run `/fusion-setup` for the full interview, or pass an argument like `/fusion-setup reconfigure sidekick` to jump straight to a targeted change. Install it to `~/.config/opencode/commands/`.
- **`/fusion-status` command** (`commands/fusion-status.md`): a health check that verifies the setup is installed, loaded, and enforcing: the live tool schema (denied tools actually absent from the running agent), the config on disk, the installed agent files, and the optional Claude bridge. It only reports; it changes nothing. Install it to `~/.config/opencode/commands/`.
- **`fusion-audit` plugin** (`plugins/fusion-audit.js`): logs the delegation tree (subagent spawns and edit/write/apply_patch/task tool calls) and aggregates per-agent token usage per session through opencode's logger, so you can audit that the main agent delegated instead of editing and see where each session's tokens went: the raw numbers behind "did Fusion actually save money?". It is observational only: opencode's tool hooks do not expose the calling agent, so enforcement stays with the permission layer; the plugin just makes the delegation visible. Install it to `~/.config/opencode/plugins/`.
- **`fusion-claude` plugin** (`plugins/fusion-claude.js`): optional Claude Code Pro/Max plan reviewer. It exposes a sanitized status check and a stateless review tool, invokes only the official `claude` CLI, and leaves the OAuth credential inside Claude Code. Install it with the `claude` extra rather than copying it alone, because the installer also adds the global permission deny. Re-running the installer without the `claude` extra leaves an already-installed bridge in place; remove it with `install.js undo`.

</details>

## Files

<details>
<summary>All files</summary>

Everything Fusion installs lives in one place, the skill bundle at `.opencode/skills/fusion-setup/`:

| File (inside the skill bundle) | Purpose |
|------|---------|
| `SKILL.md` | The conversational setup flow the skill runs |
| `agent/build.md` | Main agent: edit denied, search denied, bash allowlisted, task allowed, exploration + parallelization rules |
| `agent/plan.md` | Plan-mode agent: read-only inspection plus delegation, cannot execute or commit |
| `agent/sidekick.md` | Sidekick prompt (model set in `opencode.json`) |
| `agent/research.md` | Optional research specialist: read-only, web + docs |
| `agent/design.md` | Optional design specialist: frontend/UI, loads design skills |
| `agent/reviewer.md` | Optional reviewer specialist: critiques plans and audits diffs, read-only plus lint/test |
| `agent/vision.md` | Optional vision specialist: transcribes images when the main model has no image input |
| `profiles/` | Bundled subscription profiles: named per-role model presets applied via `install.js apply --profile <name>` |
| `commands/` | Optional `/fusion-setup` (launches setup) and `/fusion-status` (health check) slash commands |
| `plugins/fusion-audit.js` | Optional read-only plugin that logs the delegation tree and per-agent token usage per session for auditing |
| `plugins/fusion-claude.js` | Optional Claude Code Pro/Max bridge for stateless, read-only plan reviews |
| `scripts/install.js` | Deterministic installer the skill drives: backup, merge, atomic write, manifest, undo |

The rest of the repo supports it:

| File | Purpose |
|------|---------|
| `scripts/check-profiles.js` | Live check that profile model ids still exist on models.dev (`npm run check-profiles`) |
| `test/integration/` | Live enforcement tests: real opencode binary against a fake provider (`npm run test:integration`) |
| `opencode.json` | Reference config (gitignored): Opus main, Grok 4.5 sidekick and explore |
| `flow-diagram.png` | Architecture diagram (Main Agent vs Sidekick swimlane) |
| `LICENSE` | MIT license |

</details>

## Built with opencode-fusion

This repo was configured using the Fusion pattern itself. The main agent planned the structure, reviewed every change, and verified against real command output. The sidekick wrote the files and ran the commands. Every change went through the flow above.

## Disclaimer

This project is not affiliated with, endorsed by, or built by the opencode team. [opencode](https://opencode.ai) is a separate project by [Anomaly](https://anoma.ly). This repo provides configuration that works with opencode but is not part of it.

## Credit

Inspired by [Devin Fusion](https://cognition.com/blog/devin-fusion) by [Cognition](https://cognition.com): the "sidekick" framing, the principle that "the main agent should take minimal actions", and the benchmark numbers quoted in this README are theirs, from the launch post and the July 2026 follow-up, ["Making Fable Cheaper Than Opus"](https://cognition.com/blog/making-fable-cheaper-than-opus). The underlying split has older roots. [Aider's architect/editor mode](https://aider.chat/2024/09/26/architect.html) separated code reasoning from code editing back in 2024: one model describes the solution, a second turns it into clean edits. The permission-layer enforcement, the cross-vendor review setup, and the specialist team are this repo's own.
