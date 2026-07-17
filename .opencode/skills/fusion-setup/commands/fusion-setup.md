---
description: Configure or reconfigure the opencode Fusion agent team
agent: build
---

Load and follow the `fusion-setup` skill to configure the Fusion agent team.

$ARGUMENTS

If arguments are empty, run the full interactive setup: offer the bundled subscription profiles first, then ask which model to use for each role (main/build, sidekick, explore, and the optional research/design/reviewer/vision specialists), then write the global config and install the agent prompts as the skill describes. If arguments name a subscription or profile (for example "opencode-go" or "use my GitHub Copilot subscription"), jump straight to the skill's Step 0 confirmation for that profile. If arguments describe a change (for example "reconfigure sidekick" or "change explore model"), treat them as the specific change the user wants and jump to the relevant part of the skill instead of re-running the whole interview.
