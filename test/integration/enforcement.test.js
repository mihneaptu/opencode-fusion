'use strict';

// Live integration tests: start the REAL opencode binary against a fake
// OpenAI-compatible provider and assert that the Fusion permission layer
// actually enforces what the agent files declare. The fake provider captures
// every request opencode sends, including the tool schema offered to the
// model - so "edit is denied" is asserted on the wire, not on the YAML.
//
// Gated behind FUSION_INTEGRATION=1 (needs an opencode binary on PATH):
//   npm run test:integration
// Plain `npm test` skips this file and stays hermetic.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { FakeProvider, toolNames, systemText, toolResults } = require('./fake-provider');
const { createEnv, runOpencode, opencodeAvailable } = require('./opencode-env');

const enabled = process.env.FUSION_INTEGRATION === '1';
const available = !enabled || opencodeAvailable();
if (enabled && !available) {
  test('FUSION_INTEGRATION=1 requires an opencode binary on PATH', () => {
    assert.fail('FUSION_INTEGRATION=1 but no opencode binary is available on PATH');
  });
}
const skip = enabled
  ? available
    ? false
    : 'opencode availability is reported by the failing precondition test'
  : 'set FUSION_INTEGRATION=1 (runs the real opencode binary)';

const MUTATION_TOOLS = ['edit', 'write', 'apply_patch'];
const SEARCH_TOOLS = ['grep', 'glob', 'list'];

// The build prompt also mentions "SIDEKICK", so a sidekick session is
// identified by the sidekick prompt's own opening line, nothing looser.
const SIDEKICK_MARKER = 'You are the SIDEKICK';

/** Captured requests that carry a tool schema (drops title generation). */
function agentRequests(provider) {
  return provider.requests.filter((b) => Array.isArray(b.tools));
}

async function captureSchema(agent, route = () => ({ text: 'ok' })) {
  const provider = new FakeProvider(route);
  const baseURL = await provider.start();
  const envInfo = await createEnv(baseURL);
  try {
    const result = await runOpencode({ agent, message: 'integration probe', envInfo });
    return { provider, result };
  } finally {
    envInfo.cleanup();
    await provider.stop();
  }
}

describe('live permission enforcement (real opencode, fake provider)', { skip }, () => {
  test('build agent tool schema has no mutation or search tools', async () => {
    const { provider, result } = await captureSchema('build');
    assert.equal(result.code, 0, `opencode exited ${result.code}: ${result.stderr.slice(-800)}`);
    const requests = agentRequests(provider);
    assert.ok(requests.length >= 1, 'no tool-bearing request reached the fake provider');
    const tools = toolNames(requests[0]);
    for (const denied of [...MUTATION_TOOLS, ...SEARCH_TOOLS]) {
      assert.ok(
        !tools.includes(denied),
        `build agent was offered denied tool "${denied}" (schema: ${tools.join(', ')})`
      );
    }
    for (const required of ['bash', 'read', 'task']) {
      assert.ok(
        tools.includes(required),
        `build agent is missing expected tool "${required}" (schema: ${tools.join(', ')})`
      );
    }
  });

  test('plan agent tool schema has no mutation or search tools', async () => {
    const { provider, result } = await captureSchema('plan');
    assert.equal(result.code, 0, `opencode exited ${result.code}: ${result.stderr.slice(-800)}`);
    const requests = agentRequests(provider);
    assert.ok(requests.length >= 1, 'no tool-bearing request reached the fake provider');
    const tools = toolNames(requests[0]);
    for (const denied of [...MUTATION_TOOLS, ...SEARCH_TOOLS]) {
      assert.ok(
        !tools.includes(denied),
        `plan agent was offered denied tool "${denied}" (schema: ${tools.join(', ')})`
      );
    }
    for (const required of ['read', 'task']) {
      assert.ok(
        tools.includes(required),
        `plan agent is missing expected tool "${required}" (schema: ${tools.join(', ')})`
      );
    }
  });

  test('build delegates to sidekick, whose schema includes the edit tools', async () => {
    // Script: build's first turn calls task(sidekick); the sidekick turn
    // replies text; build's follow-up (carrying the tool result) stops.
    const route = (body) => {
      if (!Array.isArray(body.tools)) return { text: 'title' };
      if (systemText(body).includes(SIDEKICK_MARKER)) return { text: 'sidekick reporting in' };
      if (toolResults(body).length === 0) {
        return {
          tool: {
            name: 'task',
            args: {
              description: 'integration delegation probe',
              prompt: 'reply with a short confirmation and stop',
              subagent_type: 'sidekick',
            },
          },
        };
      }
      return { text: 'delegation observed' };
    };
    const { provider, result } = await captureSchema('build', route);
    assert.equal(result.code, 0, `opencode exited ${result.code}: ${result.stderr.slice(-800)}`);

    const sidekickReq = agentRequests(provider).find((b) =>
      systemText(b).includes(SIDEKICK_MARKER)
    );
    assert.ok(sidekickReq, 'sidekick session never called the model - task delegation did not run');
    const tools = toolNames(sidekickReq);
    for (const required of ['edit', 'write', 'bash', 'grep', 'glob']) {
      assert.ok(
        tools.includes(required),
        `sidekick is missing executor tool "${required}" (schema: ${tools.join(', ')})`
      );
    }
  });

  test('plan cannot spawn the sidekick (task graph denies it live)', async () => {
    const route = (body) => {
      if (!Array.isArray(body.tools)) return { text: 'title' };
      if (systemText(body).includes(SIDEKICK_MARKER)) return { text: 'should never run' };
      if (toolResults(body).length === 0) {
        return {
          tool: {
            name: 'task',
            args: {
              description: 'forbidden delegation probe',
              prompt: 'this must be rejected by the permission layer',
              subagent_type: 'sidekick',
            },
          },
        };
      }
      return { text: 'done' };
    };
    const { provider } = await captureSchema('plan', route);

    const sidekickReq = agentRequests(provider).find((b) =>
      systemText(b).includes(SIDEKICK_MARKER)
    );
    assert.equal(sidekickReq, undefined, 'plan spawned a sidekick session - task graph not enforced');

    // The denial must come back to plan as a tool error, not a silent drop.
    const followUp = agentRequests(provider).find((b) => toolResults(b).length > 0);
    assert.ok(followUp, 'plan never received a tool result for the denied task call');
    const resultText = JSON.stringify(toolResults(followUp));
    assert.match(
      resultText,
      /denied|not allowed|permission|rejected|error|unable|forbidden/i,
      `expected a denial-style tool result, got: ${resultText.slice(0, 400)}`
    );
  });
});
