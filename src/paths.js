import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REPO_CONFIG_NAME = 'mth.json';

export function configDir() {
  return process.env.MTH_HOME
    ? path.resolve(process.env.MTH_HOME)
    : path.join(os.homedir(), '.mth');
}

export function registryFile() {
  return path.join(configDir(), 'projects.json');
}

export function findRepoConfig(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    const file = path.join(dir, REPO_CONFIG_NAME);
    if (fs.existsSync(file)) return { dir, file };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}