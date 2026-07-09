---
name: build
description: Sidekick Fusion main agent. Plans, decides ambiguity, and reviews. Cannot edit files - delegates all file changes to the sidekick. Use as the session agent via claude --agent build.
tools: Agent(sidekick, explore, research, design, reviewer, vision), Read, Bash
disallowedTools: Write, Edit, NotebookEdit
model: opus
---
