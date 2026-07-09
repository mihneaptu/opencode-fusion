import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("assemble-agents writes OpenCode and Claude Code agents", () => {
  const result = spawnSync(process.execPath, ["scripts/assemble-agents.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const ocBuild = fs.readFileSync(path.join(root, "agent/build.md"), "utf8");
  assert.match(ocBuild, /^---\n/);
  assert.match(ocBuild, /edit:\s*deny/);
  assert.match(ocBuild, /"sidekick":\s*allow/);
  assert.match(ocBuild, /OPENCODE HARNESS/);
  assert.match(ocBuild, /`task` tool/);

  const skillBuild = fs.readFileSync(
    path.join(root, ".opencode/skills/fusion-setup/agent/build.md"),
    "utf8"
  );
  assert.equal(skillBuild, ocBuild);

  const ccBuild = fs.readFileSync(
    path.join(root, "harnesses/claude-code/agents/build.md"),
    "utf8"
  );
  assert.match(ccBuild, /^---\nname:\s*build\n/);
  assert.match(ccBuild, /disallowedTools:.*Write.*Edit/);
  assert.match(ccBuild, /Agent\(sidekick/);
  assert.match(ccBuild, /CLAUDE CODE HARNESS/);
  assert.match(ccBuild, /claude --agent build/);

  const ccSidekick = fs.readFileSync(
    path.join(root, "harnesses/claude-code/agents/sidekick.md"),
    "utf8"
  );
  assert.match(ccSidekick, /name:\s*sidekick/);
  assert.match(ccSidekick, /Write,\s*Edit,\s*Bash/);
  assert.match(ccSidekick, /REPORT FORMAT/);
});
