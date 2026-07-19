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
  let createClaudeTools;

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
    ({ createClaudeTools } = await import(`${pathToFileURL(pluginCopy).href}?test=${Date.now()}`));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

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

  test('exposes only status and read-only plan review tools', () => {
    const tools = createClaudeTools({ run: async () => authResult() });
    assert.deepEqual(Object.keys(tools).sort(), ['fusion_claude_review', 'fusion_claude_status']);
  });

  test('status verifies first-party Pro/Max auth without returning identity data', async () => {
    const tools = createClaudeTools({ run: async () => authResult() });
    const output = await tools.fusion_claude_status.execute({}, { directory: 'C:/workspace' });
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
    const tools = createClaudeTools({ run, environment });
    const packet = 'Task and proposed plan';
    const output = await tools.fusion_claude_review.execute({ packet }, { worktree: 'C:/workspace' });

    assert.match(output, /PLAN_REVISE\nAdd a rollback test\./);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args, ['auth', 'status']);
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

  test('rejects API-key, proxy, and non-subscription auth', async () => {
    for (const invalid of [
      { authMethod: 'api_key' },
      { apiProvider: 'bedrock' },
      { subscriptionType: 'api' },
      { loggedIn: false },
    ]) {
      const tools = createClaudeTools({ run: async () => authResult(invalid) });
      await assert.rejects(
        tools.fusion_claude_status.execute({}, { directory: 'C:/workspace' }),
        /first-party Claude Pro or Max/i
      );
    }
  });

  test('rejects an unstructured review or a response from another model', async () => {
    const badSignal = createClaudeTools({
      run: async (options) => options.args[0] === 'auth' ? authResult() : reviewResult('Looks good'),
    });
    await assert.rejects(
      badSignal.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace' }),
      /required PLAN_APPROVED or PLAN_REVISE/i
    );

    const wrongModel = createClaudeTools({
      run: async (options) => options.args[0] === 'auth'
        ? authResult()
        : { ...reviewResult(), stdout: JSON.stringify({ result: 'PLAN_APPROVED', modelUsage: { 'claude-sonnet-5': {} } }) },
    });
    await assert.rejects(
      wrongModel.fusion_claude_review.execute({ packet: 'plan' }, { directory: 'C:/workspace' }),
      /pinned claude-fable-5/i
    );
  });
});
