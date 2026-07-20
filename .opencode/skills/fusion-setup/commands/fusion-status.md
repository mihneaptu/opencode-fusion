---
description: Health-check the Fusion setup - installed, loaded, and enforcing
agent: build
---

Run a Fusion health check and report the results. Check four layers, report each enabled layer as PASS or FAIL with one line of evidence, and do NOT fix anything - this command only reports.

1. **Live enforcement (this running session).** Inspect your own available tools - do not call anything, just check what exists in your toolset. Fusion denies `edit`, `grep`, `glob`, and `list` for this agent, and opencode removes denied tools from the tool schema entirely. If any of those four tools is available to you right now, the Fusion config is NOT loaded in this session - report FAIL and that a full restart of opencode is the fix. If all four are absent and `task` is available, report PASS.

2. **Config on disk.** Read `~/.config/opencode/opencode.json` (Windows: `%USERPROFILE%\.config\opencode\opencode.json`). FAIL if the file is missing or not valid JSON. Otherwise list each `agent.<role>.model` assignment found, and FAIL if `build` or `sidekick` has no model (`explore` should normally have one too; research/design/reviewer/vision are optional).

3. **Agent files.** For every role that has a model in the config - plus `plan`, minus `explore` (explore is built-in and needs no file) - read `~/.config/opencode/agent/<role>.md` and confirm the file exists. In `build.md`, confirm the frontmatter contains `edit: deny`. A missing file or a missing denial is FAIL, with the exact path.

4. **Optional Claude Code bridge.** Treat this layer as disabled and report SKIP only when both `~/.config/opencode/plugins/fusion-claude.js` and the top-level `permission.fusion_claude_*` rule are absent. Otherwise confirm the plugin file exists, the top-level rule is `deny`, both `build.md` and `plan.md` allow `fusion_claude_status` and `fusion_claude_review`, and both tools are present in this build agent's live toolset. If those checks pass, call `fusion_claude_status` and report its sanitized result. Never run `claude auth status` directly because its output may contain account identity data.

Diagnosis rules: layer 1 FAIL with layers 2-3 PASS means the config changed after startup - a restart fixes it. A role with a model in config but no agent file (except explore) runs without its Fusion permissions and prompt - point to the fusion-setup skill to install it.

End with a one-line verdict: `Fusion: healthy` or `Fusion: <n> issue(s)` followed by the specific fix for each issue.
