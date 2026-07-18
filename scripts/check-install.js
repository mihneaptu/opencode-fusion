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
const { applyPromptCompatibility } = require('../.opencode/skills/fusion-setup/scripts/prompt-compat');

// The setup skill always installs these; research/design/reviewer/vision are
// optional a-la-carte picks, so their absence is a choice, not drift. An
// installed copy of any role must still match the repo byte-for-byte.
const CORE_ROLES = new Set(['build.md', 'plan.md', 'sidekick.md']);

const repoAgentDir = path.join(__dirname, '..', '.opencode', 'skills', 'fusion-setup', 'agent');
const installedDir = path.join(os.homedir(), '.config', 'opencode', 'agent');
const configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');

let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`Cannot parse ${configPath}: ${err.message}`);
    process.exit(1);
  }
}

if (!fs.existsSync(installedDir)) {
  console.log(`No installed agent directory at ${installedDir} - nothing to compare.`);
  process.exit(0);
}

let drift = 0;
const names = fs.readdirSync(repoAgentDir).filter((f) => f.endsWith('.md')).sort();

for (const name of names) {
  const installedFile = path.join(installedDir, name);
  if (!fs.existsSync(installedFile)) {
    if (CORE_ROLES.has(name)) {
      console.log(`${name}: NOT INSTALLED`);
      drift++;
    } else {
      console.log(`${name}: not installed (optional role)`);
    }
    continue;
  }
  const role = path.basename(name, '.md');
  const sourceBuf = fs.readFileSync(path.join(repoAgentDir, name));
  const repoBuf = applyPromptCompatibility(sourceBuf, config.agent?.[role]?.model);
  const installedBuf = fs.readFileSync(installedFile);
  if (repoBuf.equals(installedBuf)) {
    console.log(`${name}: in sync`);
    continue;
  }
  // Byte identity stays the invariant after applying the same model-specific
  // compatibility transform as the installer. When the only difference is
  // line endings, say so.
  const eolOnly =
    repoBuf.toString('utf8').replace(/\r\n/g, '\n') ===
    installedBuf.toString('utf8').replace(/\r\n/g, '\n');
  console.log(`${name}: DRIFTED${eolOnly ? ' (line endings only)' : ''}`);
  drift++;
}

if (drift > 0) {
  console.log(`\n${drift} file(s) out of sync with the repo.`);
  console.log('Update: rerun the Fusion installer for the current config, then fully restart opencode.');
  process.exit(1);
}
console.log('\nInstalled agents match the repo.');
