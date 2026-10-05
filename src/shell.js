import fs from 'node:fs';
import path from 'node:path';

export const isWindows = process.platform === 'win32';

export function findExecutable(name) {
  const extensions = isWindows ? ['', '.exe', '.cmd', '.bat'] : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {}
    }
  }
  return null;
}

export function defaultShellPath() {
  if (process.env.MTH_SHELL) return process.env.MTH_SHELL;
  if (isWindows) return findExecutable('pwsh') ? 'pwsh' : 'powershell.exe';
  return process.env.SHELL || findExecutable('bash') || '/bin/sh';
}

export function buildShellInvocation(cmd, shellOverride) {
  const shell = shellOverride || defaultShellPath();
  const base = path.basename(shell).toLowerCase();
  if (base === 'cmd' || base === 'cmd.exe') {
    return { file: shell, args: ['/d', '/s', '/c', cmd] };
  }
  if (isWindows || base.startsWith('powershell') || base.startsWith('pwsh')) {
    // PowerShell maps native exit codes to 1 unless the script exits explicitly.
    return { file: shell, args: ['-NoLogo', '-NoProfile', '-Command', `${cmd}\n exit $LASTEXITCODE`] };
  }
  return { file: shell, args: ['-lc', cmd] };
}

export function buildEnv(extra) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = String(value);
  }
  env.MTH = '1';
  if (!env.TERM || env.TERM === 'dumb') env.TERM = 'xterm-256color';
  for (const [key, value] of Object.entries(extra || {})) {
    env[key] = String(value);
  }
  return env;
}
