import { spawn, spawnSync } from 'node:child_process';
import { buildEnv, buildShellInvocation, isWindows } from './shell.js';
import { colorCode, dim, RESET, supportsColor } from './colors.js';

export function runPlain(project, tasks, options = {}) {
  const useColor = supportsColor(process.stdout) && !options.noColor;
  const labelWidth = Math.max(0, ...tasks.map((task) => task.id.length));
  const children = new Set();
  let firstFailure = 0;
  let remaining = tasks.length;

  return new Promise((resolve) => {
    if (remaining === 0) {
      resolve(0);
      return;
    }

    const onSignal = () => {
      killAll('SIGTERM');
      process.exit(130);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    const finish = () => {
      if (remaining > 0) return;
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      resolve(firstFailure);
    };

    const killAll = (signal) => {
      for (const child of children) {
        try {
          if (isWindows) {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          } else {
            process.kill(-child.pid, signal);
          }
        } catch {}
      }
    };

    const writeLine = (task, text) => {
      const label = task.id.padEnd(labelWidth);
      const prefix = useColor ? `${colorCode(task.color)}[${label}]${RESET} ` : `[${label}] `;
      process.stdout.write(prefix + text + '\n');
    };

    const pipe = (stream, task) => {
      let buffer = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const rawLine of lines) writeLine(task, cleanLine(rawLine));
      });
      stream.on('end', () => {
        if (buffer) writeLine(task, cleanLine(buffer));
        buffer = '';
      });
    };

    for (const task of tasks) {
      const invocation = buildShellInvocation(task.cmd, task.shell ?? project.shell);
      const child = spawn(invocation.file, invocation.args, {
        cwd: task.cwd,
        env: buildEnv(task.env),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
      });
      children.add(child);

      let settled = false;
      const settle = (code, message) => {
        if (settled) return;
        settled = true;
        children.delete(child);
        remaining -= 1;
        if (message) writeLine(task, message);
        if (code && !firstFailure) firstFailure = code;
        if (options.bail && code) killAll('SIGTERM');
        finish();
      };

      child.on('error', (error) => {
        const message = useColor
          ? `\x1b[31mfailed to start: ${error.message}${RESET}`
          : `failed to start: ${error.message}`;
        settle(127, message);
      });
      child.on('exit', (code, signal) => {
        if (signal) {
          settle(1, useColor ? dim(`── ${task.id} stopped (${signal}) ──`) : `── ${task.id} stopped (${signal}) ──`);
        } else if (code) {
          const message = useColor
            ? `\x1b[31m── ${task.id} exited with code ${code} ──${RESET}`
            : `── ${task.id} exited with code ${code} ──`;
          settle(code, message);
        } else {
          settle(0, useColor ? dim(`── ${task.id} finished ──`) : `── ${task.id} finished ──`);
        }
      });

      pipe(child.stdout, task);
      pipe(child.stderr, task);
    }
  });
}

function cleanLine(line) {
  const parts = line.split('\r');
  return parts[parts.length - 1] ?? '';
}
