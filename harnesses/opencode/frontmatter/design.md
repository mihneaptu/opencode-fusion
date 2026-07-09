---
description: Frontend/UI implementation agent. DELEGATE to it to build or restyle interfaces - components, layouts, CSS/Tailwind, design-system work. It loads the environment's design skills before writing, can run a dev server or build, and edits files directly. Give it the design intent and constraints; big product/UX decisions stay with the main agent. It can delegate mechanical work to the sidekick.
mode: subagent
model: kirocc/claude-sonnet-5
temperature: 0.4
permission:
  edit: allow
  bash: allow
  task:
    "*": deny
    "sidekick": allow
    "explore": allow
    "research": allow
---
