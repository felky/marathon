import fs from 'node:fs';
import path from 'node:path';
import { configDir, registryFile } from './paths.js';

function emptyRegistry() {
  return { projects: {} };
}

export function loadRegistry() {
  const file = registryFile();
  if (!fs.existsSync(file)) return emptyRegistry();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.projects || typeof parsed.projects !== 'object') {
    return emptyRegistry();
  }
  return parsed;
}

export function saveRegistry(registry) {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(registryFile(), JSON.stringify(registry, null, 2) + '\n');
}

export function addProject(name, dir) {
  const registry = loadRegistry();
  registry.projects[name] = {
    path: path.resolve(dir),
    addedAt: new Date().toISOString(),
  };
  saveRegistry(registry);
  return registry;
}

export function removeProject(name) {
  const registry = loadRegistry();
  if (!registry.projects[name]) return false;
  delete registry.projects[name];
  saveRegistry(registry);
  return true;
}