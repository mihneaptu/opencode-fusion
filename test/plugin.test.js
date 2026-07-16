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
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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

  test('logs edit/write/apply_patch/task tool calls and ignores read-only tools', async () => {
    logged.length = 0;
    // "apply_patch" is opencode's third mutation tool gated by the edit permission.
    for (const tool of ['edit', 'write', 'apply_patch', 'task', 'read', 'grep', 'bash']) {
      await hooks['tool.execute.after']({ tool, sessionID: 'ses_x' });
    }
    assert.deepEqual(
      logged.map((entry) => entry.extra.tool),
      ['edit', 'write', 'apply_patch', 'task'],
      'only file-mutating and delegation tools belong in the audit trail'
    );
  });

  test('aggregates assistant token usage by agent and model when a session becomes idle', async () => {
    logged.length = 0;
    const update = (info) => hooks.event({
      event: { type: 'message.updated', properties: { info: { role: 'assistant', ...info } } },
    });

    await update({
      id: 'msg_build_1', sessionID: 'ses_usage', mode: 'build',
      providerID: 'openai', modelID: 'gpt-main', cost: 0.125,
      tokens: { input: 10, output: 4, reasoning: 1, cache: { read: 2, write: 3 } },
    });
    await update({
      id: 'msg_build_2', sessionID: 'ses_usage', mode: 'build',
      providerID: 'openai', modelID: 'gpt-main',
      tokens: { input: 5, output: 6, reasoning: 0, cache: { read: 1, write: 0 } },
    });
    await update({
      id: 'msg_sidekick', sessionID: 'ses_usage', mode: 'sidekick',
      providerID: 'other', modelID: 'fast-model', cost: 0.5,
      tokens: { input: 7, output: 8, reasoning: 2, cache: { read: 4, write: 0 } },
    });
    // A later update for the same message replaces its earlier cumulative totals.
    await update({
      id: 'msg_sidekick', sessionID: 'ses_usage', mode: 'sidekick',
      providerID: 'other', modelID: 'fast-model', cost: 0.25,
      tokens: { input: 9, output: 10, reasoning: 3, cache: { read: 5, write: 1 } },
    });
    await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'ses_usage' } } });

    assert.deepEqual(logged, [{
      service: 'fusion-audit',
      level: 'info',
      message: 'session token usage',
      extra: {
        sessionID: 'ses_usage',
        usage: [
          {
            agent: 'build', modelID: 'gpt-main', providerID: 'openai',
            input: 15, output: 10, reasoning: 1, cacheRead: 3, cacheWrite: 3, cost: 0.125,
          },
          {
            agent: 'sidekick', modelID: 'fast-model', providerID: 'other',
            input: 9, output: 10, reasoning: 3, cacheRead: 5, cacheWrite: 1, cost: 0.25,
          },
        ],
      },
    }]);

    await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'ses_usage' } } });
    assert.equal(logged.length, 1, 'an idle session with no new messages must not log twice');
  });

  test('ignores malformed and empty event payloads without throwing or logging', async () => {
    logged.length = 0;
    await assert.doesNotReject(async () => {
      await hooks.event({});
      await hooks.event({ event: {} });
      await hooks.event({ event: { type: 'message.updated' } });
      await hooks.event({
        event: {
          type: 'message.updated',
          properties: {
            info: {
              id: 'msg_bad', sessionID: 'ses_bad', role: 'assistant', modelID: 'model',
              tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 4, write: 5 } },
            },
          },
        },
      });
      await hooks.event({
        event: {
          type: 'message.updated',
          properties: {
            info: {
              id: 'msg_bad_tokens', sessionID: 'ses_bad', role: 'assistant', mode: 'build',
              modelID: 'model', tokens: { input: '1', output: 2, reasoning: 3, cache: {} },
            },
          },
        },
      });
      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'ses_bad' } } });
      await hooks.event({ event: { type: 'session.idle', properties: {} } });
    });
    assert.equal(logged.length, 0);
  });
});
