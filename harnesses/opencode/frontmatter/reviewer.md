---
description: Code-review agent. DELEGATE to it to audit a diff before commit - correctness, scope creep, security, and whether the change matches the plan. It can read the codebase and run git diff plus lint/test to confirm the change actually passes, but it never edits files. Hand it the intended change and what to check; it reports issues found. It reports issues back to the main agent, which owns any re-delegation of fixes.
mode: subagent
model: kirocc/claude-opus-4-8
temperature: 0.2
permission:
  edit: deny
  bash:
    "*": deny
    "git diff*": allow
    "git status*": allow
    "git log*": allow
    "git show*": allow
    "npm run lint*": allow
    "npm test*": allow
    "npx vitest run*": allow
  task:
    "*": deny
    "explore": allow
---
