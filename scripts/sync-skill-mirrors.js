'use strict';

// One-way sync from the hand-authored sources to the fusion-setup skill's
// distribution copies. The skill ships byte-identical mirrors of the agent
// prompts, slash commands, and audit plugin; test/sync.test.js fails on any
// drift. Edit the sources, run this, then `npm test`, then commit both sides.
//
// Sources (edit these):        agent/, .opencode/commands/, .opencode/plugins/
// Copies (never edit by hand): .opencode/skills/fusion-setup/{agent,commands,plugins}/
//
// This does NOT touch the installed copies under ~/.config/opencode/ - that
// drift is a separate concern covered by `npm run check-install`.
//
// Usage: npm run sync

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRoot = path.join(root, '.opencode', 'skills', 'fusion-setup');

const mirroredDirs = [
  { source: path.join(root, 'agent'), copy: path.join(skillRoot, 'agent') },
  { source: path.join(root, '.opencode', 'commands'), copy: path.join(skillRoot, 'commands') },
  { source: path.join(root, '.opencode', 'plugins'), copy: path.join(skillRoot, 'plugins') },
];

const rel = (p) => path.relative(root, p).split(path.sep).join('/');

let changed = 0;

for (const { source, copy } of mirroredDirs) {
  // A missing mirror directory (e.g. a deleted skill subtree) must be
  // restorable, not a crash.
  fs.mkdirSync(copy, { recursive: true });
  const sourceFiles = fs.readdirSync(source).sort();

  for (const name of sourceFiles) {
    const sourceBytes = fs.readFileSync(path.join(source, name));
    const copyFile = path.join(copy, name);
    if (fs.existsSync(copyFile) && sourceBytes.equals(fs.readFileSync(copyFile))) {
      continue;
    }
    fs.writeFileSync(copyFile, sourceBytes);
    console.log(`updated  ${rel(copyFile)}`);
    changed++;
  }

  // The mirror contract is an exact file list, so a file deleted from the
  // source must also leave the copy.
  for (const name of fs.readdirSync(copy)) {
    if (!sourceFiles.includes(name)) {
      fs.unlinkSync(path.join(copy, name));
      console.log(`removed  ${rel(path.join(copy, name))}`);
      changed++;
    }
  }
}

console.log(changed === 0 ? 'Mirrors already in sync.' : `\n${changed} file(s) synced. Run \`npm test\`, then commit sources and copies together.`);
