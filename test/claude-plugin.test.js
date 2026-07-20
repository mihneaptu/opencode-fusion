'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const source = path.join(
  __dirname,
  '..',
  '.opencode',
  'skills',
  'fusion-setup',
  'plugins',
  'fusion-claude.js'
);

describe('fusion Claude Code bridge', () => {
  let dir;
  let mod;
  let FusionClaude;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-claude-plugin-'));
    const packageDir = path.join(dir, 'node_modules', '@opencode-ai', 'plugin');
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({ name: '@opencode-ai/plugin', type: 'module', exports: './index.js' })
    );
    fs.writeFileSync(
      path.join(packageDir, 'index.js'),
      [
        'export const tool = (definition) => definition;',
        'tool.schema = {',
        '  string: () => ({ max() { return this; }, describe() { return this; } }),',
        '};',
      ].join('\n')
    );
    const pluginCopy = path.join(dir, 'fusion-claude.js');
    fs.copyFileSync(source, pluginCopy);
    mod = await import(`${pathToFileURL(pluginCopy).href}?test=${Date.now()}`);
    ({ FusionClaude } = mod);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // opencode's loader calls the plugin as server(input, options); tests inject
  // the process runner through options. A bogus PATH guarantees that a wiring
  // bug can never reach the real claude CLI from a unit test.
  const toolsWith = async (options = {}) => {
    const { tool } = await FusionClaude(undefined, {
      environment: { PATH: 'fusion-test-no-such-path' },
      ...options,
    });
    return tool;
  };

  const authResult = (overrides = {}) => ({
    code: 0,
    stdout: JSON.stringify({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      subscriptionType: 'pro',
      email: 'must-not-leak@example.com',
      ...overrides,
    }),
    stderr: '',
  });

  const reviewResult = (result = 'PLAN_APPROVED\nThe plan is focused and testable.') => ({
    code: 0,
    stdout: JSON.stringify({
      result,
      modelUsage: { 'claude-fable-5': { inputTokens: 10, outputTokens: 8 } },
    }),
    stderr: '',
  });

  test('FusionClaude is the only export - opencode calls every export as a plugin', () => {
    assert.deepEqual(Object.keys(mod), ['FusionClaude']);
  });

  test('exposes only status and read-only plan review tools', async () => {
    const tools = await toolsWith({ run: async () => authResult() });
    assert.deepEqual(Object.keys(tools).sort(), ['fusion_claude_review', 'fusion_claude_status']);
  });

  test('status verifies first-party Pro/Max auth without returning identity data', async () => {
    const tools = await toolsWith({ run: async () => authResult() });
    const output = await tools.fusion_claude_status.execute({}, { directory: 'C:/workspace', agent: 'build' });
    assert.match(output, /bridge ready.*PRO.*claude-fable-5/i);
    assert.doesNotMatch(output, /must-not-leak|@example\.com/i);
  });

  test('review pins safe CLI flags, sends the packet over stdin, and removes API routing', async () => {
    const calls = [];
    const results = [authResult(), reviewResult('PLAN_REVISE\nAdd a rollback test.')];
    const run = async (options) => {
      calls.push(options);
      return results.shift();
    };
    const environment = {
      PATH: 'test-path',
      ANTHROPIC_API_KEY: 'api-secret',
      ANTHROPIC_AUTH_TOKEN: 'auth-secret',
      ANTHROPIC_BASE_URL: 'https://proxy.invalid',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_OAUTH_TOKEN: 'official-cli-token',
    };
    const tools = await toolsWith({ run, environment });
    const packet = 'Task and proposed plan';
    const output = await tools.fusion_claude_review.execute({ packet }, { worktree: 'C:/workspace', agent: 'plan' });

    assert.match(output, /PLAN_REVISE\nAdd a rollback test\./);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args, ['auth', 'status', '--json']);
    assert.equal(calls[1].input, packet);
    assert.equal(calls[1].args.includes(packet), false, 'review packet must not be exposed in process arguments');
    for (const expected of [
      '-p', '--model', 'claude-fable-5', '--effort', 'high', '--safe-mode',
      '--tools', '--permission-mode', 'dontAsk', '--no-session-persistence',
      '--output-format', 'json', '--max-turns', '1',
    ]) assert.ok(calls[1].args.includes(expected), `missing Claude CLI argument: ${expected}`);
    assert.equal(calls[1].env.ANTHROPIC_API_KEY, undefined);
    assert.equal(calls[1].env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(calls[1].env.ANTHROPIC_BASE_URL, undefined);
    assert.equal(calls[1].env.CLAUDE_CODE_USE_BEDROCK, undefined);
    assert.equal(calls[1].env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  });

  test('runs Claude from a neutral temporary directory, never the workspace', async () => {
    const calls = [];
    const results = [authResult(), reviewResult()];
    const run = async (options) => {
      calls.push(options);
      return results.shift();
    };
    const tools = await toolsWith({ run });
    await tools.fusion_claude_review.execute({ packet: 'plan' }, { worktree: 'C:/workspace', directory: 'C:/workspace', agent: 'build' });
    assert.equal(calls[0].cwd, os.tmpdir());
    assert.equal(calls[1].cwd, os.tmpdir());
  });

  test('refuses callers other than the build and plan agents', async () => {
    const calls = [];
    const run = async (options) => {
      calls.push(options);
      return authResult();
    };
    const tools = await toolsWith({ run });
    for (const agent of ['sidekick', 'reviewer', 'explore', undefined]) {
      await assert.rejects(
        tools.fusion_claude_status.execute({}, { directory: 'C:/workspace', agent }),
        /only serve the build and plan agents/i
      );
      await assert.rejects(
        tools.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace', agent }),
        /only serve the build and plan agents/i
      );
    }
    assert.equal(calls.length, 0, 'a refused caller must never reach the claude CLI');
  });

  test('passes the session abort signal through to the Claude process runner', async () => {
    const calls = [];
    const results = [authResult(), reviewResult()];
    const run = async (options) => {
      calls.push(options);
      return results.shift();
    };
    const abort = new AbortController();
    const tools = await toolsWith({ run });
    await tools.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace', agent: 'plan', abort: abort.signal });
    assert.equal(calls[0].signal, abort.signal);
    assert.equal(calls[1].signal, abort.signal);
  });

  test('rejects immediately when the session was already canceled', async () => {
    const calls = [];
    const run = async (options) => {
      calls.push(options);
      return authResult();
    };
    const abort = new AbortController();
    abort.abort();
    const tools = await toolsWith({ run });
    await assert.rejects(
      tools.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace', agent: 'build', abort: abort.signal }),
      /canceled/i
    );
    assert.equal(calls.length, 0);
  });

  test('rejects API-key, proxy, and non-subscription auth, naming what it found', async () => {
    for (const invalid of [
      { authMethod: 'api_key' },
      { apiProvider: 'bedrock' },
      { subscriptionType: 'api' },
      { loggedIn: false },
    ]) {
      const tools = await toolsWith({ run: async () => authResult(invalid) });
      await assert.rejects(
        tools.fusion_claude_status.execute({}, { directory: 'C:/workspace', agent: 'build' }),
        /first-party Claude Pro or Max/i
      );
    }
    const tools = await toolsWith({ run: async () => authResult({ authMethod: 'api_key' }) });
    await assert.rejects(
      tools.fusion_claude_status.execute({}, { directory: 'C:/workspace', agent: 'build' }),
      /found .*authMethod=api_key/i
    );
  });

  test('a failing auth check reports the exit code and stderr detail', async () => {
    const tools = await toolsWith({
      run: async () => ({ code: 1, stdout: '', stderr: 'boom: keychain locked\nsecond line' }),
    });
    await assert.rejects(
      tools.fusion_claude_status.execute({}, { directory: 'C:/workspace', agent: 'build' }),
      (error) => {
        assert.match(error.message, /exit code 1/);
        assert.match(error.message, /boom: keychain locked/);
        assert.doesNotMatch(error.message, /second line/);
        assert.match(error.message, /claude auth login/);
        return true;
      }
    );
  });

  test('rejects an unstructured review or a response from another model', async () => {
    const badSignal = await toolsWith({
      run: async (options) => options.args[0] === 'auth' ? authResult() : reviewResult('Looks good'),
    });
    await assert.rejects(
      badSignal.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace', agent: 'build' }),
      /required PLAN_APPROVED or PLAN_REVISE/i
    );

    const wrongModel = await toolsWith({
      run: async (options) => options.args[0] === 'auth'
        ? authResult()
        : { ...reviewResult(), stdout: JSON.stringify({ result: 'PLAN_APPROVED', modelUsage: { 'claude-sonnet-5': {} } }) },
    });
    await assert.rejects(
      wrongModel.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace', agent: 'build' }),
      /pinned claude-fable-5/i
    );
  });

  test('a missing claude executable produces an actionable install error', async () => {
    // No injected runner: this exercises the real spawn wrapper. The empty
    // PATH directory guarantees resolution fails on every platform.
    const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-claude-nobin-'));
    try {
      const tools = await toolsWith({ environment: { PATH: emptyBin } });
      await assert.rejects(
        tools.fusion_claude_status.execute({}, { directory: 'C:/workspace', agent: 'build' }),
        (error) => {
          assert.match(error.message, /native build/i);
          assert.match(error.message, /npm shim/i);
          return true;
        }
      );
    } finally {
      fs.rmSync(emptyBin, { recursive: true, force: true });
    }
  });
});
