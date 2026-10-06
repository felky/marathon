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

function run(args, cwd, home) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, MTH_HOME: home },
  });
}

test('init detects pnpm workspace packages', () => {
  const dir = tempDir('mth-ws-');
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  for (const name of ['api', 'web']) {
    const pkgDir = path.join(dir, 'apps', name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: `@acme/${name}`, scripts: { dev: 'node server.js' } }),
    );
  }

  const result = run(['init'], dir, tempDir('mth-home-'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 task\(s\) detected \(pnpm workspace\)/);

  const config = JSON.parse(fs.readFileSync(path.join(dir, 'mth.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.tasks).sort(), ['api', 'web']);
  assert.equal(config.tasks.api.cmd, 'pnpm --filter @acme/api dev');
  assert.equal(config.tasks.api.cwd, path.join('apps', 'api'));
});

test('init falls back to placeholders for plain repos', () => {
  const dir = tempDir('mth-plaininit-');
  const result = run(['init'], dir, tempDir('mth-home-'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /placeholder tasks/);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'mth.json'), 'utf8'));
  assert.ok(config.tasks.api);
});

test('link, ls and unlink roundtrip through the registry', () => {
  const home = tempDir('mth-home-');
  const dir = tempDir('mth-link-');
  fs.writeFileSync(path.join(dir, 'mth.json'), JSON.stringify({ name: 'demo', tasks: { api: 'echo hi' } }));

  const linked = run(['link'], dir, home);
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stdout, /Linked demo/);

  const listed = run(['ls'], dir, home);
  assert.match(listed.stdout, /demo/);
  assert.match(listed.stdout, /tasks: api/);

  const unlinked = run(['unlink', 'demo'], dir, home);
  assert.equal(unlinked.status, 0, unlinked.stderr);
  assert.match(unlinked.stdout, /Unlinked demo/);

  const empty = run(['ls'], dir, home);
  assert.match(empty.stdout, /No saved projects yet/);
});
test('init in a parent folder lists child projects that have mth.json', () => {
  const dir = tempDir('mth-parent-');
  for (const sub of ['backend', path.join('apps', 'web')]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.writeFileSync(path.join(dir, sub, 'mth.json'), JSON.stringify({ tasks: { dev: 'echo hi' } }));
  }

  const result = run(['init'], dir, tempDir('mth-home-'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 project\(s\)/);
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'mth.json'), 'utf8'));
  assert.deepEqual(config.projects, { web: 'apps/web', backend: 'backend' });
});
