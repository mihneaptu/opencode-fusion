# Releasing

How a change gets from a pull request to a published release.

## What users actually install

```
npx skills add mihneaptu/opencode-fusion --skill fusion-setup -g -a opencode -y
```

That command carries no ref, so it resolves the default branch. **`main` is the
release channel**; a tag records what shipped and does not gate distribution.
Keep `main` installable at every commit rather than treating unreleased work as
hidden.

To install an exact version, append a ref. Both forms resolve the tag:

```
npx skills add mihneaptu/opencode-fusion#v1.1.0 --skill fusion-setup -g -a opencode -y
npx skills add https://github.com/mihneaptu/opencode-fusion/tree/v1.1.0 --skill fusion-setup -g -a opencode -y
```

## Per-pull-request duty

A change a user can notice gets a bullet under `## Unreleased` in the same pull
request that makes it, then:

```
npm run build:changelog
npm test
```

Commit the regenerated `site/changelog.html` alongside `CHANGELOG.md`. GitHub
Pages serves `site/` verbatim with no build step, so the page cannot render the
changelog at runtime; `npm test` fails when the committed page has drifted.

Skip the changelog for internal refactors, test-only changes, and cosmetic CSS.

Writing the bullet when the change is fresh is the whole point. Release 1.1.0
had to reorganize headings after the fact because entries had accumulated
unsorted.

## Choosing the number

The version describes the skill bundle, so judge it by what happens to an
installed copy.

| Bump | When |
| --- | --- |
| Major | A manifest written by an older bundle can no longer be read or undone, or an installed role disappears |
| Minor | New capability, or changed behavior an existing install keeps working through |
| Patch | Fixes that change nothing a user can do |

The manifest promise is the one that matters: `.fusion-install.json` written by
any earlier version must stay readable and undoable, or the release is major.

## Cutting the release

One pull request, then two commands.

1. Bump the version in **both** places, in the same commit:
   - `version` in `package.json`
   - `BUNDLE_VERSION` in `.opencode/skills/fusion-setup/scripts/install.js`

   A contract test fails when they diverge, so a half-done bump cannot merge.

2. Rename `## Unreleased` to `## X.Y.Z - YYYY-MM-DD`, using the date you expect
   to publish rather than when the first entry landed.

3. Regenerate and verify:

   ```
   npm run build:changelog
   npm test
   npm run check-profiles
   ```

4. Open the pull request, wait for CI, and merge it.

5. Tag the merge commit and publish:

   ```
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m "opencode-fusion X.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --latest --notes-file <file>
   ```

   Tag the merge commit, not an earlier one, so the tag contains the changelog
   entry that describes it.

Because the release also touches `site/`, merging triggers a Pages deploy. Check
the published changelog page afterwards.

## Known rough edge

`BUNDLE_VERSION` is a literal that moves only at release, so an install from
`main` between releases records the previous version in `.fusion-install.json`.
Traceability is approximate mid-cycle. Switching to an `X.Y.Z-dev` bump right
after each release would fix that, at the cost of `main` always advertising a
version that has no release.
