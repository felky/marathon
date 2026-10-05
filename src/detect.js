import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', '.next', 'out',
  'coverage', '.turbo', '.output', '.venv', 'venv', 'target', 'vendor',
]);

export function detectTasks(dir) {
  const tasks = {};
  const manager = detectManager(dir);
  const rootPkg = readPackage(dir);
  const workspace = manager === 'pnpm' || Boolean(rootPkg && rootPkg.workspaces);

  if (workspace) {
    for (const pkg of findWorkspacePackages(dir, 3)) {
      const scripts = pkg.json.scripts || {};
      const script = ['dev', 'start', 'serve'].find((name) => scripts[name]);
      if (!script) continue;
      const id = uniqueId(tasks, shortName(pkg.json.name || path.basename(pkg.dir)));
      tasks[id] = {
        cmd: runScriptCommand(manager, pkg.json.name, script),
        cwd: path.relative(dir, pkg.dir) || '.',
      };
    }
  }

  if (Object.keys(tasks).length === 0) {
    if (rootPkg && rootPkg.scripts && rootPkg.scripts.dev) {
      tasks.dev = runScriptCommand(manager, rootPkg.name, 'dev');
    } else {
      return { tasks: placeholderTasks(), detected: false, manager };
    }
  }

  return { tasks, detected: true, manager };
}

function placeholderTasks() {
  return {
    api: { cmd: 'echo "replace me with your API command"', cwd: '.' },
    tools: { cmd: 'echo "replace me with your tools command"', cwd: '.' },
    web: { cmd: 'echo "replace me with your frontend command"', cwd: '.' },
  };
}

function detectManager(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
  return 'npm';
}

function runScriptCommand(manager, packageName, script) {
  const name = packageName || '.';
  switch (manager) {
    case 'pnpm':
      return `pnpm --filter ${name} ${script}`;
    case 'yarn':
      return `yarn workspace ${name} ${script}`;
    case 'bun':
      return `bun --filter ${name} ${script}`;
    default:
      return `npm run ${script} --workspace ${name}`;
  }
}

function findWorkspacePackages(rootDir, maxDepth) {
  const found = [];
  const queue = [{ dir: rootDir, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const child = path.join(dir, entry.name);
      if (child !== rootDir) {
        const pkg = readPackage(child);
        if (pkg) found.push({ dir: child, json: pkg });
      }
      if (depth + 1 < maxDepth) queue.push({ dir: child, depth: depth + 1 });
    }
  }
  return found;
}

function readPackage(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function shortName(name) {
  const withoutScope = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
  const cleaned = withoutScope.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'task';
}

function uniqueId(tasks, id) {
  if (!tasks[id]) return id;
  let index = 2;
  while (tasks[`${id}-${index}`]) index += 1;
  return `${id}-${index}`;
}