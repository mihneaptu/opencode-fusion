#!/usr/bin/env node
'use strict';

// Live check that every model id shipped in profiles/*.json still exists on
// models.dev - the registry opencode resolves built-in providers against.
// Network-dependent by design: runs via `npm run check-profiles` and in the
// integration CI lane, never as part of the offline `npm test`.
//
// Errors (exit 1): a profile names a provider or model id the registry does
// not know - that profile would install a config opencode cannot serve.
// Warnings (exit 0): image-input mismatches and display-name drift - worth a
// look when refreshing a profile, not worth blocking on.
//
// Usage: node scripts/check-profiles.js [--api <url>]

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profilesDir = path.join(root, '.opencode', 'skills', 'fusion-setup', 'profiles');

function apiUrl(argv) {
  const index = argv.indexOf('--api');
  if (index === -1) return 'https://models.dev/api.json';
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--api requires a URL value');
  return value;
}

// A model reference is "provider/model-id". Profiles are hand-authored, so a
// malformed one must surface as a clear error, not mangled slicing.
function splitRef(ref) {
  const slash = ref.indexOf('/');
  if (slash < 1 || slash === ref.length - 1) return null;
  return [ref.slice(0, slash), ref.slice(slash + 1)];
}

// Every provider/model pair a profile relies on: the role assignments plus
// the display-name entries in its provider blocks.
function modelRefs(profile) {
  const refs = new Set();
  for (const value of [profile.model, profile.small_model]) {
    if (typeof value === 'string') refs.add(value);
  }
  for (const agent of Object.values(profile.agent || {})) {
    if (typeof agent.model === 'string') refs.add(agent.model);
  }
  for (const [providerId, provider] of Object.entries(profile.provider || {})) {
    for (const modelId of Object.keys(provider.models || {})) {
      refs.add(`${providerId}/${modelId}`);
    }
  }
  return [...refs].sort();
}

function readsImages(entry) {
  return Boolean(entry.attachment) || (entry.modalities?.input || []).includes('image');
}

// Punctuation and casing differ legitimately ("GLM 5.2" vs "GLM-5.2");
// compare only the letters and digits so a warning means real drift.
function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const response = await fetch(apiUrl(process.argv));
  if (!response.ok) throw new Error(`models.dev fetch failed: HTTP ${response.status}`);
  const registry = await response.json();

  const files = fs.readdirSync(profilesDir).filter((name) => name.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`no profiles found in ${profilesDir}`);

  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    const name = path.basename(file, '.json');
    const profile = JSON.parse(fs.readFileSync(path.join(profilesDir, file), 'utf8'));
    const issues = [];

    for (const ref of modelRefs(profile)) {
      const parts = splitRef(ref);
      if (!parts) {
        issues.push({ level: 'error', text: `invalid model reference "${ref}" (expected provider/model-id)` });
        continue;
      }
      const [providerId, modelId] = parts;
      const provider = registry[providerId];
      if (!provider) {
        issues.push({ level: 'error', text: `provider "${providerId}" is not on models.dev` });
        continue;
      }
      const entry = (provider.models || {})[modelId];
      if (!entry) {
        issues.push({ level: 'error', text: `${ref} is not on models.dev` });
        continue;
      }
      const declaredName = profile.provider?.[providerId]?.models?.[modelId]?.name;
      // The registry decorates names with qualifiers like "(latest)"; only
      // warn when one normalized name does not contain the other.
      if (declaredName && entry.name
        && !normalizeName(entry.name).includes(normalizeName(declaredName))
        && !normalizeName(declaredName).includes(normalizeName(entry.name))) {
        issues.push({ level: 'warn', text: `${ref} display name "${declaredName}" drifted from registry "${entry.name}"` });
      }
    }

    const registryEntry = (ref) => {
      const parts = splitRef(ref);
      return parts ? registry[parts[0]]?.models?.[parts[1]] : undefined;
    };
    const visionModel = profile.agent?.vision?.model;
    const visionEntry = visionModel && registryEntry(visionModel);
    if (visionEntry && !readsImages(visionEntry)) {
      issues.push({ level: 'warn', text: `vision model ${visionModel} does not accept image input` });
    }
    const buildModel = profile.agent?.build?.model;
    const buildEntry = buildModel && registryEntry(buildModel);
    if (buildEntry && !readsImages(buildEntry) && !visionModel) {
      issues.push({ level: 'warn', text: `build model ${buildModel} lacks image input and the profile has no vision role` });
    }

    if (issues.length === 0) {
      console.log(`ok    ${name} (${modelRefs(profile).length} model refs)`);
    } else {
      for (const issue of issues) {
        console.log(`${issue.level === 'error' ? 'ERROR' : 'warn '} ${name}: ${issue.text}`);
        if (issue.level === 'error') errors++;
        else warnings++;
      }
    }
  }

  console.log(`\n${files.length} profile(s) checked: ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`check-profiles: ${err.message}\n`);
  process.exitCode = 1;
});
