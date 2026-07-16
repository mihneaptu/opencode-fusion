'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const profilesDir = path.join(root, 'profiles');
const installer = path.join(root, '.opencode', 'skills', 'fusion-setup', 'scripts', 'install.js');

// The shipped set is public surface: SKILL.md Step 0, the README table, and
// the site all enumerate these names. Adding or removing a profile must
// update all of them together.
const EXPECTED_PROFILES = [
  'cerebras-code',
  'chatgpt',
  'github-copilot',
  'opencode-go',
  'opencode-zen',
  'opencode-zen-free',
];

// `plan` is deliberately absent: it reuses the build model and gets no agent
// block. Core roles must always be assigned so a profile is usable alone.
const ASSIGNABLE_ROLES = ['build', 'sidekick', 'explore', 'research', 'design', 'reviewer', 'vision'];
const CORE_ROLES = ['build', 'sidekick', 'explore'];
const MODEL_REF = /^[^/\s]+\/\S+$/;

function readProfile(name) {
  return JSON.parse(fs.readFileSync(path.join(profilesDir, `${name}.json`), 'utf8'));
}

test('the shipped profile set is exactly the documented one', () => {
  const files = fs.readdirSync(profilesDir).sort();
  assert.deepEqual(files, EXPECTED_PROFILES.map((name) => `${name}.json`).sort());
});

for (const name of EXPECTED_PROFILES) {
  describe(`profile ${name}`, () => {
    const profile = readProfile(name);

    test('is a config fragment with the opencode schema', () => {
      assert.equal(typeof profile, 'object');
      assert.equal(profile.$schema, 'https://opencode.ai/config.json');
    });

    test('assigns the core roles and only known roles', () => {
      const roles = Object.keys(profile.agent || {});
      for (const role of CORE_ROLES) {
        assert.ok(roles.includes(role), `core role ${role} missing`);
      }
      for (const role of roles) {
        assert.ok(ASSIGNABLE_ROLES.includes(role), `unknown or disallowed role ${role}`);
      }
    });

    test('pins the default and small model', () => {
      assert.match(profile.model, MODEL_REF);
      assert.equal(profile.model, profile.agent.build.model, 'top-level model must equal the build model');
      assert.match(profile.small_model, MODEL_REF);
    });

    test('every model reference resolves inside its own provider blocks', () => {
      const refs = [profile.model, profile.small_model,
        ...Object.values(profile.agent).map((agent) => agent.model)];
      for (const ref of refs) {
        assert.match(ref, MODEL_REF);
        const [providerId, modelId] = [ref.slice(0, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)];
        const models = profile.provider?.[providerId]?.models;
        assert.ok(models && modelId in models, `${ref} has no entry in the profile's provider blocks`);
      }
    });

    test('provider blocks stay models-only - auth is out-of-band', () => {
      for (const [providerId, provider] of Object.entries(profile.provider)) {
        assert.deepEqual(
          Object.keys(provider),
          ['models'],
          `provider ${providerId} must carry only display names; built-in providers get npm/baseURL/keys from opencode itself`
        );
        for (const [modelId, model] of Object.entries(provider.models)) {
          assert.deepEqual(Object.keys(model), ['name'], `${providerId}/${modelId} must carry only a display name`);
        }
      }
    });

    test('the installer accepts it end to end (dry run)', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-profile-'));
      try {
        const result = spawnSync(
          process.execPath,
          [installer, 'apply', '--profile', name, '--dry-run', '--config-dir', dir],
          { encoding: 'utf8' }
        );
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, new RegExp(`profile:\\s+${name}`));
        assert.doesNotMatch(result.stdout, /WARNING/, 'a shipped profile must not trip the orphan-provider warning');
        assert.equal(fs.readdirSync(dir).length, 0, 'dry run must write nothing');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}
