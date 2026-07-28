'use strict';

// site/changelog.html is generated from CHANGELOG.md and committed, because
// GitHub Pages serves site/ verbatim and the changelog lives outside it. That
// makes the committed page a second copy of the release history, so these tests
// (a) fail when it drifts from the changelog and (b) pin the renderer's
// escaping and structure, which are the parts a hand edit would silently break.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CHANGELOG_PATH,
  PAGE_PATH,
  REGIONS,
  build,
  parseChangelog,
  renderInline,
  renderPage,
  toLf,
} = require('../scripts/build-changelog.js');

const changelog = toLf(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
const page = toLf(fs.readFileSync(PAGE_PATH, 'utf8'));

describe('changelog site page', () => {
  test('is up to date with CHANGELOG.md', () => {
    const { upToDate } = build();
    assert.ok(
      upToDate,
      'site/changelog.html is stale: CHANGELOG.md changed without a rebuild. Run `npm run build:changelog` and commit the result.'
    );
  });

  test('keeps every generated region marker so a rebuild still has a target', () => {
    for (const region of REGIONS) {
      assert.ok(
        page.includes(`<!-- generated:${region}:start -->`) &&
        page.includes(`<!-- generated:${region}:end -->`),
        `contract violated: site/changelog.html must keep the "${region}" generated region markers`
      );
    }
  });

  test('renders one section per release, with a linked TOC entry each', () => {
    const { releases } = parseChangelog(changelog);
    assert.ok(releases.length >= 1, 'CHANGELOG.md must parse to at least one release');

    for (const release of releases) {
      assert.ok(
        page.includes(`<section id="${release.id}" class="docs-section release">`),
        `site/changelog.html is missing a section for release ${release.version}`
      );
      assert.ok(
        page.includes(`<a href="#${release.id}">`),
        `site/changelog.html is missing a TOC link for release ${release.version}`
      );
    }

    const sectionCount = (page.match(/class="docs-section release"/g) ?? []).length;
    assert.equal(
      sectionCount,
      releases.length,
      'site/changelog.html has a release section that CHANGELOG.md does not describe'
    );
  });

  test('marks the newest dated release as Latest, exactly once', () => {
    const tags = page.match(/class="pill pill-main release-tag"/g) ?? [];
    assert.equal(tags.length, 1, 'exactly one release may carry the Latest tag');
  });

  // The renderer, not a template engine, produces this markup, so escaping is
  // its own responsibility and worth pinning directly.
  test('escapes HTML-significant characters from changelog prose', () => {
    assert.equal(
      renderInline('a `<b>` & "c" -> d'),
      'a <code>&lt;b&gt;</code> &amp; “c” -&gt; d'
    );
  });

  test('renders inline code, links, and emphasis', () => {
    assert.equal(renderInline('run `npm test`'), 'run <code>npm test</code>');
    assert.equal(
      renderInline('see [semver](https://semver.org/)'),
      'see <a href="https://semver.org/" target="_blank" rel="noopener noreferrer">semver</a>'
    );
    assert.equal(renderInline('**bold** and *thin*'), '<strong>bold</strong> and <em>thin</em>');
  });

  test('leaves relative links local instead of opening a new tab', () => {
    assert.equal(renderInline('[docs](docs.html)'), '<a href="docs.html">docs</a>');
  });

  test('rejects a non-http link scheme rather than emitting it', () => {
    assert.throws(
      () => renderInline('[x](javascript:alert(1))'),
      /unsupported link scheme/
    );
  });

  test('joins a wrapped bullet into one entry instead of splitting it', () => {
    const { releases } = parseChangelog([
      '# Changelog',
      '',
      '## 9.9.9 - 2026-01-02',
      '',
      '### Added',
      '',
      '- One entry that wraps',
      '  across two source lines.',
      '',
    ].join('\n'));

    const group = releases[0].blocks[0];
    assert.equal(group.type, 'group');
    assert.deepEqual(group.blocks[0].items, ['One entry that wraps across two source lines.']);
  });

  test('fails loudly on a markdown construct the renderer cannot handle', () => {
    const source = [
      '# Changelog',
      '',
      '## 9.9.9 - 2026-01-02',
      '',
      '```js',
      'code()',
      '```',
      '',
    ].join('\n');
    assert.throws(() => parseChangelog(source), /unsupported construct \(fenced code block\)/);
  });

  test('refuses to render when a generated region has been removed', () => {
    const stripped = page.replace('<!-- generated:toc:start -->', '');
    assert.throws(() => renderPage(stripped, changelog), /missing the "toc" generated region/);
  });

  // Regeneration must be idempotent, or every build would produce a diff and
  // the drift test above would flap.
  test('re-rendering its own output changes nothing', () => {
    assert.equal(renderPage(page, changelog), page);
  });
});

describe('changelog site page shell', () => {
  const sitePages = ['index.html', 'docs.html', 'changelog.html'];
  const siteDir = path.dirname(PAGE_PATH);

  test('every site page links to the changelog', () => {
    for (const name of sitePages) {
      const html = fs.readFileSync(path.join(siteDir, name), 'utf8');
      assert.ok(
        html.includes('changelog.html'),
        `site/${name} must link to changelog.html so the page is reachable`
      );
    }
  });

  test('loads the shared stylesheet and script, like the other pages', () => {
    assert.ok(page.includes('href="styles.css"'), 'changelog.html must use the shared stylesheet');
    assert.ok(page.includes('src="script.js"'), 'changelog.html must load the shared script');
  });

  // The theme is applied by an inline pre-paint script on every page; without
  // it this page alone would flash light before the stylesheet caught up.
  test('applies the theme before paint', () => {
    assert.ok(
      page.includes("localStorage.getItem('theme')"),
      'changelog.html must keep the pre-paint theme script'
    );
  });

  // Adding the Changelog item made the desktop nav row wider than the 900px
  // breakpoint it used to collapse at, which pushed the right header pill past
  // the rail and gave every page a sideways scroll between 900 and 939px.
  // Measured in a browser at the time: two pills plus the 5-item row need
  // ~930px. Nothing else in CSS ties the two together, so this pins it.
  test('the mobile nav collapses above the width the desktop nav row needs', () => {
    const css = fs.readFileSync(path.join(siteDir, 'styles.css'), 'utf8');
    const match = css.match(/@media \(max-width: (\d+)px\) \{\s*\.nav-toggle/);
    assert.ok(match, 'styles.css must keep a max-width media query that shows .nav-toggle');
    assert.ok(
      Number(match[1]) >= 939,
      `contract violated: the mobile-nav breakpoint is ${match[1]}px, but the widest desktop nav row needs ~930px. Below that the header pill overflows the viewport. Re-measure in a browser before lowering it.`
    );
  });
});
