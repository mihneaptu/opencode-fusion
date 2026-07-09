---
description: Cheap, fast coding executor for well-specified, low-judgment work. DELEGATE to it for mechanical refactors, multi-file find-and-replace, removing deprecated integrations, formatting/lint fixes, and running slow test/e2e/build suites. DO NOT delegate to it for hard features with subtle intent, cross-cutting design, architecture decisions, interpreting ambiguous requirements, or anything where the judgment is the deliverable. Hand it a precise spec; it returns a concise result plus verification, and escalates back when judgment is required.
mode: subagent
model: progrok/grok-4.5
temperature: 0.2
permission:
  edit: allow
  bash:
    "*": allow
    "git push --force*": deny
    "git push -f*": deny
    "git reset --hard*": ask
    "git clean -f*": ask
    "rm -rf *": ask
    "cat *.env*": deny
    "Get-Content *.env*": deny
  task:
    "*": deny
    "explore": allow
    "research": allow
---
