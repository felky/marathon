import fs from 'node:fs';
import path from 'node:path';
import { bold, colorCode, dim, RESET, supportsColor } from './colors.js';
import { readConfig } from './config.js';
import { detectTasks } from './detect.js';
import { findRepoConfig, REPO_CONFIG_NAME, configDir } from './paths.js';
import { loadRegistry, addProject, removeProject } from './registry.js';
import { runPlain } from './plain.js';
import { buildShellInvocation } from './shell.js';
import { loadPty } from './pty.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const LAYOUTS = new Set(['auto', 'cols', 'rows', 'grid']);

const HELP = `
mth — run a project's tasks side by side in one terminal window

Usage
  mth                       run the project in this folder (mth.json)
  mth <project>             run a saved project
  mth <project> <task...>   run only some of its tasks
  mth ls                    list saved projects and their tasks
  mth link [name]           save this folder as a project
  mth unlink <name>         forget a saved project
  mth init [--force]        create mth.json here (detects workspace packages)
  mth doctor                show environment and dependency status
  mth help                  show this help

Options
  --plain                   no panes; prefix each output line with the task name
  --layout=auto|cols|rows|grid
  --shell=<path>            shell used to run task commands
  --bail                    plain mode: stop everything on the first failure
  --version

Keys (in the pane UI)
  Ctrl-B ?                  help
  Ctrl-B q                  quit and stop all tasks
  Ctrl-B r / x              restart / kill the focused task
  Ctrl-B n / p / 1..9       switch focus
  Ctrl-B [                  scroll mode
`;

export async function main(argv) {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];

  try {
    if (flags.has('--version') || command === 'version') {
      console.log(`mth ${VERSION}`);
      return;
    }
    if (flags.has('--help') || command === 'help') {
      console.log(HELP.trim() + '\n');
      return;
    }

    switch (command) {
      case 'ls':
      case 'list':
        listProjects();
        return;
      case 'link':
      case 'add':
        linkProject(positionals[1]);
        return;
      case 'unlink':
      case 'rm':
      case 'remove':
        unlinkProject(positionals[1]);
        return;
      case 'init':
        initProject(flags);
        return;
      case 'doctor':
        await doctor();
        return;
      default:
        await runProject(positionals, flags);
    }
  } catch (error) {
    if (process.env.MTH_DEBUG) throw error;
    console.error(formatError(`mth: ${error.message}`));
    process.exitCode = 1;
  }
}

async function runProject(positionals, flags) {
  const name = positionals[0];
  const taskIds = positionals.slice(1);
  const project = resolveProject(name);
  if (!project) return;

  let tasks;
  if (taskIds.length > 0) {
    const byId = new Map(project.tasks.map((task) => [task.id, task]));
    tasks = taskIds.map((id) => {
      const task = byId.get(id);
      if (!task) {
        throw new Error(
          `Project "${project.name}" has no task "${id}". Available: ${project.tasks.map((t) => t.id).join(', ')}`,
        );
      }
      return task;
    });
  } else {
    const selected = new Set(project.selected);
    tasks = project.tasks.filter((task) => selected.has(task.id));
  }

  const layout = flagValue(flags, '--layout');
  if (typeof layout === 'string') {
    if (!LAYOUTS.has(layout)) throw new Error(`--layout must be one of ${[...LAYOUTS].join(', ')}.`);
    project.layout = layout;
  }
  const shell = flagValue(flags, '--shell');
  if (typeof shell === 'string') project.shell = shell;

  const usePlain = flags.has('--plain') || !(process.stdout.isTTY && process.stdin.isTTY);
  if (usePlain) {
    if (!flags.has('--plain') && !process.stdout.isTTY) {
      console.error(dim('note: output is not a terminal — using --plain mode'));
    }
    const code = await runPlain(project, tasks, { bail: flags.has('--bail') });
    process.exitCode = code;
    return;
  }

  const { runTui } = await import('./tui/app.js');
  await runTui(project, tasks);
}

function resolveProject(name) {
  if (!name || name === '.') {
    const found = findRepoConfig();
    if (!found) {
      if (!name) {
        console.log(HELP.trim() + '\n');
        return null;
      }
      throw new Error(`No ${REPO_CONFIG_NAME} found in this folder. Run "mth init" to create one.`);
    }
    return readConfig(found.dir);
  }

  const registry = loadRegistry();
  const entry = registry.projects[name];
  if (entry) {
    if (!fs.existsSync(entry.path)) {
      throw new Error(`Saved project "${name}" points to ${entry.path}, which no longer exists. Run "mth unlink ${name}".`);
    }
    return readConfig(entry.path);
  }

  const direct = path.resolve(name);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory() && fs.existsSync(path.join(direct, REPO_CONFIG_NAME))) {
    return readConfig(direct);
  }

  const here = findRepoConfig();
  if (here) {
    const config = readConfig(here.dir);
    if (config.name === name) return config;
  }

  const suggestions = Object.keys(registry.projects).filter(
    (project) => project.startsWith(name) || name.startsWith(project),
  );
  const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
  throw new Error(
    `Unknown project "${name}". Run "mth ls" to see saved projects, or "mth link" inside the project folder.${hint}`,
  );
}

function listProjects() {
  const registry = loadRegistry();
  const names = Object.keys(registry.projects);
  const useColor = supportsColor();

  if (names.length === 0) {
    console.log('No saved projects yet.');
    console.log(dim('Go to a project folder (one with mth.json) and run "mth link".'));
  } else {
    console.log(bold(`Saved projects (${names.length})`) + '\n');
    for (const name of names) {
      const entry = registry.projects[name];
      const missing = !fs.existsSync(entry.path);
      const nameCell = useColor ? colorCode('cyan') + name + RESET : name;
      console.log(`${nameCell}  ${dim(entry.path)}${missing ? '  (missing!)' : ''}`);
      if (!missing) {
        try {
          const config = readConfig(entry.path);
          console.log(dim(`    tasks: ${config.selected.join('  ')}`));
        } catch (error) {
          console.log(dim(`    ${error.message}`));
        }
      }
    }
  }

  console.log('');
  const here = findRepoConfig();
  if (here) {
    let label = here.dir;
    try {
      label = bold(readConfig(here.dir).name);
    } catch {
      label = '(invalid mth.json)';
    }
    console.log(`In this folder: ${label} — run "mth" to start it.`);
  } else {
    console.log(dim('In this folder: no mth.json. Run "mth init" to create one.'));
  }
}

function linkProject(name) {
  const dir = process.cwd();
  let config = null;
  try {
    config = readConfig(dir);
  } catch {
    config = null;
  }
  const resolved = name || (config && config.name) || path.basename(dir);
  addProject(resolved, dir);
  console.log(`Linked ${bold(resolved)} → ${dir}`);
  if (!config) {
    console.log(dim(`Note: no valid ${REPO_CONFIG_NAME} here yet. Run "mth init" to create one.`));
  }
  console.log(dim(`Run it from anywhere with: mth ${resolved}`));
}

function unlinkProject(name) {
  if (!name) throw new Error('Usage: mth unlink <project>');
  if (removeProject(name)) {
    console.log(`Unlinked ${name}.`);
  } else {
    console.error(formatError(`No saved project named "${name}".`));
    process.exitCode = 1;
  }
}

function initProject(flags) {
  const dir = process.cwd();
  const file = path.join(dir, REPO_CONFIG_NAME);
  if (fs.existsSync(file) && !flags.has('--force')) {
    throw new Error(`${REPO_CONFIG_NAME} already exists here (use --force to overwrite).`);
  }
  const detected = detectTasks(dir);
  const config = {
    name: path.basename(dir),
    layout: 'auto',
    tasks: detected.tasks,
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');

  const taskCount = Object.keys(detected.tasks).length;
  if (detected.detected) {
    const manager = detected.manager ? ` (${detected.manager} workspace)` : '';
    console.log(`Created ${file} with ${taskCount} task(s) detected${manager}.`);
  } else {
    console.log(`Created ${file} with placeholder tasks — edit them to match your project.`);
  }
  console.log(dim('Next: "mth link" to run it from anywhere, or run "mth" right here.'));
}

async function doctor() {
  const lines = [];
  lines.push(`mth        ${VERSION}`);
  lines.push(`node       ${process.version} (${process.platform} ${process.arch})`);
  lines.push(`stdin      ${process.stdin.isTTY ? 'tty' : 'not a tty'}`);
  lines.push(`stdout     ${process.stdout.isTTY ? `tty ${process.stdout.columns}x${process.stdout.rows}` : 'not a tty'}`);
  if (process.env.WT_SESSION) lines.push('terminal   Windows Terminal');
  else if (process.env.TERM_PROGRAM) lines.push(`terminal   ${process.env.TERM_PROGRAM}`);
  try {
    const invocation = buildShellInvocation('echo ok');
    lines.push(`shell      ${invocation.file}`);
  } catch (error) {
    lines.push(`shell      ERROR: ${error.message}`);
  }
  lines.push(`config     ${configDir()}`);
  try {
    const registry = loadRegistry();
    lines.push(`projects   ${Object.keys(registry.projects).length} saved`);
  } catch (error) {
    lines.push(`projects   ERROR: ${error.message}`);
  }
  try {
    await loadPty();
    lines.push('node-pty   ok');
  } catch (error) {
    lines.push(`node-pty   MISSING: ${error.message}`);
  }
  const here = findRepoConfig();
  lines.push(`project    ${here ? here.file : 'none in this folder'}`);
  console.log(lines.join('\n'));
}

function parseArgs(argv) {
  const valueFlags = new Set(['--layout', '--shell']);
  const positionals = [];
  const flags = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith('--')) {
      if (arg.includes('=') || !valueFlags.has(arg)) {
        flags.add(arg);
      } else if (index + 1 < argv.length) {
        index += 1;
        flags.add(`${arg}=${argv[index]}`);
      } else {
        flags.add(arg);
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      flags.add(arg);
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

function flagValue(flags, name) {
  for (const flag of flags) {
    if (flag === name) return true;
    if (flag.startsWith(`${name}=`)) return flag.slice(name.length + 1);
  }
  return undefined;
}

function formatError(message) {
  return supportsColor(process.stderr) ? `\x1b[31m${message}${RESET}` : message;
}