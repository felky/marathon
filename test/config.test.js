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
function writeConfig(dir, config) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mth.json'), JSON.stringify(config));
}

test('composes sub-projects from their own mth.json and inline tasks', () => {
  const root = tempDir();
  writeConfig(path.join(root, 'services', 'api'), {
    tasks: { dev: 'node api.js', worker: { cmd: 'node worker.js', env: { QUEUE: 'jobs' } } },
    default: ['dev'],
    shell: 'bash',
  });
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  writeConfig(root, {
    name: 'acme',
    tasks: { db: 'docker compose up db' },
    projects: {
      api: { path: 'services/api', env: { LOG: 'debug', QUEUE: 'top' }, color: 'pink' },
      web: { path: 'apps/web', tasks: { dev: 'vite' } },
    },
  });

  const config = readConfig(root);
  assert.deepEqual(
    config.tasks.map((task) => task.id),
    ['db', 'api:dev', 'api:worker', 'web:dev'],
  );
  assert.deepEqual(config.selected, ['db', 'api:dev', 'api:worker', 'web:dev']);
  assert.deepEqual(config.groups.get('api'), ['api:dev']);

  const [, apiDev, apiWorker, webDev] = config.tasks;
  assert.equal(apiDev.cwd, path.join(root, 'services', 'api'));
  assert.equal(apiDev.shell, 'bash');
  assert.equal(apiDev.color, 'pink');
  assert.deepEqual(apiDev.env, { LOG: 'debug', QUEUE: 'top' });
  assert.equal(apiWorker.env.QUEUE, 'jobs');
  assert.equal(webDev.cwd, path.join(root, 'apps', 'web'));
  assert.equal(new Set([config.tasks[0].color, webDev.color]).size, 2);
});

test('default may name sub-projects and nested tasks', () => {
  const root = tempDir();
  writeConfig(path.join(root, 'api'), { tasks: { dev: 'a', test: 'b' }, default: ['dev'] });
  fs.mkdirSync(path.join(root, 'web'));
  writeConfig(root, {
    projects: { api: 'api', web: { tasks: { dev: 'c', storybook: 'd' }, default: ['dev'] } },
    default: ['web', 'api:test', 'web:dev'],
  });
  assert.deepEqual(readConfig(root).selected, ['web:dev', 'api:test']);
});

test('rejects broken sub-project configs', () => {
  const root = tempDir();
  assert.throws(() => normalizeConfig({ projects: { api: 'missing' } }, root), /does not exist/);
  fs.mkdirSync(path.join(root, 'empty'));
  assert.throws(() => normalizeConfig({ projects: { api: 'empty' } }, root), /no mth\.json/);
  fs.mkdirSync(path.join(root, 'api'));
  assert.throws(() => normalizeConfig({ projects: { 'a:b': { tasks: { x: 'y' } } } }, root), /must not contain ":"/);
  assert.throws(() => normalizeConfig({ projects: { api: { tasks: { x: 'y' } } }, default: ['web'] }, root), /unknown task "web"/);

  writeConfig(path.join(root, 'loop'), { projects: { back: '..' } });
  writeConfig(root, { projects: { loop: 'loop' } });
  assert.throws(() => readConfig(root), /loop/);
});
