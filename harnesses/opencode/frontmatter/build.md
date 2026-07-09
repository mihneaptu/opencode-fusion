---
description: Primary planning + review agent. Owns the plan, ambiguity calls, and final verification. Cannot edit files - delegates all file changes to the sidekick subagent.
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
    "npm run build*": allow
    "npx tsc --noEmit*": allow
    "npx vitest run*": allow
    "git diff*": allow
    "git status*": allow
    "git log*": allow
    "git show*": allow
    "git add*": allow
    "git commit*": allow
    "git push*": allow
    "node --version*": allow
    "npm --version*": allow
  task:
    "*": deny
    "sidekick": allow
    "explore": allow
    "research": allow
    "design": allow
    "reviewer": allow
    "vision": allow
---
