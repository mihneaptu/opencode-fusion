#!/usr/bin/env node
'use strict';

// Deterministic installer for the Fusion setup skill. The conversational
// skill decides WHAT to install; this script owns HOW: validation, backup,
// deep merge, atomic writes, exact ownership tracking, and reversible undo.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const skillDir = path.join(__dirname, '..');
const MANIFEST = '.fusion-install.json';
const MANIFEST_VERSION = 2;
const CORE_ROLES = ['build', 'plan', 'sidekick'];
const OPTIONAL_ROLES = ['research', 'design', 'reviewer', 'vision'];
const ALL_ROLES = [...CORE_ROLES, ...OPTIONAL_ROLES];
const MODEL_MODALITIES = new Set(['text', 'audio', 'image', 'video', 'pdf']);
// Bundled extras: the same skill-relative path is both source and destination.
const EXTRAS = {
  commands: ['commands/fusion-setup.md', 'commands/fusion-status.md'],
  plugin: ['plugins/fusion-audit.js'],
};
const KNOWN_DESTINATIONS = new Set([
  ...ALL_ROLES.map((role) => `agent/${role}.md`),
  ...Object.values(EXTRAS).flat(),
]);
// Bundled subscription profiles: ready-made config fragments shipped with
// the skill, selected by name via --profile.
const PROFILES_DIR = path.join(skillDir, 'profiles');
const PROFILE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function fail(message) {
  throw new Error(message);
}

function optionValue(rest, index, option) {
  const value = rest[index + 1];
  if (!value || value.startsWith('--')) fail(`${option} requires a value`);
  return value;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { roles: [...CORE_ROLES], rolesExplicit: false, extras: [], dryRun: false, configDir: null, config: null, profile: null };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--config') opts.config = optionValue(rest, i++, arg);
    else if (arg === '--profile') opts.profile = optionValue(rest, i++, arg);
    else if (arg === '--config-dir') opts.configDir = optionValue(rest, i++, arg);
    else if (arg === '--roles') {
      opts.rolesExplicit = true;
      opts.roles = optionValue(rest, i++, arg).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--extras') {
      opts.extras = optionValue(rest, i++, arg).split(',').map((s) => s.trim()).filter(Boolean);
    } else fail(`unknown argument: ${arg}`);
  }
  opts.configDir = path.resolve(opts.configDir || path.join(os.homedir(), '.config', 'opencode'));
  return { command, opts };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = key in a ? deepMerge(a[key], value) : value;
  }
  return out;
}

function validModelReference(value) {
  return typeof value === 'string' && /^[^/\s]+\/\S+$/.test(value);
}

function validateConfigObject(value, label) {
  if (!isPlainObject(value)) return `${label} must be a JSON object`;
  if ('$schema' in value && typeof value.$schema !== 'string') {
    return `${label} "$schema" must be a string`;
  }
  if ('enabled_providers' in value && (
    !Array.isArray(value.enabled_providers)
    || value.enabled_providers.some((provider) => typeof provider !== 'string' || !provider)
  )) return `${label} "enabled_providers" must be an array of provider ids`;
  if ('compaction' in value) {
    if (!isPlainObject(value.compaction)) return `${label} "compaction" must be an object`;
    if ('prune' in value.compaction && typeof value.compaction.prune !== 'boolean') {
      return `${label} "compaction.prune" must be a boolean`;
    }
  }
  if ('provider' in value && !isPlainObject(value.provider)) {
    return `${label} "provider" must be an object`;
  }
  if ('agent' in value && !isPlainObject(value.agent)) {
    return `${label} "agent" must be an object`;
  }
  for (const key of ['model', 'small_model']) {
    if (key in value && !validModelReference(value[key])) {
      return `${label} "${key}" must be a "provider/model-id" string`;
    }
  }
  for (const [name, provider] of Object.entries(value.provider || {})) {
    if (!isPlainObject(provider)) return `${label} provider "${name}" must be an object`;
    for (const key of ['npm', 'name']) {
      if (key in provider && (typeof provider[key] !== 'string' || !provider[key])) {
        return `${label} provider "${name}.${key}" must be a non-empty string`;
      }
    }
    if ('options' in provider && !isPlainObject(provider.options)) {
      return `${label} provider "${name}.options" must be an object`;
    }
    for (const key of ['baseURL', 'apiKey']) {
      if (provider.options && key in provider.options
        && (typeof provider.options[key] !== 'string' || !provider.options[key])) {
        return `${label} provider "${name}.options.${key}" must be a non-empty string`;
      }
    }
    if ('models' in provider) {
      if (!isPlainObject(provider.models)) {
        return `${label} provider "${name}.models" must be an object`;
      }
      for (const [modelId, model] of Object.entries(provider.models)) {
        if (!isPlainObject(model)) {
          return `${label} provider model "${name}/${modelId}" must be an object`;
        }
        for (const key of ['options', 'limit', 'variants', 'modalities']) {
          if (key in model && !isPlainObject(model[key])) {
            return `${label} provider model "${name}/${modelId}.${key}" must be an object`;
          }
        }
        if ('name' in model && (typeof model.name !== 'string' || !model.name)) {
          return `${label} provider model "${name}/${modelId}.name" must be a non-empty string`;
        }
        if ('attachment' in model && typeof model.attachment !== 'boolean') {
          return `${label} provider model "${name}/${modelId}.attachment" must be a boolean`;
        }
        if (model.modalities) {
          for (const key of ['input', 'output']) {
            if (key in model.modalities && (
              !Array.isArray(model.modalities[key])
              || model.modalities[key].some((modality) => !MODEL_MODALITIES.has(modality))
            )) return `${label} provider model "${name}/${modelId}.modalities.${key}" must be an array of supported modalities`;
          }
        }
        if (model.limit) {
          for (const key of ['context', 'output']) {
            if (!Number.isInteger(model.limit[key]) || model.limit[key] <= 0) {
              return `${label} provider model "${name}/${modelId}.limit" must contain positive integer context and output values`;
            }
          }
        }
      }
    }
  }
  for (const [name, agent] of Object.entries(value.agent || {})) {
    if (!isPlainObject(agent)) return `${label} agent "${name}" must be an object`;
    if ('model' in agent && !validModelReference(agent.model)) {
      return `${label} agent "${name}" model must be a "provider/model-id" string`;
    }
    if ('permission' in agent
      && !isPlainObject(agent.permission)
      && !['allow', 'ask', 'deny'].includes(agent.permission)) {
      return `${label} agent "${name}.permission" must be an object or allow/ask/deny`;
    }
    if ('options' in agent && !isPlainObject(agent.options)) {
      return `${label} agent "${name}.options" must be an object`;
    }
    if ('mode' in agent && typeof agent.mode !== 'string') {
      return `${label} agent "${name}.mode" must be a string`;
    }
    if ('steps' in agent && (!Number.isInteger(agent.steps) || agent.steps <= 0)) {
      return `${label} agent "${name}.steps" must be a positive integer`;
    }
  }
  return null;
}

function unknownProviders(config) {
  const defined = new Set(Object.keys(config.provider || {}));
  const referenced = new Set();
  for (const model of [config.model, config.small_model]) {
    if (validModelReference(model)) referenced.add(model.split('/')[0]);
  }
  for (const agent of Object.values(config.agent || {})) {
    if (validModelReference(agent.model)) referenced.add(agent.model.split('/')[0]);
  }
  return [...referenced].filter((provider) => !defined.has(provider));
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function snapshotFile(target, label = target) {
  if (!fs.existsSync(target)) return { existed: false, bytes: null, mode: null };
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be a regular file, not a symlink or directory`);
  return { existed: true, bytes: fs.readFileSync(target), mode: stat.mode & 0o777 };
}

function recordFromSnapshot(rel, snapshot) {
  return {
    path: rel,
    existed: snapshot.existed,
    originalContent: snapshot.existed ? snapshot.bytes.toString('base64') : null,
    originalMode: snapshot.existed ? snapshot.mode : null,
    installedHash: '',
    installedMode: null,
  };
}

function decodeOriginal(record, label) {
  if (!record.existed) return null;
  const bytes = Buffer.from(record.originalContent, 'base64');
  if (bytes.toString('base64') !== record.originalContent) {
    fail(`manifest has invalid original content for ${label}`);
  }
  return bytes;
}

function safeRelativePath(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || path.posix.isAbsolute(rel)) return false;
  const parts = rel.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..');
}

function targetFor(configDir, rel) {
  if (!safeRelativePath(rel)) fail(`manifest contains unsafe path "${rel}"`);
  const target = path.resolve(configDir, ...rel.split('/'));
  const prefix = `${path.resolve(configDir)}${path.sep}`;
  if (!target.startsWith(prefix)) fail(`manifest path "${rel}" points outside the config directory`);
  return target;
}

function inspectConfigDir(configDir) {
  if (!fs.existsSync(configDir)) return;
  const stat = fs.lstatSync(configDir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(`config directory ${configDir} must be a directory, not a symlink or file`);
  }
}

function inspectDestination(configDir, rel) {
  const target = targetFor(configDir, rel);
  let current = configDir;
  for (const part of rel.split('/').slice(0, -1)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) break;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail(`destination parent for ${rel} must be a directory, not a symlink or file`);
    }
  }
  if (fs.existsSync(target)) snapshotFile(target, rel);
  return target;
}

function validateStateRecord(record, label, withPath) {
  if (!isPlainObject(record)) fail(`manifest has invalid ${label} record`);
  if (withPath && (!safeRelativePath(record.path) || !KNOWN_DESTINATIONS.has(record.path))) {
    fail(`manifest contains unsafe or unknown path "${record.path}"`);
  }
  if (typeof record.existed !== 'boolean') fail(`manifest has invalid ${label} existed flag`);
  if (record.existed) {
    if (typeof record.originalContent !== 'string') fail(`manifest has invalid ${label} original content`);
    decodeOriginal(record, label);
    if (!Number.isInteger(record.originalMode) || record.originalMode < 0 || record.originalMode > 0o777) {
      fail(`manifest has invalid ${label} original mode`);
    }
  } else if (record.originalContent !== null || record.originalMode !== null) {
    fail(`manifest has invalid ${label} original state`);
  }
  if (typeof record.installedHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.installedHash)) {
    fail(`manifest has invalid ${label} installed hash`);
  }
  if (!Number.isInteger(record.installedMode) || record.installedMode < 0 || record.installedMode > 0o777) {
    fail(`manifest has invalid ${label} installed mode`);
  }
}

function readManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`manifest unreadable (${err.message}); undo manually per the skill instructions`);
  }
  if (!isPlainObject(manifest) || manifest.version !== MANIFEST_VERSION) {
    fail(`manifest version is unsupported or invalid; undo manually per the skill instructions`);
  }
  if (!Array.isArray(manifest.roles) || manifest.roles.some((role) => !ALL_ROLES.includes(role))) {
    fail('manifest has invalid roles');
  }
  if (!Array.isArray(manifest.backups) || manifest.backups.some((name) => {
    return typeof name !== 'string' || !/^opencode\.json\.backup\.[^/\\]+$/.test(name);
  })) fail('manifest has invalid backup names');
  validateStateRecord(manifest.config, 'opencode.json', false);
  if (!Array.isArray(manifest.files)) fail('manifest has invalid files');
  const seen = new Set();
  for (const record of manifest.files) {
    validateStateRecord(record, 'file', true);
    if (seen.has(record.path)) fail(`manifest contains duplicate path "${record.path}"`);
    seen.add(record.path);
  }
  return manifest;
}

function assertOwned(target, expectedHash, expectedMode, label) {
  const snapshot = snapshotFile(target, label);
  if (!snapshot.existed || hash(snapshot.bytes) !== expectedHash || snapshot.mode !== expectedMode) {
    fail(`${label} was modified after Fusion installed it; refusing to overwrite or remove it`);
  }
}

function installedMode(mode) {
  if (process.platform !== 'win32') return mode;
  return mode & 0o222 ? 0o666 : 0o444;
}

function ensureParent(target, createdDirs) {
  const missing = [];
  let current = path.dirname(target);
  while (!fs.existsSync(current)) {
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const dir of missing.reverse()) createdDirs.push(dir);
}

function atomicWrite(target, bytes, mode, createdDirs) {
  ensureParent(target, createdDirs);
  const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, bytes, { flag: 'wx', mode });
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function restoreSnapshot(target, snapshot, createdDirs) {
  if (snapshot.existed) atomicWrite(target, snapshot.bytes, snapshot.mode, createdDirs);
  else fs.rmSync(target, { force: true });
}

function executeTransaction(operations, verify = () => {}) {
  const snapshots = new Map();
  const createdDirs = [];
  for (const operation of operations) {
    if (!snapshots.has(operation.target)) snapshots.set(operation.target, snapshotFile(operation.target));
  }
  try {
    for (const operation of operations) {
      if (operation.remove) fs.rmSync(operation.target, { force: true });
      else atomicWrite(operation.target, operation.bytes, operation.mode, createdDirs);
    }
    verify();
  } catch (err) {
    const rollbackDirs = [];
    for (const [target, snapshot] of [...snapshots.entries()].reverse()) {
      try {
        restoreSnapshot(target, snapshot, rollbackDirs);
      } catch (_) {
        // Preserve the original error. The retained backups and manifest still
        // provide a manual recovery path if the filesystem itself is failing.
      }
    }
    for (const dir of [...createdDirs, ...rollbackDirs].reverse()) {
      try { fs.rmdirSync(dir); } catch (_) { /* keep non-empty/pre-existing dirs */ }
    }
    fail(`operation failed and was rolled back: ${err.message}`);
  }
}

function nextBackupName(configDir) {
  const base = `opencode.json.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let name = base;
  let suffix = 1;
  while (fs.existsSync(path.join(configDir, name))) name = `${base}-${suffix++}`;
  return name;
}

function availableProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fail(`bundled profiles missing next to the skill (expected ${PROFILES_DIR})`);
  }
  return fs.readdirSync(PROFILES_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.basename(name, '.json'))
    .sort();
}

function loadProfile(name) {
  // The name regex rejects path separators and dots before any path join.
  if (!PROFILE_NAME.test(name)) fail(`invalid profile name "${name}"`);
  const names = availableProfiles();
  if (!names.includes(name)) fail(`unknown profile "${name}" (available: ${names.join(', ')})`);
  let profile;
  try {
    profile = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, `${name}.json`), 'utf8'));
  } catch (err) {
    fail(`cannot read profile "${name}": ${err.message}`);
  }
  const profileError = validateConfigObject(profile, `profile "${name}"`);
  if (profileError) fail(profileError);
  return profile;
}

function selectedSources(opts) {
  const sources = [];
  for (const role of opts.roles) {
    const source = path.join(skillDir, 'agent', `${role}.md`);
    const snapshot = snapshotFile(source, `bundled prompt ${source}`);
    if (!snapshot.existed) fail(`bundled prompt missing: ${source}`);
    sources.push({ to: `agent/${role}.md`, bytes: snapshot.bytes, mode: snapshot.mode });
  }
  for (const extra of opts.extras) {
    for (const rel of EXTRAS[extra]) {
      const source = path.join(skillDir, ...rel.split('/'));
      const snapshot = snapshotFile(source, `bundled extra ${source}`);
      if (!snapshot.existed) fail(`bundled extra missing: ${source}`);
      sources.push({ to: rel, bytes: snapshot.bytes, mode: snapshot.mode });
    }
  }
  return sources;
}

function apply(opts) {
  if (!opts.config && !opts.profile) fail('apply requires --profile <name> and/or --config <fragment.json>');
  for (const role of opts.roles) {
    if (!ALL_ROLES.includes(role)) fail(`unknown role "${role}" (known: ${ALL_ROLES.join(', ')})`);
  }
  for (const extra of opts.extras) {
    if (!(extra in EXTRAS)) fail(`unknown extra "${extra}" (known: ${Object.keys(EXTRAS).join(', ')})`);
  }
  if (new Set(opts.roles).size !== opts.roles.length) fail('duplicate roles are not allowed');
  if (new Set(opts.extras).size !== opts.extras.length) fail('duplicate extras are not allowed');

  let fragment = {};
  if (opts.config) {
    try {
      fragment = JSON.parse(fs.readFileSync(path.resolve(opts.config), 'utf8'));
    } catch (err) {
      fail(`cannot read fragment: ${err.message}`);
    }
    const fragmentError = validateConfigObject(fragment, 'fragment');
    if (fragmentError) fail(fragmentError);
  }
  if (opts.profile) {
    // The profile is the base; an explicit --config fragment overrides it.
    fragment = deepMerge(loadProfile(opts.profile), fragment);
    const profileRoles = OPTIONAL_ROLES.filter((role) => role in (fragment.agent || {}));
    if (!opts.rolesExplicit) {
      // A model assigned to a role whose permission-bearing agent file is not
      // installed would run without Fusion's permission frontmatter.
      opts.roles = [...CORE_ROLES, ...profileRoles];
    } else {
      const missing = profileRoles.filter((role) => !opts.roles.includes(role));
      if (missing.length) {
        fail(`--roles omits role(s) the profile assigns a model to: ${missing.join(', ')} - include them, or configure without --profile to trim roles`);
      }
    }
  }

  inspectConfigDir(opts.configDir);
  const configPath = path.join(opts.configDir, 'opencode.json');
  const manifestPath = path.join(opts.configDir, MANIFEST);
  inspectDestination(opts.configDir, 'opencode.json');
  inspectDestination(opts.configDir, MANIFEST);

  const configSnapshot = snapshotFile(configPath, 'opencode.json');
  let existing = {};
  if (configSnapshot.existed) {
    try {
      existing = JSON.parse(configSnapshot.bytes.toString('utf8'));
    } catch (err) {
      fail(`existing ${configPath} is not valid JSON (${err.message}); refusing to touch it - fix or move it first`);
    }
    const existingError = validateConfigObject(existing, 'existing config');
    if (existingError) fail(existingError);
  }

  const prior = fs.existsSync(manifestPath) ? readManifest(manifestPath) : null;
  if (prior) {
    assertOwned(configPath, prior.config.installedHash, prior.config.installedMode, 'opencode.json');
    for (const record of prior.files) {
      const target = inspectDestination(opts.configDir, record.path);
      assertOwned(target, record.installedHash, record.installedMode, record.path);
    }
  }

  const sources = selectedSources(opts);
  for (const source of sources) inspectDestination(opts.configDir, source.to);
  const merged = deepMerge(existing, fragment);
  const mergedError = validateConfigObject(merged, 'merged config');
  if (mergedError) fail(mergedError);
  const mergedBytes = jsonBytes(merged);

  const fileRecords = new Map((prior?.files || []).map((record) => [record.path, { ...record }]));
  for (const source of sources) {
    let record = fileRecords.get(source.to);
    const current = snapshotFile(targetFor(opts.configDir, source.to), source.to);
    if (!record) record = recordFromSnapshot(source.to, current);
    source.targetMode = current.existed ? current.mode : source.mode;
    record.installedHash = hash(source.bytes);
    record.installedMode = installedMode(source.targetMode);
    fileRecords.set(source.to, record);
  }

  const backupName = configSnapshot.existed ? nextBackupName(opts.configDir) : null;
  if (backupName) inspectDestination(opts.configDir, backupName);
  const backups = [...(prior?.backups || [])];
  if (backupName) backups.push(backupName);
  const configRecord = prior ? { ...prior.config } : recordFromSnapshot(undefined, configSnapshot);
  delete configRecord.path;
  configRecord.installedHash = hash(mergedBytes);
  const configMode = configSnapshot.existed ? configSnapshot.mode : 0o600;
  configRecord.installedMode = installedMode(configMode);
  const manifest = {
    version: MANIFEST_VERSION,
    installedAt: new Date().toISOString(),
    roles: [...new Set([...(prior?.roles || []), ...opts.roles])],
    backups,
    config: configRecord,
    files: [...fileRecords.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
  const manifestBytes = jsonBytes(manifest);
  const orphans = unknownProviders(merged);

  const planLines = [
    `config dir:   ${opts.configDir}`,
    ...(opts.profile ? [`profile:      ${opts.profile}`] : []),
    `backup:       ${backupName || '(no existing config - nothing to back up)'}`,
    `merge into:   opencode.json (${Object.keys(fragment).join(', ')})`,
    ...sources.map((source) => `install:      ${source.to}`),
  ];
  if (orphans.length) {
    planLines.push(`WARNING:      model(s) reference provider(s) with no provider block: ${orphans.join(', ')} - fine only if opencode knows them natively`);
  }
  process.stdout.write(`${planLines.join('\n')}\n`);
  if (opts.dryRun) {
    process.stdout.write('dry run - nothing written\n');
    return;
  }

  const operations = [];
  if (backupName) {
    operations.push({ target: path.join(opts.configDir, backupName), bytes: configSnapshot.bytes, mode: configSnapshot.mode });
  }
  operations.push({ target: configPath, bytes: mergedBytes, mode: configMode });
  for (const source of sources) {
    operations.push({
      target: targetFor(opts.configDir, source.to),
      bytes: source.bytes,
      mode: source.targetMode,
    });
  }
  operations.push({ target: manifestPath, bytes: manifestBytes, mode: 0o600 });
  executeTransaction(operations, () => {
    assertOwned(configPath, configRecord.installedHash, configRecord.installedMode, 'opencode.json');
    for (const record of manifest.files) {
      assertOwned(targetFor(opts.configDir, record.path), record.installedHash, record.installedMode, record.path);
    }
    assertOwned(manifestPath, hash(manifestBytes), installedMode(0o600), MANIFEST);
  });
  process.stdout.write('done - restart opencode to load the new config\n');
}

function undo(opts) {
  inspectConfigDir(opts.configDir);
  const manifestPath = path.join(opts.configDir, MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    fail(`no ${MANIFEST} in ${opts.configDir} - nothing recorded to undo; see the skill's manual removal steps`);
  }
  inspectDestination(opts.configDir, MANIFEST);
  const manifest = readManifest(manifestPath);
  const configPath = path.join(opts.configDir, 'opencode.json');
  inspectDestination(opts.configDir, 'opencode.json');
  assertOwned(configPath, manifest.config.installedHash, manifest.config.installedMode, 'opencode.json');
  for (const record of manifest.files) {
    const target = inspectDestination(opts.configDir, record.path);
    assertOwned(target, record.installedHash, record.installedMode, record.path);
  }

  const operations = [];
  if (manifest.config.existed) {
    operations.push({
      target: configPath,
      bytes: decodeOriginal(manifest.config, 'opencode.json'),
      mode: manifest.config.originalMode,
    });
  } else operations.push({ target: configPath, remove: true });
  for (const record of manifest.files) {
    const target = targetFor(opts.configDir, record.path);
    if (record.existed) {
      operations.push({ target, bytes: decodeOriginal(record, record.path), mode: record.originalMode });
    } else operations.push({ target, remove: true });
  }
  operations.push({ target: manifestPath, remove: true });
  executeTransaction(operations, () => {
    const restoredConfig = snapshotFile(configPath, 'opencode.json');
    if (manifest.config.existed) {
      if (!restoredConfig.existed
        || hash(restoredConfig.bytes) !== hash(decodeOriginal(manifest.config, 'opencode.json'))
        || restoredConfig.mode !== installedMode(manifest.config.originalMode)) {
        fail('post-check failed while restoring opencode.json');
      }
    } else if (restoredConfig.existed) fail('post-check failed while removing opencode.json');
    for (const record of manifest.files) {
      const restored = snapshotFile(targetFor(opts.configDir, record.path), record.path);
      if (record.existed) {
        if (!restored.existed
          || hash(restored.bytes) !== hash(decodeOriginal(record, record.path))
          || restored.mode !== installedMode(record.originalMode)) {
          fail(`post-check failed while restoring ${record.path}`);
        }
      } else if (restored.existed) fail(`post-check failed while removing ${record.path}`);
    }
    if (fs.existsSync(manifestPath)) fail(`post-check failed while removing ${MANIFEST}`);
  });

  process.stdout.write(manifest.config.existed
    ? 'restored:     opencode.json to its pre-install state\n'
    : 'removed:      opencode.json (there was none before install)\n');
  for (const record of manifest.files) {
    process.stdout.write(`${record.existed ? 'restored' : 'removed'}:     ${record.path}\n`);
  }
  process.stdout.write('done - backups were kept; restart opencode\n');
}

try {
  const { command, opts } = parseArgs(process.argv.slice(2));
  if (command === 'apply') apply(opts);
  else if (command === 'undo') undo(opts);
  else fail(`usage: install.js <apply|undo> [options] (got "${command || ''}")`);
} catch (err) {
  process.stderr.write(`fusion-install: ${err.message}\n`);
  process.exitCode = 1;
}
