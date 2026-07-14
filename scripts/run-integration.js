'use strict';

// Cross-platform launcher for the live integration tests: sets the
// FUSION_INTEGRATION gate (env assignment in npm scripts is not portable
// to Windows) and runs only the integration test directory.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const integrationDir = path.join(__dirname, '..', 'test', 'integration');
const testFiles = fs
  .readdirSync(integrationDir)
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => path.join(integrationDir, name));

const version = spawnSync('opencode --version', {
  shell: true,
  encoding: 'utf8',
  timeout: 30000,
});
if (version.status !== 0) {
  process.stderr.write('integration tests require an opencode binary on PATH\n');
  if (version.stderr) process.stderr.write(version.stderr);
  process.exit(1);
}
process.stdout.write(`testing with opencode ${version.stdout.trim()}\n`);

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  env: { ...process.env, FUSION_INTEGRATION: '1' },
});

process.exit(result.status === null ? 1 : result.status);
