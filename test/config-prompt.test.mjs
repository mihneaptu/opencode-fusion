import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");

const EXPECTED_BUILD_PROMPT = "{file:agent/build.md}";
const PROMPT_OBJECT_PATTERN = /"prompt"\s*:\s*\{/;

function readText(path) {
  return readFileSync(path, "utf8");
}

function configJsonPaths() {
  const paths = [join(repoRoot, "opencode.json")];
  const configsDir = join(repoRoot, "configs");

  for (const entry of readdirSync(configsDir)) {
    if (entry.endsWith(".json")) {
      paths.push(join(configsDir, entry));
    }
  }

  return paths.sort();
}

describe("shipped config prompt artifacts", () => {
  for (const configPath of configJsonPaths()) {
    const label = relative(repoRoot, configPath);

    describe(label, () => {
      it("does not use object-form prompt in raw JSON", () => {
        const raw = readText(configPath);
        assert.match(
          raw,
          /"prompt"/,
          `${label} is expected to reference a prompt`,
        );
        assert.doesNotMatch(
          raw,
          PROMPT_OBJECT_PATTERN,
          `${label} must not use object-form "prompt": { ... }`,
        );
      });

      it('uses string prompt "{file:agent/build.md}" when agent.build.prompt exists', () => {
        const config = JSON.parse(readText(configPath));
        const prompt = config?.agent?.build?.prompt;

        if (prompt === undefined) {
          return;
        }

        assert.equal(
          typeof prompt,
          "string",
          `${label} agent.build.prompt must be a string`,
        );
        assert.equal(
          prompt,
          EXPECTED_BUILD_PROMPT,
          `${label} agent.build.prompt must reference agent/build.md`,
        );
      });
    });
  }

  describe("setup.ps1", () => {
    const setupPath = join(repoRoot, "setup.ps1");

    it('contains prompt = "{file:agent/build.md}"', () => {
      const raw = readText(setupPath);
      assert.match(
        raw,
        /prompt\s*=\s*"\{file:agent\/build\.md\}"/,
        "setup.ps1 must set build prompt to {file:agent/build.md}",
      );
    });

    it("does not use object-form prompt = @{", () => {
      const raw = readText(setupPath);
      assert.doesNotMatch(
        raw,
        /prompt\s*=\s*@\{/,
        'setup.ps1 must not use object-form prompt = @{ ... }',
      );
    });
  });

  describe("agent/build.md", () => {
    const buildPromptPath = join(repoRoot, "agent", "build.md");

    it("exists and is non-empty", () => {
      const stat = statSync(buildPromptPath);
      assert.ok(stat.isFile(), "agent/build.md must exist as a file");

      const content = readText(buildPromptPath).trim();
      assert.ok(
        content.length > 0,
        "agent/build.md must be non-empty for {file:agent/build.md} resolution",
      );
    });
  });
});