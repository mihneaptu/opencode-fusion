'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createEnv } = require('./opencode-env');

test('integration environment is hermetic and enables only the fake provider', async () => {
  process.env.FUSION_TEST_SECRET = 'must-not-leak';
  const envInfo = await createEnv('http://127.0.0.1:12345/v1');
  try {
    assert.equal(envInfo.env.FUSION_TEST_SECRET, undefined);
    assert.equal(envInfo.env.NODE_OPTIONS, undefined);

    const config = JSON.parse(
      fs.readFileSync(path.join(envInfo.fakeHome, '.config', 'opencode', 'opencode.json'), 'utf8')
    );
    assert.deepEqual(config.enabled_providers, ['fake']);
    assert.ok(fs.existsSync(path.join(envInfo.projectDir, '.git', 'HEAD')));
    const projectConfig = JSON.parse(
      fs.readFileSync(path.join(envInfo.projectDir, 'opencode.json'), 'utf8')
    );
    assert.deepEqual(projectConfig.enabled_providers, ['fake']);
    assert.deepEqual(Object.keys(projectConfig.provider), ['fake']);
    assert.equal(
      fs.readFileSync(path.join(envInfo.fakeHome, '.cache', 'opencode', 'models.json'), 'utf8'),
      '{}'
    );
  } finally {
    delete process.env.FUSION_TEST_SECRET;
    envInfo.cleanup();
  }
});
