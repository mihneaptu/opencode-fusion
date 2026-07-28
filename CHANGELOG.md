# Changelog

Notable changes to this project. The version is the skill bundle's version; it
is recorded as `bundleVersion` in `.fusion-install.json` when you install, so an
installed copy can be traced back to the release that applied it.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.1.0 - 2026-07-27

### Added

- The skill bundle now has a version. `install.js` records `bundleVersion` in
  `.fusion-install.json` and prints it in the apply plan, and `/fusion-status`
  reports it, so an installed copy can be traced back to the release that
  applied it. Like `installedAt`, it records the most recent apply: a reapply
  that selects a subset of roles leaves the other managed files as an earlier
  bundle installed them.
- Repository, homepage, issue-tracker, and keyword metadata in `package.json`.

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
- The Limitations section now states what opencode 2.0 does and does not carry
  over. v2 translates v1-shaped configuration in memory, so the config and agent
  prompts are expected to load under `opencode2` unconverted; V1 plugins do not
  run there, three top-level keys have no native equivalent, and subagents do
  not inherit a parent agent's permissions.

### Compatibility

- Manifests written before 1.1.0 have no `bundleVersion`. They are still valid
  manifest schema 2, and `undo` continues to accept them.

## 1.0.0

Initial release: the mechanically enforced main/sidekick split, the
deterministic installer with reversible undo, five subscription profiles, the
optional `/fusion-setup` and `/fusion-status` commands, the `fusion-audit` and
`fusion-claude` plugins, and multi-OS CI with live enforcement tests.
