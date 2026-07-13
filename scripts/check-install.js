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
  const same = fs
    .readFileSync(path.join(repoAgentDir, name))
    .equals(fs.readFileSync(installedFile));
  console.log(`${name}: ${same ? 'in sync' : 'DRIFTED'}`);
  if (!same) drift++;
}

if (drift > 0) {
  console.log(`\n${drift} file(s) out of sync with the repo.`);
  console.log(`Update: copy the repo's agent/*.md over ${installedDir}, then fully restart opencode.`);
  process.exit(1);
}
console.log('\nInstalled agents match the repo.');
