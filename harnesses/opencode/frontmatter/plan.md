---
description: Plan-mode orchestrator for the Fusion team. Same planning brain as the build agent, but it does not execute - it investigates read-only (reading files directly or delegating larger searches to subagents) and produces a reviewed plan, then hands off to build to carry it out. Cannot edit files or run state-changing commands.
mode: primary
permission:
  edit: deny
  grep: deny
  glob: deny
  list: deny
  bash:
    "*": deny
    "npm run lint*": allow
    "npm test*": allow
    "git diff*": allow
    "git status*": allow
    "git branch*": allow
    "git log*": allow
    "git show*": allow
  task:
    "*": deny
    "explore": allow
    "research": allow
---
