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
