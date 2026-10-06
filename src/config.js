import fs from 'node:fs';
import path from 'node:path';
import { COLOR_NAMES } from './colors.js';
import { REPO_CONFIG_NAME } from './paths.js';

const LAYOUTS = new Set(['auto', 'cols', 'rows', 'grid']);
const AUTO_COLORS = ['cyan', 'magenta', 'green', 'yellow', 'blue', 'orange', 'purple', 'teal', 'pink', 'red'];
const COLOR_RE = new RegExp(`^(${COLOR_NAMES.join('|')})$`);

export function readConfig(dir, seen = new Set()) {
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
  const key = path.resolve(file);
  if (seen.has(key)) throw new Error(`${file}: projects include each other in a loop.`);
  return normalizeConfig(raw, dir, file, new Set([...seen, key]));
}

export function normalizeConfig(raw, dir, file = REPO_CONFIG_NAME, seen = new Set()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${file}: expected a JSON object.`);
  }
  const tasksRaw = raw.tasks;
  const projectsRaw = raw.projects;
  if (projectsRaw !== undefined && (!projectsRaw || typeof projectsRaw !== 'object' || Array.isArray(projectsRaw))) {
    throw new Error(`${file}: "projects" must be an object like { "api": "services/api" }.`);
  }
  if (tasksRaw === undefined && projectsRaw === undefined) {
    throw new Error(`${file}: "tasks" must be an object like { "api": "pnpm dev" }.`);
  }
  if (tasksRaw !== undefined && (!tasksRaw || typeof tasksRaw !== 'object' || Array.isArray(tasksRaw))) {
    throw new Error(`${file}: "tasks" must be an object like { "api": "pnpm dev" }.`);
  }

  const tasks = Object.entries(tasksRaw || {}).map(([id, entry], index) => normalizeTask(id, entry, dir, index, file));
  const groups = new Map();
  for (const [name, entry] of Object.entries(projectsRaw || {})) {
    const sub = loadSubProject(name, entry, dir, file, seen);
    for (const task of sub.tasks) tasks.push({ ...task, id: `${name}:${task.id}` });
    groups.set(name, sub.selected.map((id) => `${name}:${id}`));
    for (const [group, ids] of sub.groups) groups.set(`${name}:${group}`, ids.map((id) => `${name}:${id}`));
  }
  if (tasks.length === 0) throw new Error(`${file}: "tasks" is empty.`);

  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`${file}: task "${task.id}" is defined twice.`);
    ids.add(task.id);
  }
  assignAutoColors(tasks);

  let selected = tasks.map((task) => task.id);
  if (raw.default !== undefined) {
    if (!Array.isArray(raw.default) || raw.default.length === 0) {
      throw new Error(`${file}: "default" must be a non-empty array of task names.`);
    }
    selected = expandSelection(raw.default, ids, groups, (name) => `${file}: "default" refers to unknown task "${name}".`);
  }

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : path.basename(dir),
    dir,
    file,
    layout: raw.layout === undefined ? 'auto' : validateLayout(raw.layout, file),
    shell: typeof raw.shell === 'string' && raw.shell.trim() ? raw.shell.trim() : undefined,
    tasks,
    selected,
    groups,
  };
}

// Turns task names and project names into a list of task ids, keeping order and dropping repeats.
export function expandSelection(names, ids, groups, unknown) {
  const out = [];
  for (const name of names) {
    const matched = ids.has(name) ? [name] : groups.get(name);
    if (!matched) throw new Error(unknown(name));
    for (const id of matched) if (!out.includes(id)) out.push(id);
  }
  return out;
}

function loadSubProject(name, entry, dir, file, seen) {
  if (!name || name.includes(':')) {
    throw new Error(`${file}: project name "${name}" must be non-empty and must not contain ":".`);
  }
  if (typeof entry === 'string') entry = { path: entry };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${file}: project "${name}" must be a folder path or an object with "path".`);
  }
  if (entry.path !== undefined && (typeof entry.path !== 'string' || !entry.path.trim())) {
    throw new Error(`${file}: project "${name}" "path" must be a folder path.`);
  }
  if (entry.env !== undefined && (!entry.env || typeof entry.env !== 'object' || Array.isArray(entry.env))) {
    throw new Error(`${file}: project "${name}" "env" must be an object.`);
  }
  if (entry.color !== undefined && !COLOR_RE.test(entry.color)) {
    throw new Error(`${file}: project "${name}" color must be one of ${COLOR_NAMES.join(', ')}.`);
  }

  const subDir = path.resolve(dir, entry.path ?? name);
  if (!fs.existsSync(subDir) || !fs.statSync(subDir).isDirectory()) {
    throw new Error(`${file}: project "${name}" folder ${subDir} does not exist. Set "path" to its folder.`);
  }
  let sub;
  if (entry.tasks !== undefined || entry.projects !== undefined) {
    const inline = { name, tasks: entry.tasks, projects: entry.projects };
    sub = normalizeConfig(inline, subDir, `${file} (project "${name}")`, seen);
  } else {
    if (!fs.existsSync(path.join(subDir, REPO_CONFIG_NAME))) {
      throw new Error(
        `${file}: project "${name}" has no ${REPO_CONFIG_NAME} in ${subDir}. Add one there, or give the project inline "tasks".`,
      );
    }
    sub = readConfig(subDir, seen);
  }

  const env = entry.env ? mapEnv(entry.env, name, file) : {};
  const shell = typeof entry.shell === 'string' && entry.shell.trim() ? entry.shell.trim() : undefined;
  const tasks = sub.tasks.map((task) => ({
    ...task,
    env: { ...env, ...task.env },
    shell: task.shell ?? shell ?? sub.shell,
    ...(entry.color && task.autoColor ? { color: entry.color, autoColor: false } : {}),
  }));

  let selected = sub.selected;
  if (entry.default !== undefined) {
    if (!Array.isArray(entry.default) || entry.default.length === 0) {
      throw new Error(`${file}: project "${name}" "default" must be a non-empty array of task names.`);
    }
    const ids = new Set(sub.tasks.map((task) => task.id));
    selected = expandSelection(entry.default, ids, sub.groups, (id) => `${file}: project "${name}" has no task "${id}".`);
  }
  return { tasks, selected, groups: sub.groups };
}

function assignAutoColors(tasks) {
  let index = 0;
  for (const task of tasks) {
    if (task.autoColor) task.color = AUTO_COLORS[index % AUTO_COLORS.length];
    index += 1;
  }
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
    autoColor: !color,
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