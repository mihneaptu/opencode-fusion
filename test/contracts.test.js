'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const agentDir = path.join(__dirname, '..', 'agent');

// Hand-rolled YAML helpers - not a general parser. Indent assumes 2-space YAML.

/** Split an agent source into frontmatter and body from a single parse, so the
    two can never disagree about where the closing --- sits. */
function parseAgentSource(source, fileName) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, `agent/${fileName} is missing YAML frontmatter delimiters`);
  return {
    frontmatter: match[1],
    body: source.slice(match[0].length).replace(/^\r?\n/, ''),
  };
}

function linesOf(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unquote(s) {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/** Immediate children under a named block; scalar form returns { scalar }. */
function findNamedBlock(frontmatter, blockName) {
  const lines = linesOf(frontmatter);
  const headerRe = new RegExp(`^(\\s*)${escapeRegExp(blockName)}:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRe);
    if (!m) continue;
    const indent = m[1].length;
    const inlineValue = m[2].trim();
    const children = [];
    if (inlineValue !== '') {
      return { children, scalar: unquote(inlineValue) };
    }
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      const lead = line.match(/^(\s*)/)[1].length;
      if (lead <= indent) break;
      if (lead !== indent + 2) continue;
      const childMatch = line.match(/^(\s*)(?:"([^"]+)"|'([^']+)'|([^:]+)):\s*(.*)$/);
      if (!childMatch) continue;
      children.push({
        key: (childMatch[2] ?? childMatch[3] ?? childMatch[4]).trim(),
        value: unquote(childMatch[5].trim()),
        index: j,
      });
    }
    return { children, scalar: null };
  }
  return null;
}

function normalizeWs(s) {
  return s.toLowerCase().replace(/\s+/g, ' ');
}

function bodyHasAny(body, phrases) {
  const n = normalizeWs(body);
  return phrases.some((p) => n.includes(normalizeWs(p)));
}

function bodyMentions(body, phrase) {
  return bodyHasAny(body, [phrase]);
}

function requireBlock(frontmatter, blockName, role) {
  const block = findNamedBlock(frontmatter, blockName);
  assert.ok(block, `contract violated: ${role} frontmatter missing ${blockName} block`);
  return block;
}

/** Map of a block's child keys to their values. */
function childValues(block) {
  return Object.fromEntries(block.children.map((c) => [c.key, c.value]));
}

function assertPermissionValue(role, key, expected) {
  const perm = requireBlock(agents[role].frontmatter, 'permission', role);
  const child = perm.children.find((c) => c.key === key);
  assert.ok(child, `contract violated: ${role} permission missing ${key}`);
  assert.equal(
    child.value,
    expected,
    `contract violated: ${role} permission.${key} must be ${expected}, got ${child.value}`
  );
}

function assertWildcardDenyFirst(block, role, blockName) {
  assert.ok(block.children.length > 0, `contract violated: ${role} ${blockName} has no child rules`);
  assert.equal(block.children[0].key, '*', `contract violated: ${role} ${blockName} wildcard deny must appear first`);
  assert.equal(block.children[0].value, 'deny', `contract violated: ${role} ${blockName} "*" must be deny`);
}

/** Wildcard deny first, then exactly the expected named allows (allow order free). No extra keys. */
function assertTaskMap(role, expectedAllows) {
  const task = requireBlock(agents[role].frontmatter, 'task', role);
  assertWildcardDenyFirst(task, role, 'task');
  const actual = childValues(task);
  const expected = { '*': 'deny' };
  for (const name of expectedAllows) expected[name] = 'allow';

  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `contract violated: ${role} task keys must be exactly * and ${expectedAllows.join(', ')} (got ${actualKeys.join(', ')})`
  );
  for (const key of expectedKeys) {
    assert.equal(
      actual[key],
      expected[key],
      `contract violated: ${role} task.${key} must be ${expected[key]}, got ${actual[key]}`
    );
  }
  // Allow ordering needs no separate check: assertWildcardDenyFirst pins the
  // wildcard deny to the first child, so every named allow follows it.
  return task;
}

function bashKeyMatchesCommand(key, cmd) {
  const k = key.toLowerCase();
  const c = cmd.toLowerCase();
  return k === c || k.startsWith(c + '*') || k.startsWith(c + ' ');
}

function wildcardMatches(pattern, command) {
  const normalizedPattern = pattern.replaceAll('\\', '/');
  const normalizedCommand = command.replaceAll('\\', '/');
  let source = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  if (source.endsWith(' .*')) {
    source = source.slice(0, -3) + '( .*)?';
  }
  const flags = process.platform === 'win32' ? 'si' : 's';
  return new RegExp(`^${source}$`, flags).test(normalizedCommand);
}

function resolveBashRule(block, command) {
  return block.children.reduce(
    (decision, rule) => wildcardMatches(rule.key, command) ? rule.value : decision,
    undefined
  );
}

const agentFiles = fs
  .readdirSync(agentDir)
  .filter((name) => name.endsWith('.md'))
  .sort();

const agents = Object.fromEntries(
  agentFiles.map((name) => {
    const source = fs.readFileSync(path.join(agentDir, name), 'utf8');
    return [name.replace(/\.md$/, ''), parseAgentSource(source, name)];
  })
);

const TASK_MAPS = {
  build: ['sidekick', 'explore', 'research', 'design', 'reviewer', 'vision'],
  plan: ['explore', 'research', 'reviewer'],
  sidekick: ['explore', 'research'],
};

const REQUIRED_AGENTS = [
  'build', 'plan', 'sidekick', 'research', 'reviewer', 'vision', 'design',
];

describe('agent frontmatter contracts', () => {
  test('loads every top-level agent/*.md source file', () => {
    assert.ok(
      agentFiles.length >= REQUIRED_AGENTS.length,
      `expected at least ${REQUIRED_AGENTS.length} agent files, got ${agentFiles.length}`
    );
    for (const required of REQUIRED_AGENTS) {
      assert.ok(agents[required], `missing agent/${required}.md`);
    }
  });

  test('no source agent frontmatter contains a model: field', () => {
    for (const [role, agent] of Object.entries(agents)) {
      const hasModel = linesOf(agent.frontmatter).some((line) => /^\s*model\s*:/.test(line));
      assert.equal(
        hasModel,
        false,
        `contract violated: agent/${role}.md frontmatter must not set model: (models live in opencode.json)`
      );
    }
  });

  test('build denies edit, grep, glob, and list', () => {
    for (const key of ['edit', 'grep', 'glob', 'list']) {
      assertPermissionValue('build', key, 'deny');
    }
  });

  test('build bash has wildcard deny before specific allows', () => {
    const bash = requireBlock(agents.build.frontmatter, 'bash', 'build');
    assertWildcardDenyFirst(bash, 'build', 'bash');
    // assertWildcardDenyFirst pins the deny to the first child, and children
    // are collected in line order, so any allow necessarily comes after it.
    const allows = bash.children.filter((c) => c.value === 'allow');
    assert.ok(
      allows.length > 0,
      'contract violated: build bash must allow some verification/git commands after the wildcard deny'
    );
  });

  for (const [role, expectedAllows] of Object.entries(TASK_MAPS)) {
    test(`${role} task map is wildcard deny plus exact named allows`, () => {
      const values = childValues(assertTaskMap(role, expectedAllows));
      // Guards on TASK_MAPS itself: these roles must never join the allow lists.
      if (role === 'build') {
        assert.notEqual(values.general, 'allow', 'contract violated: build task must not allow general');
      }
      if (role === 'plan') {
        assert.notEqual(
          values.sidekick,
          'allow',
          'contract violated: plan task must not allow sidekick (plan mode is non-executing)'
        );
      }
    });
  }

  test('plan bash has wildcard deny and does not allow git add/commit/push', () => {
    const bash = requireBlock(agents.plan.frontmatter, 'bash', 'plan');
    assertWildcardDenyFirst(bash, 'plan', 'bash');
    // Only inspect allow rules - an explicit deny for a forbidden command is fine.
    const allowKeys = bash.children.filter((c) => c.value === 'allow').map((c) => c.key);
    for (const cmd of ['git add', 'git commit', 'git push']) {
      assert.equal(
        allowKeys.some((k) => bashKeyMatchesCommand(k, cmd)),
        false,
        `contract violated: plan bash must not specifically allow ${cmd}`
      );
    }
  });

  test('sidekick has edit allow and force-push denial', () => {
    assertPermissionValue('sidekick', 'edit', 'allow');
    const bash = requireBlock(agents.sidekick.frontmatter, 'bash', 'sidekick');
    const forcePushDenies = bash.children.filter(
      (c) =>
        c.value === 'deny' &&
        (/git push --force/i.test(c.key) || /git push -f/i.test(c.key))
    );
    assert.ok(
      forcePushDenies.length >= 1,
      'contract violated: sidekick bash must retain explicit force-push denial'
    );
  });

  test('executors deny git commit and git push entirely', () => {
    for (const role of ['sidekick', 'design']) {
      const bash = requireBlock(agents[role].frontmatter, 'bash', role);
      const rules = childValues(bash);
      assert.equal(
        rules['git commit*'],
        'deny',
        `contract violated: ${role} bash must deny git commit* (committing belongs to the main agent)`
      );
      assert.equal(
        rules['git push*'],
        'deny',
        `contract violated: ${role} bash must deny git push* (pushing belongs to the main agent)`
      );
      for (const command of [
        'git commit -m change',
        'git -C . commit -m change',
        'git --git-dir .git push origin main',
        'env git push origin main',
      ]) {
        assert.equal(
          resolveBashRule(bash, command),
          'deny',
          `contract violated: ${role} must deny common git wrapper form: ${command}`
        );
      }
    }
  });

  test('build asks on commit/push and denies dangerous push variants after git push*', () => {
    const bash = requireBlock(agents.build.frontmatter, 'bash', 'build');
    const rules = childValues(bash);
    assert.equal(rules['git add*'], 'allow', 'contract violated: build bash must allow git add*');
    assert.equal(rules['git commit*'], 'ask', 'contract violated: build bash git commit* must be ask');
    assert.equal(rules['git push*'], 'ask', 'contract violated: build bash git push* must be ask');
    for (const command of [
      'git push origin feature',
      'git push origin feature--force',
      'git push origin feature--mirror',
      'git push origin feature--delete',
      'git push origin feature--prune',
    ]) {
      assert.equal(
        resolveBashRule(bash, command),
        'ask',
        `contract violated: an ordinary push must require approval: ${command}`
      );
    }
    for (const command of [
      'git push --force origin main',
      'git push -f origin main',
      'git push -uf origin main',
      'git push -d origin retired',
      'git push --delete origin retired',
      'git push --prune origin',
      'git push origin --prune',
      'git push --mir origin',
      'git push origin --mir',
      'git push origin :retired',
      'git push origin +main',
    ]) {
      assert.equal(
        resolveBashRule(bash, command),
        'deny',
        `contract violated: dangerous push must be denied: ${command}`
      );
    }
    // opencode resolves overlapping bash patterns last-match-wins, so every
    // push deny must appear AFTER the broad "git push*" ask to actually win.
    const pushAsk = bash.children.find((c) => c.key === 'git push*');
    const pushDenies = bash.children.filter(
      (c) => c.value === 'deny' && c.key.startsWith('git push')
    );
    assert.ok(pushDenies.length >= 4, 'contract violated: build bash must keep the dangerous-push denylist');
    for (const deny of pushDenies) {
      assert.ok(
        deny.index > pushAsk.index,
        `contract violated: ${deny.key} deny must appear after "git push*" (last-match-wins)`
      );
    }
  });

  test('design is fenced to the workspace', () => {
    assertPermissionValue('design', 'external_directory', 'deny');
  });

  test('design has edit allow and the destructive-command denylist', () => {
    assertPermissionValue('design', 'edit', 'allow');
    const bash = requireBlock(agents.design.frontmatter, 'bash', 'design');
    assert.equal(bash.scalar, null, 'contract violated: design bash must be a rule map, not a bare allow');
    const forcePushDenies = bash.children.filter(
      (c) =>
        c.value === 'deny' &&
        (/git push --force/i.test(c.key) || /git push -f/i.test(c.key))
    );
    assert.ok(
      forcePushDenies.length >= 1,
      'contract violated: design bash must deny force-push'
    );
    const envDenies = bash.children.filter(
      (c) => c.value === 'deny' && /\.env/i.test(c.key)
    );
    assert.ok(envDenies.length >= 1, 'contract violated: design bash must deny .env reads');
  });

  test('research and reviewer have edit: deny', () => {
    for (const role of ['research', 'reviewer']) {
      assertPermissionValue(role, 'edit', 'deny');
    }
  });

  test('vision is hidden and has task: deny', () => {
    const fm = agents.vision.frontmatter;
    const hiddenLine = linesOf(fm).find((line) => /^\s*hidden\s*:/.test(line));
    assert.ok(hiddenLine, 'contract violated: vision frontmatter must set hidden');
    const hiddenValue = unquote(hiddenLine.split(':').slice(1).join(':').trim());
    assert.equal(hiddenValue, 'true', `contract violated: vision hidden must be true, got ${hiddenValue}`);

    const task = findNamedBlock(fm, 'task');
    assert.ok(task, 'contract violated: vision frontmatter missing task');
    if (task.scalar !== null) {
      assert.equal(task.scalar, 'deny', `contract violated: vision task must be deny, got ${task.scalar}`);
      return;
    }
    const values = childValues(task);
    assert.equal(
      values['*'],
      'deny',
      'contract violated: vision task map must deny spawning further agents with "*": deny'
    );
    assert.equal(
      task.children.some((c) => c.value === 'allow'),
      false,
      'contract violated: vision task must not allow any subagent'
    );
  });
});

describe('build.md body preservation contracts', () => {
  const body = agents.build.body;
  const lower = body.toLowerCase();

  test('five-part spec contract remains (Objective, Files, Interfaces, Constraints, Verification)', () => {
    const parts = ['objective', 'files', 'interfaces', 'constraints', 'verification'];
    const missing = parts.filter((p) => !lower.includes(p));
    assert.deepEqual(
      missing,
      [],
      `contract violated: build.md must preserve the five-part spec contract; missing: ${missing.join(', ')}`
    );
    const framed =
      bodyMentions(body, 'spec contract') ||
      bodyMentions(body, 'five-part') ||
      bodyMentions(body, 'five part') ||
      (bodyMentions(body, 'precise spec') && bodyMentions(body, 'objective'));
    assert.ok(framed, 'contract violated: build.md must still frame the five-part delegation spec contract');
  });

  test('independent tasks are parallelized', () => {
    assert.ok(lower.includes('independent'), 'contract violated: build.md missing independent');
    assert.ok(lower.includes('parallel'), 'contract violated: build.md missing parallel');
    assert.ok(
      bodyHasAny(body, ['one message', 'concurrently', 'in one turn', 'same message']),
      'contract violated: build.md must still instruct spawning independent tasks together'
    );
  });

  test('two failed sidekick attempts trigger an exact dictated patch', () => {
    assert.ok(
      bodyHasAny(body, [
        'twice', 'two times', 'second miss', 'misses the spec twice',
        'second failed attempt', 'after the second failed attempt',
        'two failed', 'two failures', 'failed twice', 'second failure',
      ]),
      'contract violated: build.md must still describe the two-failure threshold'
    );
    assert.ok(
      bodyHasAny(body, ['dictate', 'dictated', 'dictation', 'verbatim']),
      'contract violated: build.md must still require dictating an exact/verbatim patch'
    );
    assert.ok(
      bodyHasAny(body, ['exact', 'verbatim', 'replacement text']),
      'contract violated: build.md must still require an exact/verbatim dictated patch'
    );
  });

  test('main performs final verification using real command output', () => {
    assert.ok(
      bodyHasAny(body, ['verify', 'verification', 'final review']),
      'contract violated: build.md must still require final verification'
    );
    const hasRealOutput =
      bodyMentions(body, 'real command output') ||
      bodyMentions(body, 'real output') ||
      (lower.includes('command output') && lower.includes('not') && lower.includes('summary'));
    assert.ok(
      hasRealOutput,
      'contract violated: build.md must still require real command output, not the sidekick summary'
    );
  });

  test('bash commands are not chained', () => {
    assert.ok(
      bodyHasAny(body, ['never chain', 'do not chain', 'not chain', 'without chaining']),
      'contract violated: build.md must still forbid chaining bash commands'
    );
    // Require a meaningful concrete operator, not ordinary punctuation like ; or |.
    assert.ok(
      ['&&', '||'].some((op) => body.includes(op)),
      'contract violated: build.md must still name a meaningful bash chaining operator (&& or ||)'
    );
  });

  test('restrictions are not narrated to the user', () => {
    const hasRule =
      bodyHasAny(body, [
        'do not narrate', "don't narrate", 'never tell the user you', 'never narrate',
      ]) ||
      (lower.includes('narrate') && lower.includes('restriction'));
    assert.ok(hasRule, 'contract violated: build.md must still forbid narrating restrictions to the user');
    const anchors = ['cannot edit', 'cannot search', 'tools are locked', 'locked down'];
    assert.ok(
      anchors.some((a) => lower.includes(a)),
      `contract violated: build.md must still name a concrete restriction phrase (e.g. ${anchors[0]})`
    );
  });
});
