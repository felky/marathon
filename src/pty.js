import { spawnSync } from 'node:child_process';
import { buildEnv, buildShellInvocation, isWindows } from './shell.js';

let ptyModule = null;

export async function loadPty() {
  if (!ptyModule) {
    const module = await import('node-pty');
    ptyModule = module.default && module.default.spawn ? module.default : module;
  }
  return ptyModule;
}

export async function spawnPty({ cmd, cwd, env, shell, cols, rows }) {
  const pty = await loadPty();
  const invocation = buildShellInvocation(cmd, shell);
  return pty.spawn(invocation.file, invocation.args, {
    name: 'xterm-256color',
    cols: Math.max(2, cols),
    rows: Math.max(1, rows),
    cwd,
    env: buildEnv(env),
  });
}

export function killPty(proc, signal = 'SIGTERM') {
  if (!proc) return;
  try {
    if (isWindows) {
      try {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch {}
      try {
        proc.kill();
      } catch {}
      return;
    }
    try {
      // node-pty starts each task as its own process group leader
      process.kill(-proc.pid, signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {}
    }
    if (signal !== 'SIGKILL') {
      const timer = setTimeout(() => {
        try {
          process.kill(-proc.pid, 'SIGKILL');
        } catch {}
      }, 2000);
      if (typeof timer.unref === 'function') timer.unref();
    }
  } catch {}
}
