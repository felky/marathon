import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeConfig, readConfig } from '../src/config.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mth-config-'));
}

test('normalizes shorthand and object tasks', () => {
  const dir = tempDir();
  const config = normalizeConfig(
    {
      name: 'acme',
      layout: 'rows',
      tasks: {
        api: 'pnpm dev',
        web: { cmd: 'vite', cwd: 'apps/web', env: { PORT: 3000 }, color: 'pink' },
      },
      default: ['web'],
    },
    dir,
  );

  assert.equal(config.name, 'acme');
  assert.equal(config.layout, 'rows');
  assert.deepEqual(config.selected, ['web']);
  assert.equal(config.tasks.length, 2);
  assert.equal(config.tasks[0].id, 'api');
  assert.equal(config.tasks[0].cmd, 'pnpm dev');
  assert.equal(config.tasks[0].cwd, dir);
  assert.equal(config.tasks[1].cwd, path.join(dir, 'apps', 'web'));
  assert.equal(config.tasks[1].env.PORT, '3000');
  assert.equal(config.tasks[1].color, 'pink');
});

test('assigns distinct default colors', () => {
  const dir = tempDir();
  const config = normalizeConfig({ tasks: { a: 'echo a', b: 'echo b' } }, dir);
  assert.notEqual(config.tasks[0].color, config.tasks[1].color);
});

test('rejects invalid configs', () => {
  assert.throws(() => normalizeConfig({}, '/tmp'), /tasks/);
  assert.throws(() => normalizeConfig({ tasks: { a: '' } }, '/tmp'), /command/);
  assert.throws(() => normalizeConfig({ tasks: { a: 'x' }, default: ['b'] }, '/tmp'), /unknown task/);
  assert.throws(() => normalizeConfig({ tasks: { a: 'x' }, layout: 'nope' }, '/tmp'), /layout/);
  assert.throws(() => normalizeConfig({ tasks: { a: { color: 'rainbow', cmd: 'x' } } }, '/tmp'), /color/);
});

test('reads mth.json from disk and defaults the name to the folder', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'mth.json'), JSON.stringify({ tasks: { echo: 'echo hi' } }));
  const config = readConfig(dir);
  assert.equal(config.name, path.basename(dir));
  assert.equal(config.tasks.length, 1);
});

test('reports a helpful error when mth.json is missing', () => {
  assert.throws(() => readConfig(tempDir()), /mth init/);
});