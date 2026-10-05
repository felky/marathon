import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/mth.js', import.meta.url));

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeProject(tasks) {
  const dir = tempDir('mth-plain-');
  fs.writeFileSync(path.join(dir, 'mth.json'), JSON.stringify({ name: 'plain', tasks }));
  return dir;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, MTH_HOME: tempDir('mth-home-'), ...options.env },
    ...options,
  });
}

test('plain mode prefixes every line and reports the first failure', () => {
  const dir = makeProject({
    api: 'node -e "console.log(\'api up\')"',
    web: 'node -e "console.log(\'web up\'); process.exit(3)"',
  });

  const result = run(['--plain'], { cwd: dir });
  assert.equal(result.error, undefined);
  assert.match(result.stdout, /\[api\s*\] api up/);
  assert.match(result.stdout, /\[web\s*\] web up/);
  assert.match(result.stdout, /\[web\s*\] ── web exited with code 3 ──/);
  assert.equal(result.status, 3);
});

test('running a subset of tasks works', () => {
  const dir = makeProject({
    api: 'node -e "console.log(\'api only\')"',
    web: 'node -e "console.log(\'web only\')"',
  });

  const result = run(['--plain', '.', 'api'], { cwd: dir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /api only/);
  assert.doesNotMatch(result.stdout, /web only/);
});

test('unknown project names fail with a hint', () => {
  const result = run(['definitely-not-a-project']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown project/);
});