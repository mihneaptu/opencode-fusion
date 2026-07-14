#!/usr/bin/env node
'use strict';

// Deterministic installer for the Fusion setup skill. The conversational
// skill decides WHAT to install (which roles, models, provider blocks) and
// produces a config fragment; this script owns HOW: timestamped backup,
// deep merge, atomic write, file copies, a manifest for undo, and
// validation. No model compliance involved in the mechanical steps.
//
// Usage (run from anywhere; paths below are resolved absolutely):
//   node install.js apply --config <fragment.json> [--roles a,b,c]
//                          [--extras commands,plugin] [--dry-run]
//                          [--config-dir <dir>]
//   node install.js undo   [--config-dir <dir>]
//
// --config-dir defaults to ~/.config/opencode (the global opencode config).
// The fragment is plain opencode.json content: model / provider / agent /
// any other top-level keys. It is deep-merged into the existing config,
// fragment winning on conflicts; nothing else in the user's config is
// touched. Exit code 0 = success, 1 = refused/failed with nothing changed
// beyond what the error message states.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const skillDir = path.join(__dirname, '..');
const MANIFEST = '.fusion-install.json';

// Roles with a bundled prompt file (explore is opencode's built-in agent
// and deliberately has none). Core roles install by default.
const CORE_ROLES = ['build', 'plan', 'sidekick'];
const OPTIONAL_ROLES = ['research', 'design', 'reviewer', 'vision'];
const EXTRAS = {
  commands: [
    { from: ['commands', 'fusion-setup.md'], to: ['commands', 'fusion-setup.md'] },
    { from: ['commands', 'fusion-status.md'], to: ['commands', 'fusion-status.md'] },
  ],
  plugin: [{ from: ['plugins', 'fusion-audit.js'], to: ['plugins', 'fusion-audit.js'] }],
};

function fail(message) {
  process.stderr.write(`fusion-install: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { roles: [...CORE_ROLES], extras: [], dryRun: false, configDir: null, config: null };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--config') opts.config = rest[++i];
    else if (arg === '--config-dir') opts.configDir = rest[++i];
    else if (arg === '--roles') opts.roles = rest[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--extras') opts.extras = rest[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else fail(`unknown argument: ${arg}`);
  }
  opts.configDir = path.resolve(
    opts.configDir || path.join(os.homedir(), '.config', 'opencode')
  );
  return { command, opts };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Deep merge b into a (b wins; arrays and scalars replace). Pure. */
function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = key in a ? deepMerge(a[key], value) : value;
  }
  return out;
}

function atomicWriteJson(target, data) {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, target);
}

function validateFragment(fragment) {
  if (!isPlainObject(fragment)) return 'fragment must be a JSON object';
  for (const key of ['provider', 'agent']) {
    if (key in fragment && !isPlainObject(fragment[key])) {
      return `fragment "${key}" must be an object`;
    }
  }
  if ('model' in fragment && typeof fragment.model !== 'string') {
    return 'fragment "model" must be a "provider/model-id" string';
  }
  return null;
}

/** Providers referenced by agent models but defined nowhere. Not fatal -
    opencode has built-in providers - but worth a loud warning. */
function unknownProviders(merged) {
  const defined = new Set(Object.keys(merged.provider || {}));
  const referenced = new Set();
  if (typeof merged.model === 'string') referenced.add(merged.model.split('/')[0]);
  for (const agent of Object.values(merged.agent || {})) {
    if (agent && typeof agent.model === 'string') referenced.add(agent.model.split('/')[0]);
  }
  return [...referenced].filter((p) => p && !defined.has(p));
}

function apply(opts) {
  if (!opts.config) fail('apply requires --config <fragment.json>');
  const known = new Set([...CORE_ROLES, ...OPTIONAL_ROLES]);
  for (const role of opts.roles) {
    if (!known.has(role)) fail(`unknown role "${role}" (known: ${[...known].join(', ')})`);
  }
  for (const extra of opts.extras) {
    if (!(extra in EXTRAS)) fail(`unknown extra "${extra}" (known: ${Object.keys(EXTRAS).join(', ')})`);
  }

  // 1. Validate everything BEFORE touching the filesystem.
  let fragment;
  try {
    fragment = JSON.parse(fs.readFileSync(path.resolve(opts.config), 'utf8'));
  } catch (err) {
    fail(`cannot read fragment: ${err.message}`);
  }
  const fragmentError = validateFragment(fragment);
  if (fragmentError) fail(fragmentError);

  const configPath = path.join(opts.configDir, 'opencode.json');
  let existing = {};
  let hadExistingConfig = false;
  if (fs.existsSync(configPath)) {
    hadExistingConfig = true;
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      fail(
        `existing ${configPath} is not valid JSON (${err.message}); refusing to touch it - fix or move it first`
      );
    }
  }
  const sources = [];
  for (const role of opts.roles) {
    const source = path.join(skillDir, 'agent', `${role}.md`);
    if (!fs.existsSync(source)) fail(`bundled prompt missing: ${source}`);
    sources.push({ from: source, to: path.join('agent', `${role}.md`) });
  }
  for (const extra of opts.extras) {
    for (const item of EXTRAS[extra]) {
      const source = path.join(skillDir, ...item.from);
      if (!fs.existsSync(source)) fail(`bundled extra missing: ${source}`);
      sources.push({ from: source, to: path.join(...item.to) });
    }
  }

  const merged = deepMerge(existing, fragment);
  const orphans = unknownProviders(merged);
  const backupName = hadExistingConfig
    ? `opencode.json.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`
    : null;

  // 2. Report the plan; stop here on --dry-run.
  const planLines = [
    `config dir:   ${opts.configDir}`,
    `backup:       ${backupName || '(no existing config - nothing to back up)'}`,
    `merge into:   opencode.json (${Object.keys(fragment).join(', ')})`,
    ...sources.map((s) => `install:      ${s.to}`),
  ];
  if (orphans.length > 0) {
    planLines.push(
      `WARNING:      model(s) reference provider(s) with no provider block: ${orphans.join(', ')} - fine only if opencode knows them natively`
    );
  }
  process.stdout.write(planLines.join('\n') + '\n');
  if (opts.dryRun) {
    process.stdout.write('dry run - nothing written\n');
    return;
  }

  // 3. Execute: backup, merge, copy, manifest, validate.
  fs.mkdirSync(opts.configDir, { recursive: true });
  if (backupName) fs.copyFileSync(configPath, path.join(opts.configDir, backupName));
  atomicWriteJson(configPath, merged);
  for (const { from, to } of sources) {
    const target = path.join(opts.configDir, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(from, target);
  }
  atomicWriteJson(path.join(opts.configDir, MANIFEST), {
    installedAt: new Date().toISOString(),
    backup: backupName,
    hadExistingConfig,
    roles: opts.roles,
    files: sources.map((s) => s.to.split(path.sep).join('/')),
  });

  JSON.parse(fs.readFileSync(configPath, 'utf8')); // final self-check
  for (const { to } of sources) {
    if (!fs.existsSync(path.join(opts.configDir, to))) fail(`post-check failed: ${to} missing`);
  }
  process.stdout.write('done - restart opencode to load the new config\n');
}

function undo(opts) {
  const manifestPath = path.join(opts.configDir, MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    fail(
      `no ${MANIFEST} in ${opts.configDir} - nothing recorded to undo; see the skill's manual removal steps`
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`manifest unreadable (${err.message}); undo manually per the skill instructions`);
  }

  const configPath = path.join(opts.configDir, 'opencode.json');
  if (manifest.backup) {
    const backupPath = path.join(opts.configDir, manifest.backup);
    if (!fs.existsSync(backupPath)) {
      fail(`recorded backup ${manifest.backup} is missing; undo manually`);
    }
    fs.copyFileSync(backupPath, configPath);
    process.stdout.write(`restored:     opencode.json from ${manifest.backup}\n`);
  } else if (!manifest.hadExistingConfig) {
    fs.rmSync(configPath, { force: true });
    process.stdout.write('removed:      opencode.json (there was none before install)\n');
  }
  for (const rel of manifest.files || []) {
    fs.rmSync(path.join(opts.configDir, ...rel.split('/')), { force: true });
    process.stdout.write(`removed:      ${rel}\n`);
  }
  fs.rmSync(manifestPath, { force: true });
  process.stdout.write('done - backups were kept; restart opencode\n');
}

const { command, opts } = parseArgs(process.argv.slice(2));
if (command === 'apply') apply(opts);
else if (command === 'undo') undo(opts);
else fail(`usage: install.js <apply|undo> [options] (got "${command || ''}")`);
