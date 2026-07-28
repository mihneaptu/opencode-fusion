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
const {
  createEnv,
  runOpencode,
  opencodeAvailable,
  opencodeBin,
  toolName,
  taskArgs,
} = require('./opencode-env');

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

// Tools whose absence from a restricted agent is real evidence: an
// unrestricted agent is offered them, so their absence is the permission layer
// removing them. Asserted with the inconclusive guard below.
const DENIED_REAL_TOOLS = ['edit', 'write', 'grep', 'glob'];

// Names this project also refuses to see, which no release under test offers
// to anyone: v1 has no apply_patch and neither has list; v2 has neither. Their
// absence proves nothing about enforcement, so they are asserted defensively
// (a future release adding one under a mutating alias should fail this suite)
// and deliberately kept out of the evidence-bearing list above.
const ABSENT_ALIAS_TOOLS = ['apply_patch', 'list'];

// v2 renamed bash -> shell and task -> subagent. Resolve those two through the
// harness so the same assertions run against either binary; every other name
// below is identical in v1 and v2.
const BASH = toolName('bash');
const TASK = toolName('task');

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

/** Route that makes build delegate to the sidekick once, then stop. */
function delegationRoute({ agent, description, prompt, sidekickReply }) {
  return (body) => {
    if (!Array.isArray(body.tools)) return { text: 'title' };
    if (systemText(body).includes(SIDEKICK_MARKER)) return { text: sidekickReply };
    if (toolResults(body).length === 0) {
      return { tool: { name: TASK, args: taskArgs({ agent, description, prompt }) } };
    }
    return { text: 'delegation observed' };
  };
}

// A "denied tool is absent" assertion only proves enforcement when the tool
// exists to begin with. If a release ever drops one outright, that assertion
// would pass while the permission layer did nothing - green for the wrong
// reason. Sidekick denies none of these tools, so its schema is the reference
// for what the binary under test actually offers.
let offeredToSidekick = null;
async function binaryToolSurface() {
  if (offeredToSidekick) return offeredToSidekick;
  const route = delegationRoute({
    agent: 'sidekick',
    description: 'tool inventory probe',
    prompt: 'reply with a short confirmation and stop',
    sidekickReply: 'sidekick reporting in',
  });
  const { provider } = await captureSchema('build', route);
  const sidekickReq = agentRequests(provider).find((b) =>
    systemText(b).includes(SIDEKICK_MARKER)
  );
  assert.ok(
    sidekickReq,
    `could not inventory ${opencodeBin()}'s tool surface - the sidekick session never ran`
  );
  offeredToSidekick = toolNames(sidekickReq);
  return offeredToSidekick;
}

/** Assert a denied tool is absent AND that its absence is enforcement rather
    than the tool not existing in this release. */
function assertDeniedAndReal(tools, denied, surface, role) {
  assert.ok(
    !tools.includes(denied),
    `${role} was offered denied tool "${denied}" (schema: ${tools.join(', ')})`
  );
  assert.ok(
    surface.includes(denied),
    `inconclusive: "${denied}" is absent from ${role}, but ${opencodeBin()} does not offer it to an unrestricted agent either, so its absence proves nothing about enforcement (surface: ${surface.join(', ')})`
  );
}

/** Assert a name this project refuses to see is absent, without claiming the
    absence proves enforcement. Catches a release that adds a mutating alias. */
function assertAbsent(tools, name, role) {
  assert.ok(
    !tools.includes(name),
    `${role} was offered "${name}", which this suite expects no release to provide (schema: ${tools.join(', ')})`
  );
}

describe('live permission enforcement (real opencode, fake provider)', { skip }, () => {
  test('build agent tool schema has no mutation or search tools', async () => {
    const surface = await binaryToolSurface();
    const { provider, result } = await captureSchema('build');
    assert.equal(result.code, 0, `opencode exited ${result.code}: ${result.stderr.slice(-800)}`);
    const requests = agentRequests(provider);
    assert.ok(requests.length >= 1, 'no tool-bearing request reached the fake provider');
    const tools = toolNames(requests[0]);
    for (const denied of DENIED_REAL_TOOLS) {
      assertDeniedAndReal(tools, denied, surface, 'build agent');
    }
    for (const name of ABSENT_ALIAS_TOOLS) assertAbsent(tools, name, 'build agent');
    for (const required of [BASH, 'read', TASK]) {
      assert.ok(
        tools.includes(required),
        `build agent is missing expected tool "${required}" (schema: ${tools.join(', ')})`
      );
    }
  });

  test('plan agent tool schema has no mutation or search tools', async () => {
    const surface = await binaryToolSurface();
    const { provider, result } = await captureSchema('plan');
    assert.equal(result.code, 0, `opencode exited ${result.code}: ${result.stderr.slice(-800)}`);
    const requests = agentRequests(provider);
    assert.ok(requests.length >= 1, 'no tool-bearing request reached the fake provider');
    const tools = toolNames(requests[0]);
    for (const denied of DENIED_REAL_TOOLS) {
      assertDeniedAndReal(tools, denied, surface, 'plan agent');
    }
    for (const name of ABSENT_ALIAS_TOOLS) assertAbsent(tools, name, 'plan agent');
    for (const required of ['read', TASK]) {
      assert.ok(
        tools.includes(required),
        `plan agent is missing expected tool "${required}" (schema: ${tools.join(', ')})`
      );
    }
  });

  test('build delegates to sidekick, whose schema includes the edit tools', async () => {
    // Script: build's first turn calls task(sidekick); the sidekick turn
    // replies text; build's follow-up (carrying the tool result) stops.
    const route = delegationRoute({
      agent: 'sidekick',
      description: 'integration delegation probe',
      prompt: 'reply with a short confirmation and stop',
      sidekickReply: 'sidekick reporting in',
    });
    const { provider, result } = await captureSchema('build', route);
    assert.equal(result.code, 0, `opencode exited ${result.code}: ${result.stderr.slice(-800)}`);

    const sidekickReq = agentRequests(provider).find((b) =>
      systemText(b).includes(SIDEKICK_MARKER)
    );
    assert.ok(sidekickReq, 'sidekick session never called the model - task delegation did not run');
    const tools = toolNames(sidekickReq);
    for (const required of ['edit', 'write', BASH, 'grep', 'glob']) {
      assert.ok(
        tools.includes(required),
        `sidekick is missing executor tool "${required}" (schema: ${tools.join(', ')})`
      );
    }
  });

  test('plan cannot spawn the sidekick (task graph denies it live)', async () => {
    // Meaningful only because the same call succeeds from build (asserted
    // above): the denial comes from plan's task graph, not a missing tool.
    const route = delegationRoute({
      agent: 'sidekick',
      description: 'forbidden delegation probe',
      prompt: 'this must be rejected by the permission layer',
      sidekickReply: 'should never run',
    });
    const { provider } = await captureSchema('plan', route);
    const surface = await binaryToolSurface();
    assert.ok(
      surface.includes(TASK),
      `inconclusive: ${opencodeBin()} offers no "${TASK}" tool at all, so plan failing to delegate proves nothing (surface: ${surface.join(', ')})`
    );

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
