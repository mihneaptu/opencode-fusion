'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const pluginSource = path.join(__dirname, '..', '.opencode', 'plugins', 'fusion-audit.js');

// The plugin uses ES module syntax inside a CommonJS package scope. opencode's
// loader handles that natively; plain Node needs an explicit module scope, so
// the test imports a copy from a temp dir that declares type: module.
describe('fusion-audit plugin smoke test', () => {
  let tempDir;
  let hooks;
  let logged;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-audit-test-'));
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ type: 'module' }));
    const target = path.join(tempDir, 'fusion-audit.js');
    fs.copyFileSync(pluginSource, target);
    const mod = await import(pathToFileURL(target).href);
    assert.equal(typeof mod.FusionAudit, 'function', 'plugin must export FusionAudit');

    logged = [];
    const client = { app: { log: (entry) => { logged.push(entry.body); } } };
    hooks = await mod.FusionAudit({ client });
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('returns the hook surface opencode expects', () => {
    assert.equal(typeof hooks.event, 'function', 'plugin must register an event hook');
    assert.equal(typeof hooks['tool.execute.after'], 'function', 'plugin must register tool.execute.after');
  });

  test('logs child session spawns and ignores root sessions', async () => {
    logged.length = 0;
    await hooks.event({
      event: {
        type: 'session.created',
        properties: { info: { id: 'ses_child', parentID: 'ses_root', title: 'delegated work' } },
      },
    });
    await hooks.event({
      event: { type: 'session.created', properties: { info: { id: 'ses_root' } } },
    });
    await hooks.event({ event: { type: 'message.updated', properties: {} } });

    assert.equal(logged.length, 1, 'only the child session spawn should be logged');
    assert.equal(logged[0].service, 'fusion-audit');
    assert.equal(logged[0].message, 'subagent session spawned');
    assert.equal(logged[0].extra.parentID, 'ses_root');
  });

  test('logs edit/write/task tool calls and ignores read-only tools', async () => {
    logged.length = 0;
    for (const tool of ['edit', 'write', 'task', 'read', 'grep', 'bash']) {
      await hooks['tool.execute.after']({ tool, sessionID: 'ses_x' });
    }
    assert.deepEqual(
      logged.map((entry) => entry.extra.tool),
      ['edit', 'write', 'task'],
      'only file-mutating and delegation tools belong in the audit trail'
    );
  });
});
