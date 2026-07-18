'use strict';

// Agent prompts keep their normal role defaults in source. Provider/model
// exceptions are applied only to the installed copy so another provider
// serving the same model is not changed accidentally.
const MODEL_FRONTMATTER_OMISSIONS = Object.freeze({
  'opencode-go/kimi-k3': Object.freeze(['temperature']),
});

function omitFrontmatterKey(bytes, key) {
  const text = bytes.toString('utf8');
  if (!text.startsWith('---')) throw new Error('agent prompt must start with YAML frontmatter');

  const boundary = text.slice(3).match(/\r?\n---(?:\r?\n|$)/);
  if (!boundary) throw new Error('agent prompt has no closing YAML frontmatter boundary');

  const end = 3 + boundary.index + boundary[0].length;
  const frontmatter = text.slice(0, end);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const next = frontmatter.replace(new RegExp(`^${escaped}\\s*:[^\\r\\n]*(?:\\r?\\n|$)`, 'm'), '');
  if (next === frontmatter) return bytes;
  return Buffer.from(next + text.slice(end));
}

function applyPromptCompatibility(bytes, model) {
  let result = bytes;
  for (const key of MODEL_FRONTMATTER_OMISSIONS[model] || []) {
    result = omitFrontmatterKey(result, key);
  }
  return result;
}

module.exports = { applyPromptCompatibility };
