#!/usr/bin/env node
/**
 * Assemble harness agent files from:
 *   core/roles/<role>.md
 *   harnesses/<harness>/frontmatter/<role>.md
 *   harnesses/<harness>/addenda/<role>.md  (optional)
 *
 * OpenCode outputs:
 *   agent/<role>.md
 *   .opencode/skills/fusion-setup/agent/<role>.md
 *
 * Claude Code outputs:
 *   harnesses/claude-code/agents/<role>.md
 *
 * Usage (repo root): node scripts/assemble-agents.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const OPENCODE_ROLES = [
  "build",
  "plan",
  "sidekick",
  "research",
  "design",
  "reviewer",
  "vision",
];

const CLAUDE_ROLES = [
  "build",
  "plan",
  "sidekick",
  "explore",
  "research",
  "design",
  "reviewer",
  "vision",
];

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}

function write(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = content.endsWith("\n") ? content : content + "\n";
  fs.writeFileSync(p, body, "utf8");
  console.log("wrote", rel);
}

function assemble(harness, role) {
  const front = read(`harnesses/${harness}/frontmatter/${role}.md`);
  const core = read(`core/roles/${role}.md`);
  const addendum = read(`harnesses/${harness}/addenda/${role}.md`);

  if (!front) throw new Error(`Missing frontmatter: harnesses/${harness}/frontmatter/${role}.md`);
  if (!core) throw new Error(`Missing core role: core/roles/${role}.md`);

  const parts = [front.trimEnd(), "", core.trimEnd()];
  if (addendum && addendum.trim()) {
    parts.push("", addendum.trimEnd());
  }
  return parts.join("\n") + "\n";
}

function main() {
  for (const role of OPENCODE_ROLES) {
    const out = assemble("opencode", role);
    write(`agent/${role}.md`, out);
    write(`.opencode/skills/fusion-setup/agent/${role}.md`, out);
  }

  for (const role of CLAUDE_ROLES) {
    const out = assemble("claude-code", role);
    write(`harnesses/claude-code/agents/${role}.md`, out);
  }

  console.log("assemble-agents: ok");
}

main();
