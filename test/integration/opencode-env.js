'use strict';

// Builds a fully isolated opencode environment for integration tests:
// a throwaway HOME with the repo's agent files installed globally, an
// opencode.json pointing every role at the fake provider, and a scratch
// project directory. The user's real ~/.config/opencode is never read -
// opencode resolves everything through the redirected HOME.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..', '..');
const PASSTHROUGH_ENV = new Set([
  'path',
  'pathext',
  'systemroot',
  'comspec',
  'temp',
  'tmp',
  'tmpdir',
  'lang',
  'lc_all',
  'ci',
]);

/** Seed an empty local catalog so startup never reads the developer's cache
    or reaches models.dev. The configured fake provider supplies its model. */
function seedCatalog(fakeHome) {
  const target = path.join(fakeHome, '.cache', 'opencode', 'models.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{}');
}

function isolatedProcessEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && PASSTHROUGH_ENV.has(key.toLowerCase())) env[key] = value;
  }
  return env;
}

function seedGitBoundary(projectDir) {
  const gitDir = path.join(projectDir, '.git');
  fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
  fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(
    path.join(gitDir, 'config'),
    '[core]\n\trepositoryformatversion = 0\n\tbare = false\n'
  );
}

/** Create the isolated home + project. Returns paths, the env for spawning
    opencode, and a cleanup() that removes everything. */
async function createEnv(baseURL) {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-int-home-'));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-int-proj-'));
  const configDir = path.join(fakeHome, '.config', 'opencode');
  fs.mkdirSync(path.join(configDir, 'agent'), { recursive: true });

  // Install the repo's agent prompts exactly as the setup skill would.
  const agentSrc = path.join(repoRoot, '.opencode', 'skills', 'fusion-setup', 'agent');
  for (const name of fs.readdirSync(agentSrc)) {
    if (!name.endsWith('.md')) continue;
    fs.copyFileSync(path.join(agentSrc, name), path.join(configDir, 'agent', name));
  }

  const config = {
    $schema: 'https://opencode.ai/config.json',
    model: 'fake/fake-model',
    small_model: 'fake/fake-model',
    enabled_providers: ['fake'],
    provider: {
      fake: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Fake',
        options: { baseURL, apiKey: 'fake-test-key' },
        models: { 'fake-model': { name: 'Fake Model' } },
      },
    },
    agent: {
      build: { model: 'fake/fake-model' },
      sidekick: { model: 'fake/fake-model' },
      explore: { model: 'fake/fake-model' },
    },
  };
  const configText = JSON.stringify(config, null, 2);
  fs.writeFileSync(path.join(configDir, 'opencode.json'), configText);
  fs.writeFileSync(path.join(projectDir, 'opencode.json'), configText);
  fs.writeFileSync(path.join(projectDir, 'README.md'), 'fusion integration fixture\n');
  seedGitBoundary(projectDir);
  seedCatalog(fakeHome);

  const env = isolatedProcessEnv();
  Object.assign(env, {
    HOME: fakeHome,
    USERPROFILE: fakeHome, // Windows home resolution
    XDG_CONFIG_HOME: path.join(fakeHome, '.config'),
    XDG_DATA_HOME: path.join(fakeHome, '.local', 'share'),
    XDG_CACHE_HOME: path.join(fakeHome, '.cache'),
    XDG_STATE_HOME: path.join(fakeHome, '.local', 'state'),
  });

  return {
    fakeHome,
    projectDir,
    env,
    cleanup() {
      for (const dir of [fakeHome, projectDir]) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Windows can hold locks briefly; leftover temp dirs are harmless.
        }
      }
    },
  };
}

/** Run `opencode run` non-interactively for one agent and resolve with
    { code, stdout, stderr }. Kills the process if it exceeds timeoutMs. */
function runOpencode({ agent, message, envInfo, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    // Single command string avoids the Windows args-with-shell pitfalls;
    // temp paths never contain quotes.
    const command = [
      'opencode',
      'run',
      `--dir "${envInfo.projectDir}"`,
      `--agent ${agent}`,
      '--log-level ERROR',
      `"${message}"`,
    ].join(' ');
    const child = spawn(command, { env: envInfo.env, shell: true });
    child.stdin.end(); // opencode run waits for piped stdin until EOF on non-tty
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const killTimer = setTimeout(() => {
      if (process.platform === 'win32') {
        // shell:true wraps the real process; killing the wrapper alone would
        // leave a hung opencode running. taskkill fells the whole tree.
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      } else {
        child.kill('SIGKILL');
      }
      reject(
        new Error(
          `opencode run --agent ${agent} timed out after ${timeoutMs}ms\nstderr: ${stderr.slice(-2000)}`
        )
      );
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(killTimer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** True when an opencode binary is reachable on PATH. */
function opencodeAvailable() {
  const probe = require('node:child_process').spawnSync('opencode --version', {
    shell: true,
    encoding: 'utf8',
    timeout: 30000,
  });
  return probe.status === 0;
}

module.exports = { createEnv, runOpencode, opencodeAvailable };
