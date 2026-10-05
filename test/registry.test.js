import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addProject, loadRegistry, removeProject } from '../src/registry.js';

test('add, load and remove projects', () => {
  process.env.MTH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mth-home-'));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mth-proj-'));

  assert.deepEqual(loadRegistry().projects, {});

  addProject('demo', projectDir);
  const registry = loadRegistry();
  assert.equal(registry.projects.demo.path, path.resolve(projectDir));

  assert.equal(removeProject('demo'), true);
  assert.deepEqual(loadRegistry().projects, {});
  assert.equal(removeProject('demo'), false);
});