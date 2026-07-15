'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRoot = path.join(root, '.opencode', 'skills', 'fusion-setup');

// The fusion-setup skill ships byte-identical copies of the agent prompts,
// the subscription profiles, the slash command, and the audit plugin. Any
// drift means one side was edited without the other; `npm run sync`
// refreshes the copies from source.
const mirroredDirs = [
  { source: path.join(root, 'agent'), copy: path.join(skillRoot, 'agent') },
  { source: path.join(root, 'profiles'), copy: path.join(skillRoot, 'profiles') },
  { source: path.join(root, '.opencode', 'commands'), copy: path.join(skillRoot, 'commands') },
  { source: path.join(root, '.opencode', 'plugins'), copy: path.join(skillRoot, 'plugins') },
];

const rel = (p) => path.relative(root, p).split(path.sep).join('/');

for (const { source, copy } of mirroredDirs) {
  test(`${rel(copy)} mirrors ${rel(source)}`, () => {
    const sourceFiles = fs.readdirSync(source).sort();
    const copyFiles = fs.readdirSync(copy).sort();
    assert.deepEqual(copyFiles, sourceFiles, `file lists of ${rel(source)} and ${rel(copy)} differ - run \`npm run sync\``);

    for (const name of sourceFiles) {
      const sourceBytes = fs.readFileSync(path.join(source, name));
      const copyBytes = fs.readFileSync(path.join(copy, name));
      assert.ok(
        sourceBytes.equals(copyBytes),
        `${rel(path.join(copy, name))} is not byte-identical to ${rel(path.join(source, name))} - run \`npm run sync\``
      );
    }
  });
}
