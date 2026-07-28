'use strict';

// Renders CHANGELOG.md into the generated regions of site/changelog.html.
//
// The site is static (GitHub Pages serves site/ verbatim, no build step at
// deploy time), and CHANGELOG.md is not inside site/, so the page cannot fetch
// it at runtime. Instead this script writes the release history into the page
// and the output is committed. test/changelog-site.test.js re-runs the render
// and fails if the committed page has drifted, so the changelog stays the
// single source of truth for what the site shows.
//
//   node scripts/build-changelog.js           # write the page
//   node scripts/build-changelog.js --check   # fail if the page is stale
//
// The markdown subset is deliberately small - exactly what CHANGELOG.md uses.
// Anything outside it throws rather than rendering as literal markup, so a new
// construct is a loud build failure instead of a silent typo on the site.

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(repoRoot, 'CHANGELOG.md');
const PAGE_PATH = path.join(repoRoot, 'site', 'changelog.html');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const toLf = (text) => text.replace(/\r\n/g, '\n');

/* ---- Parsing ---------------------------------------------------------- */

/** A release heading is `## <version>` with an optional `- <ISO date>`. */
function parseReleaseHeading(heading) {
  const match = heading.match(/^\[?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?$/);
  if (!match) {
    throw new Error(
      `unsupported release heading "## ${heading}" - expected "## <version>" or "## <version> - YYYY-MM-DD"`
    );
  }
  const version = match[1];
  const unreleased = /^unreleased$/i.test(version);
  const slug = version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    version,
    date: match[2] ?? null,
    unreleased,
    // Numeric versions get a `v` prefix so the fragment reads as #v1-1-0.
    id: /^\d/.test(version) ? `v${slug}` : slug,
    blocks: [],
  };
}

/** Reject the constructs this renderer does not implement, loudly. */
function rejectUnsupported(line, lineNumber) {
  const unsupported = [
    [/^\s*(```|~~~)/, 'fenced code block'],
    [/^\s{2,}[-*+] /, 'nested list item'],
    [/^\s*\d+\. /, 'ordered list'],
    [/^\s*>/, 'blockquote'],
    [/^\s*!\[/, 'image'],
    [/^\s*\|/, 'table'],
    [/^#{4,} /, 'heading below level 3'],
  ];
  for (const [pattern, what] of unsupported) {
    if (pattern.test(line)) {
      throw new Error(
        `CHANGELOG.md:${lineNumber} uses an unsupported construct (${what}): ${line.trim()}\n` +
        'Extend scripts/build-changelog.js to render it, or reword the entry.'
      );
    }
  }
}

/**
 * Parse CHANGELOG.md into an intro plus one entry per release.
 *
 * Blocks are `{ type: 'paragraph' | 'list' | 'group' }`. A `group` is a `###`
 * subsection (Added / Changed / ...) holding its own blocks, which is how the
 * changelog is actually shaped.
 */
function parseChangelog(source) {
  const lines = toLf(source).split('\n');
  const intro = { blocks: [] };
  const releases = [];

  let release = null;
  let group = null;
  let paragraph = null;
  let items = null;

  const sink = () => (group ? group.blocks : release ? release.blocks : intro.blocks);
  const flushParagraph = () => {
    if (!paragraph) return;
    sink().push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = null;
  };
  const flushList = () => {
    if (!items) return;
    sink().push({ type: 'list', items });
    items = null;
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.replace(/\s+$/, '');

    if (line === '') {
      flushBlocks();
      return;
    }

    rejectUnsupported(line, lineNumber);

    // The document title is the page's own <h1>; the file's copy is dropped.
    if (/^# /.test(line)) {
      flushBlocks();
      return;
    }

    const releaseHeading = line.match(/^## +(.*)$/);
    if (releaseHeading) {
      flushBlocks();
      group = null;
      release = parseReleaseHeading(releaseHeading[1].trim());
      releases.push(release);
      return;
    }

    const groupHeading = line.match(/^### +(.*)$/);
    if (groupHeading) {
      flushBlocks();
      if (!release) {
        throw new Error(`CHANGELOG.md:${lineNumber} has a "###" heading before any release heading`);
      }
      group = { type: 'group', name: groupHeading[1].trim(), blocks: [] };
      release.blocks.push(group);
      return;
    }

    const bullet = line.match(/^- +(.*)$/);
    if (bullet) {
      flushParagraph();
      if (!items) items = [];
      items.push(bullet[1].trim());
      return;
    }

    // An indented line continues the bullet above it (the changelog wraps
    // long entries); anywhere else it is just a wrapped paragraph line.
    const continuation = line.match(/^ {2,}(.*)$/);
    if (continuation && items) {
      items[items.length - 1] += ` ${continuation[1].trim()}`;
      return;
    }

    flushList();
    if (!paragraph) paragraph = [];
    paragraph.push(line.trim());
  });

  flushBlocks();

  if (!releases.length) {
    throw new Error('CHANGELOG.md has no "## <version>" release headings');
  }
  const ids = releases.map((r) => r.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) {
    throw new Error(`two releases in CHANGELOG.md resolve to the same anchor "#${duplicate}"`);
  }

  return { intro, releases };
}

/* ---- Inline rendering -------------------------------------------------- */

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLinkUrl(url) {
  // The source is a repo file, but a scheme check keeps a stray `javascript:`
  // out of the generated page instead of trusting review to catch it.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url)) {
    throw new Error(`unsupported link scheme in CHANGELOG.md: ${url}`);
  }
  return url;
}

/**
 * Curl the quotes so rendered entries match the typography of the
 * hand-written pages, which use ’ and “ ” throughout. A quote opens when it
 * follows whitespace or an opening bracket at the start of a run, and closes
 * otherwise - the standard heuristic, and unambiguous for this content.
 *
 * `openable` is false when the segment follows a code span, so the `'s` in
 * `` `vision.md` ``'s closes rather than opening.
 */
function curlQuotes(text, openable) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char !== '"' && char !== "'") {
      out += char;
      continue;
    }
    const prev = i === 0 ? (openable ? '' : 'x') : text[i - 1];
    const opens = prev === '' || /[\s([{]/.test(prev);
    if (char === '"') out += opens ? '“' : '”';
    else out += opens ? '‘' : '’';
  }
  return out;
}

/** Prose only: inline code is split out before this runs. */
function renderProse(text, openable) {
  // Quotes are curled before escaping so &quot; entities are never rewritten.
  let out = escapeHtml(curlQuotes(text, openable));
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
    const href = renderLinkUrl(url);
    const external = /^https?:/i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return out;
}

function renderInline(text) {
  const parts = text.split(/(`[^`]*`)/);
  let afterCode = false;
  return parts
    .map((part) => {
      const isCode = part.length > 1 && part.startsWith('`') && part.endsWith('`');
      if (isCode) {
        afterCode = true;
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      const prose = renderProse(part, !afterCode);
      if (part !== '') afterCode = false;
      return prose;
    })
    .join('');
}

/* ---- Block rendering --------------------------------------------------- */

const formatDate = (iso, { short = false } = {}) => {
  const [year, month, day] = iso.split('-').map(Number);
  const name = MONTHS[month - 1];
  if (!name) throw new Error(`invalid date in CHANGELOG.md: ${iso}`);
  return `${short ? name.slice(0, 3) : name} ${day}, ${year}`;
};

const indent = (depth) => '  '.repeat(depth);

function renderBlocks(blocks, depth) {
  const out = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      out.push(`${indent(depth)}<p>${renderInline(block.text)}</p>`);
      continue;
    }
    if (block.type === 'list') {
      out.push(`${indent(depth)}<ul class="docs-list release-items">`);
      for (const item of block.items) {
        out.push(`${indent(depth + 1)}<li>${renderInline(item)}</li>`);
      }
      out.push(`${indent(depth)}</ul>`);
      continue;
    }
    // group
    const kind = block.name.toLowerCase().replace(/[^a-z]+/g, '-');
    out.push(`${indent(depth)}<div class="release-group">`);
    out.push(
      `${indent(depth + 1)}<h3 class="release-group-label" data-kind="${escapeHtml(kind)}">` +
      `${renderInline(block.name)}</h3>`
    );
    out.push(...renderBlocks(block.blocks, depth + 1));
    out.push(`${indent(depth)}</div>`);
  }
  return out;
}

function renderReleases(releases, depth) {
  const latest = releases.find((release) => !release.unreleased);
  const out = [];
  releases.forEach((release, index) => {
    if (index > 0) out.push('');
    out.push(`${indent(depth)}<section id="${release.id}" class="docs-section release">`);
    out.push(`${indent(depth + 1)}<div class="release-head">`);
    out.push(
      `${indent(depth + 2)}<h2 class="release-version">${renderInline(release.version)}</h2>`
    );
    if (release.date) {
      out.push(
        `${indent(depth + 2)}<time class="release-date" datetime="${release.date}">` +
        `${formatDate(release.date)}</time>`
      );
    }
    if (release.unreleased) {
      out.push(`${indent(depth + 2)}<span class="pill release-tag">In progress</span>`);
    } else if (release === latest) {
      out.push(`${indent(depth + 2)}<span class="pill pill-main release-tag">Latest</span>`);
    }
    out.push(`${indent(depth + 1)}</div>`);
    out.push(...renderBlocks(release.blocks, depth + 1));
    out.push(`${indent(depth)}</section>`);
  });
  return out;
}

function renderToc(releases, depth) {
  return releases.map((release) => {
    const label = renderInline(release.version);
    // A dateless released version (1.0.0) simply has no date to show; only an
    // "Unreleased" heading is labelled as still in progress.
    const meta = release.date
      ? formatDate(release.date, { short: true })
      : (release.unreleased ? 'in progress' : '');
    const date = meta ? `<span class="docs-toc-date">${meta}</span>` : '';
    return `${indent(depth)}<a href="#${release.id}">${label}${date}</a>`;
  });
}

function renderIntro(intro, depth) {
  const paragraphs = intro.blocks.filter((block) => block.type === 'paragraph');
  return paragraphs.map((block, index) => {
    const cls = index === 0 ? 'docs-lead' : 'docs-note docs-hero-note';
    return `${indent(depth)}<p class="${cls}">${renderInline(block.text)}</p>`;
  });
}

/* ---- Page assembly ----------------------------------------------------- */

const REGIONS = ['intro', 'toc', 'releases'];

/** Replace the body of one `<!-- generated:<name>:start/end -->` region. */
function replaceRegion(page, name, lines) {
  const start = `<!-- generated:${name}:start -->`;
  const end = `<!-- generated:${name}:end -->`;
  const pattern = new RegExp(
    `([ \\t]*)${start}\\n[\\s\\S]*?[ \\t]*${end}`
  );
  if (!pattern.test(page)) {
    throw new Error(`site/changelog.html is missing the "${name}" generated region (${start} ... ${end})`);
  }
  return page.replace(pattern, (whole, lead) => {
    const body = lines.length ? `${lines.join('\n')}\n` : '';
    return `${lead}${start}\n${body}${lead}${end}`;
  });
}

/** Render the changelog into the page shell. Both arguments are LF text. */
function renderPage(pageShell, changelogSource) {
  const { intro, releases } = parseChangelog(changelogSource);
  // Indent depths match the hand-written markup around each region.
  let page = replaceRegion(pageShell, 'intro', renderIntro(intro, 5));
  page = replaceRegion(page, 'toc', renderToc(releases, 5));
  page = replaceRegion(page, 'releases', renderReleases(releases, 4));
  return page;
}

/** Render the committed page from the committed changelog. */
function build() {
  const pageOnDisk = fs.readFileSync(PAGE_PATH, 'utf8');
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const expected = renderPage(toLf(pageOnDisk), toLf(changelog));
  return { pageOnDisk, expected, upToDate: toLf(pageOnDisk) === expected };
}

function main(argv) {
  const check = argv.includes('--check');
  const { pageOnDisk, expected, upToDate } = build();

  if (upToDate) {
    process.stdout.write(
      check
        ? 'site/changelog.html is up to date with CHANGELOG.md\n'
        : 'site/changelog.html already matches CHANGELOG.md - nothing to write\n'
    );
    return 0;
  }

  if (check) {
    process.stderr.write(
      'site/changelog.html is out of date with CHANGELOG.md.\n' +
      'Run: npm run build:changelog\n'
    );
    return 1;
  }

  // Keep the file's existing line endings so a Windows checkout does not
  // churn every line of the hand-written shell on every build.
  const eol = pageOnDisk.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(PAGE_PATH, expected.replace(/\n/g, eol));
  process.stdout.write('wrote site/changelog.html from CHANGELOG.md\n');
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  CHANGELOG_PATH,
  PAGE_PATH,
  REGIONS,
  build,
  parseChangelog,
  renderInline,
  renderPage,
  toLf,
};
