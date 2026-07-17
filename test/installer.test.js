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

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value));
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
    assert.equal(manifest.version, 2);
    assert.equal(manifest.config.existed, false);
    assert.equal(manifest.config.originalContent, null);
    assert.deepEqual(manifest.roles, ['build', 'plan', 'sidekick']);
    assert.ok(manifest.files.every((entry) => typeof entry.installedHash === 'string'));
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

  test('undo restores a prompt that existed before apply', () => {
    const prompt = path.join(dir, 'agent', 'build.md');
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, 'user build prompt\n');

    assert.equal(run(applyArgs()).status, 0);
    assert.notEqual(fs.readFileSync(prompt, 'utf8'), 'user build prompt\n');

    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(prompt, 'utf8'), 'user build prompt\n');
  });

  test('undo refuses without changing anything when a managed prompt was modified', () => {
    assert.equal(run(applyArgs()).status, 0);
    const prompt = path.join(dir, 'agent', 'build.md');
    fs.writeFileSync(prompt, 'user changed this after install\n');
    const configBefore = fs.readFileSync(path.join(dir, 'opencode.json'));

    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /modified.*agent\/build\.md|agent\/build\.md.*modified/i);
    assert.equal(fs.readFileSync(prompt, 'utf8'), 'user changed this after install\n');
    assert.deepEqual(fs.readFileSync(path.join(dir, 'opencode.json')), configBefore);
    assert.ok(fs.existsSync(path.join(dir, '.fusion-install.json')));
  });

  test('undo refuses without changing anything when installed config was modified', () => {
    assert.equal(run(applyArgs()).status, 0);
    const configPath = path.join(dir, 'opencode.json');
    const changed = { ...readJson(configPath), theme: 'changed-after-install' };
    writeJson(configPath, changed);

    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /opencode\.json.*modified|modified.*opencode\.json/i);
    assert.deepEqual(readJson(configPath), changed);
    assert.ok(fs.existsSync(path.join(dir, '.fusion-install.json')));
  });

  test('reapply refuses when a managed file changed after the prior apply', () => {
    assert.equal(run(applyArgs()).status, 0);
    const prompt = path.join(dir, 'agent', 'build.md');
    fs.writeFileSync(prompt, 'local customization\n');
    const configBefore = fs.readFileSync(path.join(dir, 'opencode.json'));

    const result = run(applyArgs());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /modified.*agent\/build\.md|agent\/build\.md.*modified/i);
    assert.equal(fs.readFileSync(prompt, 'utf8'), 'local customization\n');
    assert.deepEqual(fs.readFileSync(path.join(dir, 'opencode.json')), configBefore);
  });

  test('reapply refuses when installed config changed after the prior apply', () => {
    assert.equal(run(applyArgs()).status, 0);
    const configPath = path.join(dir, 'opencode.json');
    const changed = { ...readJson(configPath), theme: 'local-config-change' };
    writeJson(configPath, changed);

    const result = run(applyArgs());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /opencode\.json.*modified|modified.*opencode\.json/i);
    assert.deepEqual(readJson(configPath), changed);
  });

  test('reapply preserves the original baseline and union of managed files', () => {
    writeJson(path.join(dir, 'opencode.json'), { model: 'old/model', theme: 'original' });
    assert.equal(run(applyArgs(['--extras', 'plugin'])).status, 0);
    assert.ok(fs.existsSync(path.join(dir, 'plugins', 'fusion-audit.js')));

    assert.equal(run(applyArgs()).status, 0);
    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readJson(path.join(dir, 'opencode.json')), {
      model: 'old/model',
      theme: 'original',
    });
    assert.ok(!fs.existsSync(path.join(dir, 'plugins', 'fusion-audit.js')));
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

  test('valid JSON with a non-object config root is refused unchanged', () => {
    fs.writeFileSync(path.join(dir, 'opencode.json'), '[]');
    const result = run(applyArgs());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /existing.*object/i);
    assert.equal(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8'), '[]');
  });

  test('malformed model references and agent entries are refused', () => {
    for (const invalid of [
      { ...fragment, model: 'missing-provider-separator' },
      { ...fragment, small_model: '' },
      { ...fragment, agent: { ...fragment.agent, reviewer: 'not-an-object' } },
      { ...fragment, agent: { ...fragment.agent, reviewer: { model: '/missing-provider' } } },
    ]) {
      writeJson(fragmentPath, invalid);
      const result = run(applyArgs());
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /provider\/model-id|agent.*object/i);
      assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')));
    }
  });

  test('malformed nested Fusion config fields are refused', () => {
    for (const invalid of [
      { ...fragment, enabled_providers: 'prov' },
      { ...fragment, provider: { prov: { models: [] } } },
      { ...fragment, provider: { prov: { options: [] } } },
      { ...fragment, provider: { prov: { models: { model: 'not-an-object' } } } },
      { ...fragment, provider: { prov: { options: { baseURL: 42 } } } },
      { ...fragment, provider: { prov: { models: { model: { attachment: 'yes' } } } } },
      { ...fragment, provider: { prov: { models: { model: { modalities: [] } } } } },
      { ...fragment, provider: { prov: { models: { model: { modalities: { input: 'text' } } } } } },
      { ...fragment, provider: { prov: { models: { model: { modalities: { input: ['bogus'] } } } } } },
      { ...fragment, provider: { prov: { models: { model: { limit: { context: 1000 } } } } } },
      { ...fragment, agent: { build: { model: 'prov/main-model', permission: [] } } },
      { ...fragment, compaction: [] },
    ]) {
      writeJson(fragmentPath, invalid);
      const result = run(applyArgs());
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /must be|must contain/i);
      assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')));
    }
  });

  test('preserves valid agent permission string shorthand in existing config', () => {
    writeJson(path.join(dir, 'opencode.json'), {
      agent: { custom: { permission: 'deny' } },
      theme: 'keep-me',
    });

    const result = run(applyArgs());
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readJson(path.join(dir, 'opencode.json')).agent.custom.permission, 'deny');
  });

  // The unguarded-role refusal must hold on the plain --config path exactly
  // as it does for profiles: a role with a model but no permission-bearing
  // agent file would run with opencode's defaults instead of Fusion's guard.
  test('a fragment that assigns an optional role derives and installs its agent file', () => {
    writeJson(fragmentPath, {
      ...fragment,
      agent: { ...fragment.agent, reviewer: { model: 'prov/main-model' } },
    });
    const result = run(applyArgs());
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      fs.existsSync(path.join(dir, 'agent', 'reviewer.md')),
      'fragment-assigned optional role file not installed'
    );
    const manifest = readJson(path.join(dir, '.fusion-install.json'));
    assert.ok(manifest.roles.includes('reviewer'), 'manifest missing derived role');
  });

  test('explicit --roles that drops a fragment-assigned optional role is refused', () => {
    writeJson(fragmentPath, {
      ...fragment,
      agent: { ...fragment.agent, reviewer: { model: 'prov/main-model' } },
    });
    const result = run(applyArgs(['--roles', 'build,plan,sidekick']));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /omits role\(s\) the config assigns models to/);
    assert.match(result.stderr, /reviewer/);
    assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')), 'refusal must write nothing');
  });

  test('a fragment key named __proto__ merges as a literal key without pollution', () => {
    fs.writeFileSync(
      fragmentPath,
      JSON.stringify(fragment).slice(0, -1) + ',"__proto__":{"polluted":true}}'
    );
    const result = run(applyArgs());
    assert.equal(result.status, 0, result.stderr);
    const raw = fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8');
    assert.match(raw, /"__proto__"/, 'the subtree must land in the written config, not vanish');
    assert.equal({}.polluted, undefined, 'Object.prototype must not be polluted');
    assert.equal(Object.getPrototypeOf(JSON.parse(raw)), Object.prototype);
  });

  test('invalid destination parent is refused before config changes', () => {
    writeJson(path.join(dir, 'opencode.json'), { model: 'old/model' });
    fs.writeFileSync(path.join(dir, 'agent'), 'not a directory');

    const result = run(applyArgs());
    assert.equal(result.status, 1);
    assert.match(result.stderr, /agent.*directory|destination parent/i);
    assert.deepEqual(readJson(path.join(dir, 'opencode.json')), { model: 'old/model' });
    assert.equal(fs.readFileSync(path.join(dir, 'agent'), 'utf8'), 'not a directory');
    assert.ok(!fs.existsSync(path.join(dir, '.fusion-install.json')));
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

  test('warns when small_model references a provider with no block', () => {
    writeJson(fragmentPath, { ...fragment, small_model: 'small-provider/model' });
    const result = run(applyArgs());
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /WARNING:.*small-provider/);
  });

  test('undo rejects a manifest path that escapes the config directory', () => {
    assert.equal(run(applyArgs()).status, 0);
    const victim = path.join(path.dirname(dir), `${path.basename(dir)}-victim`);
    fs.writeFileSync(victim, 'keep me');
    try {
      const manifestPath = path.join(dir, '.fusion-install.json');
      const manifest = readJson(manifestPath);
      manifest.files = [{
        path: `../${path.basename(victim)}`,
        existed: false,
        originalContent: null,
        originalMode: null,
        installedHash: '0'.repeat(64),
      }];
      writeJson(manifestPath, manifest);

      const result = run(['undo', '--config-dir', dir]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /unsafe|outside|manifest/i);
      assert.equal(fs.readFileSync(victim, 'utf8'), 'keep me');
      assert.ok(fs.existsSync(manifestPath));
    } finally {
      fs.rmSync(victim, { force: true });
    }
  });

  test('preserves private config permissions on POSIX', { skip: process.platform === 'win32' }, () => {
    const configPath = path.join(dir, 'opencode.json');
    writeJson(configPath, { model: 'old/model' });
    fs.chmodSync(configPath, 0o600);
    assert.equal(run(applyArgs()).status, 0);
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
  });

  test('undo refuses a mode-only change to a managed file on POSIX', {
    skip: process.platform === 'win32',
  }, () => {
    assert.equal(run(applyArgs()).status, 0);
    const prompt = path.join(dir, 'agent', 'build.md');
    const installedMode = fs.statSync(prompt).mode & 0o777;
    fs.chmodSync(prompt, installedMode === 0o600 ? 0o644 : 0o600);

    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /mode|modified/i);
    assert.ok(fs.existsSync(path.join(dir, '.fusion-install.json')));
  });

  test('apply and undo work when the config directory contains spaces', () => {
    const spacedDir = path.join(dir, 'config dir with spaces');
    const args = ['apply', '--config', fragmentPath, '--config-dir', spacedDir];
    const applied = run(args);
    assert.equal(applied.status, 0, applied.stderr);
    const undone = run(['undo', '--config-dir', spacedDir]);
    assert.equal(undone.status, 0, undone.stderr);
    assert.ok(!fs.existsSync(path.join(spacedDir, 'opencode.json')));
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

  // --profile: bundled subscription profiles as the config fragment.
  // Expected values are read from the profile source files so refreshing a
  // profile's model ids never breaks these tests.
  const profile = (name) =>
    readJson(path.join(__dirname, '..', '.opencode', 'skills', 'fusion-setup', 'profiles', `${name}.json`));

  test('apply with only a profile installs its config and derived roles', () => {
    const zen = profile('opencode-zen');
    const result = run(['apply', '--profile', 'opencode-zen', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);

    const config = readJson(path.join(dir, 'opencode.json'));
    assert.equal(config.model, zen.model);
    assert.equal(config.agent.sidekick.model, zen.agent.sidekick.model);
    assert.equal(config.small_model, zen.small_model);

    const optionalRoles = ['research', 'design', 'reviewer', 'vision']
      .filter((role) => role in zen.agent);
    assert.ok(optionalRoles.length > 0, 'test profile must assign optional roles');
    const manifest = readJson(path.join(dir, '.fusion-install.json'));
    for (const role of ['build', 'plan', 'sidekick', ...optionalRoles]) {
      assert.ok(fs.existsSync(path.join(dir, 'agent', `${role}.md`)), `missing agent/${role}.md`);
      assert.ok(manifest.roles.includes(role), `manifest missing role ${role}`);
    }
  });

  test('a --config fragment overrides the profile it is applied with', () => {
    const zen = profile('opencode-zen');
    writeJson(fragmentPath, {
      model: 'prov/override-model',
      provider: { prov: { npm: '@ai-sdk/openai-compatible', options: { baseURL: 'http://x', apiKey: '{env:K}' } } },
      agent: { build: { model: 'prov/override-model' } },
    });
    const result = run(['apply', '--profile', 'opencode-zen', '--config', fragmentPath, '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);

    const config = readJson(path.join(dir, 'opencode.json'));
    assert.equal(config.model, 'prov/override-model', 'fragment must win over the profile');
    assert.equal(config.agent.build.model, 'prov/override-model');
    assert.equal(config.agent.sidekick.model, zen.agent.sidekick.model, 'untouched profile keys must survive');
  });

  test('unknown profile is refused with the available names, nothing written', () => {
    const result = run(['apply', '--profile', 'nope', '--config-dir', dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown profile "nope"/);
    assert.match(result.stderr, /opencode-go/);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f !== 'fragment.json'), []);
  });

  test('a profile name with path characters is refused before any file access', () => {
    for (const name of ['../evil', 'evil/../../x', '.hidden', 'UPPER']) {
      const result = run(['apply', '--profile', name, '--config-dir', dir]);
      assert.equal(result.status, 1, `expected refusal for ${name}`);
      assert.match(result.stderr, /invalid profile name/);
    }
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f !== 'fragment.json'), []);
  });

  test('apply requires a profile or a config fragment', () => {
    const result = run(['apply', '--config-dir', dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires --profile <name> and\/or --config/);
  });

  test('dry run with a profile reports it and writes nothing', () => {
    const result = run(['apply', '--profile', 'opencode-zen', '--dry-run', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /profile:\s+opencode-zen/);
    assert.match(result.stdout, /dry run - nothing written/);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f !== 'fragment.json'), []);
  });

  test('explicit --roles that drops a profile-assigned role is refused', () => {
    const zen = profile('opencode-zen');
    assert.ok('reviewer' in zen.agent, 'test profile must assign reviewer');
    const result = run([
      'apply', '--profile', 'opencode-zen', '--roles', 'build,plan,sidekick', '--config-dir', dir,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /omits role\(s\) the config assigns models to/);
    assert.match(result.stderr, /reviewer/);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f !== 'fragment.json'), []);
  });

  test('explicit --roles that drops a core role is refused with a profile', () => {
    // Without sidekick.md the config's agent.sidekick.model would define an
    // agent with no permission frontmatter - the exact hole Fusion closes.
    const result = run([
      'apply', '--profile', 'opencode-zen',
      '--roles', 'build,plan,research,design,reviewer', '--config-dir', dir,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /omits role\(s\) the config assigns models to/);
    assert.match(result.stderr, /sidekick/);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f !== 'fragment.json'), []);
  });

  test('undo cleanly reverses a profile apply', () => {
    assert.equal(run(['apply', '--profile', 'opencode-zen', '--config-dir', dir]).status, 0);
    const result = run(['undo', '--config-dir', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(path.join(dir, 'opencode.json')));
    assert.ok(!fs.existsSync(path.join(dir, 'agent', 'reviewer.md')));
  });
});
