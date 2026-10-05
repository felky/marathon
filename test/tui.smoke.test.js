import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/mth.js', import.meta.url));
const driver = fileURLToPath(new URL('./fixtures/tui-driver.mjs', import.meta.url));
const keysDriver = fileURLToPath(new URL('./fixtures/tui-keys-driver.mjs', import.meta.url));

let hasPty = true;
try {
  import.meta.resolve('node-pty');
} catch {
  hasPty = false;
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('pane UI renders tasks and exits on Ctrl-B q', { skip: hasPty ? false : 'node-pty unavailable' }, () => {
  const dir = tempDir('mth-tui-');
  const home = tempDir('mth-tui-home-');
  fs.writeFileSync(
    path.join(dir, 'mth.json'),
    JSON.stringify({
      name: 'tui',
      tasks: {
        api: 'node -e "console.log(\'PANE_READY_API\')"',
        web: 'node -e "console.log(\'PANE_READY_WEB\')"',
      },
    }),
  );

  const result = spawnSync(process.execPath, [driver, bin, dir], {
    encoding: 'utf8',
    timeout: 45000,
    env: { ...process.env, MTH_HOME: home },
  });

  assert.equal(
    result.error,
    undefined,
    `driver failed: ${result.error && result.error.message}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.equal(result.status, 0, `driver stderr: ${result.stderr}`);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.apiOutput, true, `api pane output missing. Tail: ${parsed.sample}`);
  assert.equal(parsed.webOutput, true, `web pane output missing. Tail: ${parsed.sample}`);
  assert.equal(parsed.titleDot, true, 'pane titles with status dots should be drawn');
  assert.equal(parsed.frame, true, 'pane frame should be drawn');
  assert.equal(parsed.exited, true, 'mth should exit after Ctrl-B q');
  assert.equal(parsed.exitCode, 0);
});

test('interactive keys kill, restart, help and scroll', { skip: hasPty ? false : 'node-pty unavailable' }, () => {
  const dir = tempDir('mth-tui-keys-');
  const home = tempDir('mth-tui-keys-home-');
  fs.writeFileSync(
    path.join(dir, 'mth.json'),
    JSON.stringify({
      name: 'keys',
      tasks: {
        ticker: 'node -e "let n = 0; setInterval(() => console.log(\'ticker tick\', ++n), 300)"',
      },
    }),
  );

  const result = spawnSync(process.execPath, [keysDriver, bin, dir], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, MTH_HOME: home },
  });

  assert.equal(
    result.error,
    undefined,
    `driver failed: ${result.error && result.error.message}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert.equal(result.status, 0, `driver stderr: ${result.stderr}`);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ticker, true, `ticker output missing. Tail: ${parsed.sample}`);
  assert.equal(parsed.killed, true, `Ctrl-B x should kill the task. Tail: ${parsed.sample}`);
  assert.equal(parsed.restarted, true, `Ctrl-B r should restart the task. Tail: ${parsed.sample}`);
  assert.equal(parsed.ticksAfter, true, 'the restarted task should produce output again');
  assert.equal(parsed.help, true, 'Ctrl-B ? should open the help overlay');
  assert.equal(parsed.scroll, true, 'Ctrl-B [ should enter scroll mode');
  assert.equal(parsed.exited, true, 'mth should exit after Ctrl-B q');
  assert.equal(parsed.exitCode, 0);
});