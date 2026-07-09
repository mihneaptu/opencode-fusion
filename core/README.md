# Core role prompts

Portable Sidekick Fusion role instructions. **No harness-specific tool names or permission YAML here.**

| File | Role |
|------|------|
| `roles/build.md` | Main orchestrator: plan, delegate, review |
| `roles/plan.md` | Plan mode: investigate and plan, do not execute |
| `roles/sidekick.md` | Executor: precise specs only |
| `roles/research.md` | Read-only external + codebase research |
| `roles/design.md` | Frontend/UI implementation |
| `roles/reviewer.md` | Diff audit before commit |
| `roles/vision.md` | Image transcription when main model lacks vision |
| `roles/explore.md` | Read-only codebase exploration |

## How harnesses use this

Each harness under `harnesses/<name>/` adds:

1. **Frontmatter** — permissions, tools, models in that product’s format  
2. **Addendum** — how enforcement works in that harness (tool names, spawn API)

Run from repo root:

```bash
node scripts/assemble-agents.mjs
```

That writes:

- `agent/*.md` — OpenCode install surface (backward compatible)
- `.opencode/skills/fusion-setup/agent/*.md` — skill bundle copy
- `harnesses/claude-code/agents/*.md` — Claude Code install surface

**Edit `core/roles/` for behavior. Edit harness frontmatter/addenda for wiring. Then re-run assemble.**
