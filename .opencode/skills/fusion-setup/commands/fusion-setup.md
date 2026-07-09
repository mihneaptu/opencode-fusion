---
description: Configure or reconfigure the opencode Fusion two-agent workflow
agent: build
---

Load and follow the `fusion-setup` skill to configure the Fusion two-agent workflow.

$ARGUMENTS

If arguments are empty, run the full interactive setup: ask which model to use for each role (main/build, sidekick, explore, and the optional research/design/reviewer/vision specialists), then write the global config and install the agent prompts as the skill describes. If arguments are given (for example "reconfigure sidekick" or "change explore model"), treat them as the specific change the user wants and jump to the relevant part of the skill instead of re-running the whole interview.
