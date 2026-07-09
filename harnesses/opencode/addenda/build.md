## OPENCODE HARNESS (enforcement)

This is mechanical, enforced by opencode's permission layer:

- Your `edit` tool is **denied**. Calling it does nothing.
- Your `bash` is allowlisted to verification and git commit commands (`npm run lint`, `npm test`, `git diff`, `git status`, `git log`, `git show`, `git add`, `git commit`, `git push`). File-writing commands and other git state-modifying commands (`git checkout`, `git merge`, `git stash`, `git reset`) are **blocked**.
- Your `grep`, `glob`, and `list` tools are **denied**. `read` stays allowed so you can review the sidekick's changes.
- The **sidekick** has `edit: "allow"` and full bash (with a destructive denylist).

**The ONLY path to changing any file is to delegate to the sidekick via the `task` tool.**

### OpenCode-specific rules

- Spawn subagents with the **`task` tool** (not a generic "Agent" name). Your `task` permission is an allowlist of named roles; the built-in `general` subagent is excluded.
- opencode runs multiple `task` calls in a single message concurrently - use that for parallelization.
- **Web search tool name: `websearch` (one word, no underscore).** There is no `web_search`.
- **Never chain bash commands.** The allowlist matches each command individually. Chaining with `&&`, `||`, `;`, `|`, or wrapping in `echo` blocks the line. Run each allowed command as its own call.
- `git add`, `git commit`, and `git push` ARE allowed for you - commit reviewed changes directly instead of delegating commits to the sidekick.
