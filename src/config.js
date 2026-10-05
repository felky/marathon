import fs from 'node:fs';
import path from 'node:path';
import { COLOR_NAMES } from './colors.js';
import { REPO_CONFIG_NAME } from './paths.js';

const LAYOUTS = new Set(['auto', 'cols', 'rows', 'grid']);
const AUTO_COLORS = ['cyan', 'magenta', 'green', 'yellow', 'blue', 'orange', 'purple', 'teal', 'pink', 'red'];
const COLOR_RE = new RegExp(`^(${COLOR_NAMES.join('|')})$`);

export function readConfig(dir) {
  const file = path.join(dir, REPO_CONFIG_NAME);
  if (!fs.existsSync(file)) {
    throw new Error(`No ${REPO_CONFIG_NAME} found in ${dir}. Run "mth init" there first.`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
  return normalizeConfig(raw, dir, file);
}

export function normalizeConfig(raw, dir, file = REPO_CONFIG_NAME) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${file}: expected a JSON object.`);
  }
  const tasksRaw = raw.tasks;
  if (!tasksRaw || typeof tasksRaw !== 'object' || Array.isArray(tasksRaw)) {
    throw new Error(`${file}: "tasks" must be an object like { "api": "pnpm dev" }.`);
  }
  const tasks = Object.entries(tasksRaw).map(([id, entry], index) => normalizeTask(id, entry, dir, index, file));
  if (tasks.length === 0) throw new Error(`${file}: "tasks" is empty.`);

  const ids = new Set(tasks.map((task) => task.id));
  let selected = tasks.map((task) => task.id);
  if (raw.default !== undefined) {
    if (!Array.isArray(raw.default) || raw.default.length === 0) {
      throw new Error(`${file}: "default" must be a non-empty array of task names.`);
    }
    for (const id of raw.default) {
      if (!ids.has(id)) throw new Error(`${file}: "default" refers to unknown task "${id}".`);
    }
    selected = [...raw.default];
  }

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : path.basename(dir),
    dir,
    file,
    layout: raw.layout === undefined ? 'auto' : validateLayout(raw.layout, file),
    shell: typeof raw.shell === 'string' && raw.shell.trim() ? raw.shell.trim() : undefined,
    tasks,
    selected,
  };
}

function validateLayout(layout, file) {
  if (!LAYOUTS.has(layout)) {
    throw new Error(`${file}: "layout" must be one of ${[...LAYOUTS].join(', ')}.`);
  }
  return layout;
}

function normalizeTask(id, entry, dir, index, file) {
  let cmd;
  let cwd;
  let env;
  let color;
  let shell;

  if (typeof entry === 'string') {
    cmd = entry;
  } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    cmd = entry.cmd ?? entry.run ?? entry.command;
    cwd = entry.cwd;
    env = entry.env;
    color = entry.color;
    shell = entry.shell;
  }

  if (typeof cmd !== 'string' || !cmd.trim()) {
    throw new Error(`${file}: task "${id}" needs a command string (or an object with "cmd").`);
  }
  if (env !== undefined && (!env || typeof env !== 'object' || Array.isArray(env))) {
    throw new Error(`${file}: task "${id}" "env" must be an object.`);
  }
  if (color !== undefined && !COLOR_RE.test(color)) {
    throw new Error(`${file}: task "${id}" color must be one of ${COLOR_NAMES.join(', ')}.`);
  }

  return {
    id,
    cmd: cmd.trim(),
    cwd: cwd ? path.resolve(dir, cwd) : dir,
    env: env ? mapEnv(env, id, file) : {},
    color: color || AUTO_COLORS[index % AUTO_COLORS.length],
    shell: typeof shell === 'string' && shell.trim() ? shell.trim() : undefined,
  };
}

function mapEnv(env, id, file) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new Error(`${file}: task "${id}" env value for ${key} must be a string, number or boolean.`);
    }
    out[key] = String(value);
  }
  return out;
}