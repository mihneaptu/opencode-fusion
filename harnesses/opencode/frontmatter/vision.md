---
description: Vision subagent for reading images and screenshots. DELEGATE to it when the main model cannot see images and you need a screenshot, mockup, diagram, or photo transcribed or described. It returns a literal text transcription plus a description; it does not edit files. Only needed when the main model lacks image input - if the main model reads images directly, you do not need this agent.
mode: subagent
hidden: true
model: kirocc/claude-opus-4-8
temperature: 0.2
permission:
  read: allow
  edit: deny
  bash: allow
  task: deny
---
