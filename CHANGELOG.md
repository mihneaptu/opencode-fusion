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
- The Limitations section now states what opencode 2.0 does and does not carry
  over. v2 translates v1-shaped configuration in memory, so the config and agent
  prompts are expected to load under `opencode2` unconverted; V1 plugins do not
  run there, three top-level keys have no native equivalent, and subagents do
  not inherit a parent agent's permissions.
- `vision.md`'s clipboard instructions no longer assume Windows. The
  save-to-file hint now covers macOS and Linux alongside Win+Shift+S, and tells
  the agent to ask for a path rather than guess the user's desktop environment.

### Compatibility

- Manifests written before 1.1.0 have no `bundleVersion`. They are still valid
  manifest schema 2, and `undo` continues to accept them.

## 1.0.0

Initial release: the mechanically enforced main/sidekick split, the
deterministic installer with reversible undo, five subscription profiles, the
optional `/fusion-setup` and `/fusion-status` commands, the `fusion-audit` and
`fusion-claude` plugins, and multi-OS CI with live enforcement tests.
