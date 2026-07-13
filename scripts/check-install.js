'use strict';

// Compares the repo's agent prompts to the installed copies under
// ~/.config/opencode/agent/ and reports drift. Local maintenance tool, not a
// CI test: the installed copies only change when someone copies them over and
// restarts opencode, so they silently fall behind after prompt edits.
//
// Usage: npm run check-install
// Exit code 0 = in sync (or nothing installed), 1 = drift found.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OPTIONAL_ROLES = new Set(['vision.md']);

const repoAgentDir = path.join(__dirname, '..', 'agent');
const installedDir = path.join(os.homedir(), '.config', 'opencode', 'agent');

if (!fs.existsSync(installedDir)) {
  console.log(`No installed agent directory at ${installedDir} - nothing to compare.`);
  process.exit(0);
}

let drift = 0;
const names = fs.readdirSync(repoAgentDir).filter((f) => f.endsWith('.md')).sort();

for (const name of names) {
  const installedFile = path.join(installedDir, name);
  if (!fs.existsSync(installedFile)) {
    if (OPTIONAL_ROLES.has(name)) {
      console.log(`${name}: not installed (optional role)`);
    } else {
      console.log(`${name}: NOT INSTALLED`);
      drift++;
    }
    continue;
  }
  const repoBuf = fs.readFileSync(path.join(repoAgentDir, name));
  const installedBuf = fs.readFileSync(installedFile);
  if (repoBuf.equals(installedBuf)) {
    console.log(`${name}: in sync`);
    continue;
  }
  // Byte identity stays the invariant - installs are plain copies, so any
  // difference means the installed file is not the repo artifact. But when
  // the only difference is line endings, say so.
  const eolOnly =
    repoBuf.toString('utf8').replace(/\r\n/g, '\n') ===
    installedBuf.toString('utf8').replace(/\r\n/g, '\n');
  console.log(`${name}: DRIFTED${eolOnly ? ' (line endings only)' : ''}`);
  drift++;
}

if (drift > 0) {
  console.log(`\n${drift} file(s) out of sync with the repo.`);
  console.log(`Update: copy the repo's agent/*.md over ${installedDir}, then fully restart opencode.`);
  process.exit(1);
}
console.log('\nInstalled agents match the repo.');
