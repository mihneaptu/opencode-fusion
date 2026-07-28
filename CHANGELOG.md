# Changelog

Notable changes to this project. The version is the skill bundle's version; it
is recorded as `bundleVersion` in `.fusion-install.json` when you install, so an
installed copy can be traced back to the release that applied it.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.1.0 - 2026-07-28

### Added

- The docs site has a changelog page. `site/changelog.html` is generated from
  this file by `scripts/build-changelog.js` (`npm run build:changelog`) and
  committed, because GitHub Pages serves `site/` verbatim and this file lives
  outside `site/`, so the page cannot fetch it at runtime. `npm test` re-renders
  and fails when the committed page has drifted, so this file stays the single
  source of truth. The renderer supports only the markdown used here and fails
  loudly on anything else, rather than printing literal markup on the site.
- The skill bundle now has a version. `install.js` records `bundleVersion` in
  `.fusion-install.json` and prints it in the apply plan, and `/fusion-status`
  reports it, so an installed copy can be traced back to the release that
  applied it. Like `installedAt`, it records the most recent apply: a reapply
  that selects a subset of roles leaves the other managed files as an earlier
  bundle installed them.
- Repository, homepage, issue-tracker, and keyword metadata in `package.json`.
- The bash allowlist's JS assumption is now documented. The shipped
  verification commands (`npm test`, `npm run lint`, `npm run build`,
  `npx tsc --noEmit`, `npx vitest run`) only exist in a Node toolchain, so on
  any other stack the main agent could not verify its own work and got denied on
  the command it should have been running. README now names the verification
  tools per stack (Python, Rust, Go, Make), advises an exact pattern over a
  trailing `*` because `*` matches the whole rest of the command and a broad
  `"ruff check*"` also permits the file-rewriting `--fix` and `--add-noqa`,
  spells out that a narrowing deny must follow the allow it narrows because
  matching is last-match-wins, and records which of the five entries each role
  actually ships - `plan.md` has no `npm run build*`, and `reviewer.md` has
  neither that nor `npx tsc --noEmit*`, while `build.md` also allows the
  read-only `npm --version*`. It also says why the shipped JS entries keep a
  trailing `*` despite that advice: `npm test` and `npm run lint` take
  project-specific arguments, so pinning them exactly would deny the run the
  user wants. Step 5 of the setup skill tells the installer to raise it, and
  both note that the prompts are global rather than per project,
  so a multi-stack user should add entries alongside the JS ones instead of
  replacing them. The git half of the allowlist is unchanged and needs no
  substitution. No entries were added to the bundled prompts: a shipped entry
  for a command the user's project does not define cannot verify that project,
  and only broadens a security-sensitive list.
- An advisory CI lane runs the live enforcement tests against the opencode 2.0
  beta. `FUSION_OPENCODE_BIN` selects which binary the integration harness
  spawns and defaults to `opencode`, so the existing v1 lanes spawn the same
  executable, arguments, and working directory they did before. Only the v2
  branch adapts: its `run` has no directory flag, so the project directory is
  passed as the child process working directory, `--auto` is required because v2
  otherwise rejects every permission request, and `--standalone` because v2
  otherwise reuses a shared background service that cannot start under the
  harness's throwaway HOME. Explicit `deny` rules stay enforced, which is what
  the tests assert.
- The enforcement suite now resolves the two tools v2 renamed (`bash` ->
  `shell`, `task` -> `subagent`, whose delegation argument moved from
  `subagent_type` to `agent`) so one set of assertions covers both binaries.
  Every other tool it names - `read`, `edit`, `write`, `grep`, `glob` - kept its
  v1 name under v2.
- The suite refuses to pass vacuously. Each "denied tool is absent" assertion
  now also requires that an unrestricted agent is offered that tool, so an
  absence caused by a release dropping the tool is reported as inconclusive
  instead of green. This immediately caught `apply_patch` and `list`, which no
  tested release offers to anyone; they are now asserted defensively rather than
  counted as evidence of enforcement.

### Changed

- Agent routing in `build.md` now gives each role a positive and a negative
  case (`Delegate when` / `Don't delegate when`) plus a rule of thumb, instead
  of one line per role. `sidekick`, `design`, `research`, and `reviewer`
  escalate when handed work that belongs to another role rather than returning
  partial work. `research.md` and `reviewer.md` gained a
  STATUS / FINDINGS / VERIFIED / GAPS report format, modeled on the
  STATUS / CHANGES / VERIFIED / GAPS block `sidekick.md` already used, and
  `plan.md` gained a plan format adapted from the five-part delegation spec.
  Prompt wording only - the mechanical guarantees still come from permission
  frontmatter.
- `plan.md` now carries the bash-allowlist guidance `build.md` already had: do
  not chain commands, and prefer the tool `workdir` parameter over `cd` or
  flag-first forms. Plan hit both limits in live use and recovered by retrying,
  which cost a round trip each time.
- Corrected what chaining actually does, in `build.md`, `plan.md`,
  `reviewer.md`, README, and `site/docs.html`. All of them said a chained line
  matches no pattern and is blocked outright. Probed against opencode 1.18.7
  through the integration harness, the permission layer matches each command in
  the line separately and denies the call only if one of them fails:
  `git status --short && git log -1` runs when both are allowlisted, while
  `git status --short | findstr README` is denied because the pipe consumer
  counts as its own command. The advice to run one command per call is
  unchanged - a denial then names the command responsible - but the stated
  reason was wrong. A contract test now pins the disproven wording out of all
  five surfaces, so the correction cannot rot back in one file at a time.
- `plan.md` and `reviewer.md` now state that a denied command is a boundary
  rather than a puzzle: find an allowed command that answers the same question,
  or report which one you would need, instead of hunting for a variant that
  slips through. Only `build.md` said this before, and in live use a reviewer
  refused `npm run test:integration` went looking for a way around it.
- The harness config now sets `subagent_depth: 2`, matching what the installer
  forces on every real install. Without it the suite exercised a nesting limit
  no Fusion user runs under, so a delegation regression could have passed.
- The Limitations section now states what opencode 2.0 does and does not carry
  over. v2 translates v1-shaped configuration in memory, so the config and agent
  prompts are expected to load under `opencode2` unconverted; V1 plugins do not
  run there, three top-level keys have no native equivalent, and subagents do
  not inherit a parent agent's permissions.
- `vision.md`'s clipboard instructions no longer assume Windows. The
  save-to-file hint now covers macOS and Linux alongside Win+Shift+S, and tells
  the agent to ask for a path rather than guess the user's desktop environment.
- The bundled profiles ship refreshed model picks. `opencode-go` leads with
  Kimi K3 and reviews with Grok 4.5; `opencode-zen` sidekicks with GPT-5.6 Luna;
  `github-copilot` moves its sidekick and explore roles from GPT-5.4 Mini to
  GPT-5.6 Luna; `chatgpt` gains a GPT-5.6 Terra reviewer. Only new installs and
  reapplies pick these up - an existing `opencode.json` keeps the models it was
  installed with until you reconfigure.
- The mobile nav now collapses below 940px instead of 900px. The new Changelog
  link makes the widest desktop nav row need about 930px, and between the old
  breakpoint and that width the right-hand header pill ran past the rail and
  gave every page a horizontal scroll. A test pins the breakpoint against the
  measured width.

### Fixed

- The theme toggle's moon rendered as a lopsided blob rather than a crescent.
  Its inner arc asked for radius 7 across endpoints 16.3 apart; per the SVG
  spec a radius too small to span its endpoints is scaled up until it fits, so
  the terminator became a semicircle mirroring the outer edge and the shape
  lost its taper. It also overflowed the top and right of its 24x24 viewBox.
  Replaced with a crescent whose arcs are geometrically consistent, on all
  three pages.

### Compatibility

- Manifests written before 1.1.0 have no `bundleVersion`. They are still valid
  manifest schema 2, and `undo` continues to accept them.

## 1.0.0

Initial release: the mechanically enforced main/sidekick split, the
deterministic installer with reversible undo, five subscription profiles, the
optional `/fusion-setup` and `/fusion-status` commands, the `fusion-audit` and
`fusion-claude` plugins, and multi-OS CI with live enforcement tests.
