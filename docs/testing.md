# Testing opencode-fusion

## Automated checks

Run these from the repository root:

```powershell
npm test
npm run check-install
npm run check-profiles
```

`npm test` is the main validation suite. `check-install` compares the skill
bundle's prompts with installed copies under `~/.config/opencode/agent/`.
`check-profiles` verifies the model IDs in shipped profiles.

To validate the lint fixture, run `npm run lint` with `test-playground/` as the
working directory. Build and plan agents should use the tool's working-directory
parameter because `npm --prefix test-playground run lint` may not match their
command allowlist.

### opencode 2.0 canary

`FUSION_OPENCODE_BIN` selects which executable the integration harness spawns;
it defaults to `opencode`. To run the live suite against the v2 beta locally,
install it with `npm install -g @opencode-ai/cli@next`, then set the variable to
`opencode2` before `npm run test:integration`:

```powershell
$env:FUSION_OPENCODE_BIN = 'opencode2'
npm run test:integration
```

Leaving the variable unset changes nothing about the v1 runs: same binary, same
arguments, same working directory. The v2 branch is the only one that passes the
project directory as the child's `cwd`, because v2's `run` dropped `--dir`.

The CI job for this is advisory only, because the v2 beta and the way it
translates v1-shaped config are still changing. It installs `@opencode-ai/cli@next`,
a floating dist-tag, so the exact prerelease under test moves without a commit
here - the job prints `opencode2 --version` so each run records what it actually
exercised. The workflow grants `contents: read` and nothing more.

## Manual verification

### Skill installation

Install the published skill:

```powershell
npx skills add mihneaptu/opencode-fusion --skill fusion-setup -g -a opencode -y
```

Fully restart opencode and confirm that `fusion-setup` appears in the skill
list.

### Configuration flow

In a fresh session, ask opencode to `set up fusion`. Confirm that it asks for
the per-role models, updates `~/.config/opencode/opencode.json`, installs the
selected prompts, and shows the selected Build model after a full restart.

### Delegation flow

Seed a lint error in `test-playground/src/index.js`, then ask the Build agent to
fix it. Confirm that Build delegates the edit, reviews the result, and runs the
fixture lint itself. The fixture is gitignored, so review its changed files
directly rather than relying on `git diff`.

### Runtime audit

When surface output is not enough to establish which agent acted, inspect the
session database reported by `opencode db path` (typically
`~/.local/share/opencode/opencode.db`). Its session, message, and part records
provide the delegation tree and exact tool calls. Use this for targeted runtime
audits, not as a routine requirement for every change.
