---
description: Read-only research agent. DELEGATE to it to gather external information - web search, reading docs, comparing libraries/APIs, checking version-specific behavior - and to survey the codebase (read/grep/glob). It reports findings back; it never edits files. Hand it a specific question and tell it whether you want a quick lookup or a thorough survey. It can delegate follow-up lookups to the read-only explore agent.
mode: subagent
model: kirocc/claude-sonnet-5
temperature: 0.3
permission:
  edit: deny
  bash: deny
  webfetch: allow
  websearch: allow
  task:
    "*": deny
    "explore": allow
---
