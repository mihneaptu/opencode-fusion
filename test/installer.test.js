'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const installer = path.join(
  __dirname,
  '..',
  '.opencode',
  'skills',
  'fusion-setup',
  'scripts',
  'install.js'
);

// Exercised as a real child process: exit codes and refusal behavior are
// part of the contract the skill relies on.
function run(args) {
  return spawnSync(process.execPath, [installer, ...args], { encoding: 'utf8' });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('fusion-setup deterministic installer', () => {
  let dir; // throwaway config dir standing in for ~/.config/opencode
  let fragmentPath;
  const fragment = {
    model: 'prov/main-model',
    provider: {
      prov: { npm: '@ai-sdk/openai-compatible', options: { baseURL: 'http://x', apiKey: '{env:K}' } },
    },
    agent: {
      build: { model: 'prov/main-model' },
      sidekick: { model: 'prov/side-model' },
      explore: { model: 'prov/side-model' },
    },
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-installer-'));
    fragmentPath = path.join(dir, 'fragment.json');
    fs.writeFileSync(fragmentPath, JSON.stringify(fragment));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const applyArgs = (extra = []) => [
    'apply',
    '--config',
    fragmentPath,
    '--config-dir',
    dir,
    ...extra,
  ];

  test('fresh apply writes config, core prompts, and a manifest', () => {
    const result = run(applyArgs());
    assert.equal(result.status, 0, result.stderr);
    const config = readJson(path.join(dir, 'opencode.json'));
    assert.equal(config.model, 'prov/main-model');
    assert.equal(config.agent.sidekick.model, 'prov/side-model');
    for (const role of ['build', 'plan', 'sidekick']) {
      assert.ok(fs.existsSync(path.join(dir, 'agent', `${role}.md`)), `missing agent/${role}.md`);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'agent', 'design.md')), 'optional role installed unasked');
    const manifest = readJson(path.join(dir, '.fusion-install.json'));
    assert.equal(manifest.hadExistingConfig, false);
    assert.equal(manifest.backup, null);
    assert.deepEqual(manifest.roles, ['build', 'plan', 'sidekick']);
  });

  test('apply over an existing config backs it up and preserves unrelated keys', () => {
    fs.writeFileSync(
      path.join(dir, 'opencode.json'),
      JSON.stringify({
        theme: 'user-theme',
        model: 'old/model',
        provider: { old: { note: 'keep me' } },
      })
    );
    const result = run(applyArgs(['--roles', 'build,plan,sidekick,reviewer']));
    assert.equal(result.status, 0, result.stderr);

    const config = readJson(path.join(dir, 'opencode.json'));
    assert.equal(config.theme, 'user-theme', 'unrelated user key was lost');
    assert.equal(config.provider.old.note, 'keep me', 'unrelated provider was lost');
    assert.equal(config.model, 'prov/main-model', 'fragment must win on conflicts');
    assert.ok(fs.existsSync(path.join(dir, 'agent', 'reviewer.md')), 'requested role not installed');

    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('opencode.json.backup.'));
    assert.equal(backups.length, 1, 'exactly one backup expected');
    assert.equal(readJson(path.join(dir, backups[0])).model, 'old/model');
  });

  test('apply is idempotent', () => {
    assert.equal(run(applyArgs()).status, 0);
    const first = readJson(path.join(dir, 'opencode.json'));
    assert.equal(run(applyArgs()).status, 0);
    assert.deepEqual(readJson(path.join(dir, 'opencode.json')), first);
  });

  test('extras install the commands and the audit plugin', () => {
    const result = run(applyArgs(['--extras', 'commands,plugin']));
    assert.equal(result.status, 0, result.stderr);
    for (const rel of [
      ['commands', 'fusion-setup.md'],
      ['commands', 'fusion-status.md'],
      ['plugins', 'fusion-audit.js'],
    ]) {
      assert.ok(fs.existsSync(path.join(dir, ...rel)), `missing ${rel.join('/')}`);
    }
  });

  test('invalid fragment JSON changes nothing and exits nonzero', () => {
    fs.writeFileSync(fragmentPath, '{not json');
    const result = run(applyArgs());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read fragment/);
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f !== 'fragment.json'),
      [],
      'a failed apply must leave the config dir untouched'
    );
  });

  test('corrupt existing config is refused, not overwritten', () => {
    fs.writeFileSync(path.join(dir, 'opencode.json'), '{broken');
    const result = run(applyArgs());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not valid JSON/);
    assert.equal(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8'), '{broken');
  });

  test('unknown role or extra is refused before any filesystem change', () => {
    for (const args of [applyArgs(['--roles', 'build,hacker']), applyArgs(['--extras', 'rootkit'])]) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /unknown (role|extra)/);
    }
    assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')));
  });

  test('dry run reports the plan and writes nothing', () => {
    const result = run(applyArgs(['--dry-run']));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry run - nothing written/);
    assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')));
    assert.ok(!fs.existsSync(path.join(dir, 'agent')));
  });

  test('warns when a model references a provider with no block', () => {
    fs.writeFileSync(
      fragmentPath,
      JSON.stringify({ ...fragment, agent: { ...fragment.agent, design: { model: 'ghost/m' } } })
    );
    const result = run(applyArgs());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /WARNING:.*ghost/);
  });

  test('undo restores the pre-install config and removes installed files', () => {
    fs.writeFileSync(path.join(dir, 'opencode.json'), JSON.stringify({ model: 'old/model' }));
    assert.equal(run(applyArgs(['--extras', 'plugin'])).status, 0);

    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readJson(path.join(dir, 'opencode.json')).model, 'old/model');
    assert.ok(!fs.existsSync(path.join(dir, 'agent', 'build.md')), 'installed prompt not removed');
    assert.ok(!fs.existsSync(path.join(dir, 'plugins', 'fusion-audit.js')), 'plugin not removed');
    assert.ok(!fs.existsSync(path.join(dir, '.fusion-install.json')), 'manifest not removed');
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('opencode.json.backup.'));
    assert.equal(backups.length, 1, 'undo must keep backups');
  });

  test('undo after a fresh install removes the config it created', () => {
    assert.equal(run(applyArgs()).status, 0);
    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')));
  });

  test('undo without a manifest refuses with guidance', () => {
    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /nothing recorded to undo/);
  });
});
