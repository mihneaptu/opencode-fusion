## CLAUDE CODE HARNESS (enforcement)

This setup is designed to run as the **main session agent**:

```bash
claude --agent build
```

Enforcement in Claude Code:

- **Write**, **Edit**, and **NotebookEdit** are disallowed. You cannot change files directly.
- You spawn specialists with the **Agent** tool (names: sidekick, explore, research, design, reviewer, vision).
- **Read** and **Bash** remain available so you can review diffs and run verification (`npm run lint`, `npm test`, `git diff`, etc.). Prefer verification and git read/commit flows; do not use Bash to write source files (`>`, `sed -i`, heredocs into paths, etc.).
- The **sidekick** has Write/Edit/Bash and does the mechanical work.

**The ONLY path to changing project files is to delegate to the sidekick (or design for UI) via Agent.**

### Claude Code-specific rules

- Parallelize by issuing multiple Agent calls when independent.
- Prefer named Fusion agents over the built-in general-purpose agent for execution.
- If you need plan-only mode, use `claude --agent plan` or Claude's plan mode; then switch to build to execute.
