import pty from 'node-pty';

const [bin, dir] = process.argv.slice(2);
const proc = pty.spawn(process.execPath, [bin], {
  cwd: dir,
  cols: 100,
  rows: 30,
  env: process.env,
});

let output = '';
let exited = null;
proc.onData((data) => {
  output += data;
});
proc.onExit((event) => {
  exited = event;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + 20000;
const ready = () => output.includes('PANE_READY_API') && output.includes('PANE_READY_WEB');

while (!ready() && Date.now() < deadline && !exited) await sleep(100);

const beforeQuit = {
  apiOutput: output.includes('PANE_READY_API'),
  webOutput: output.includes('PANE_READY_WEB'),
  titleDot: output.includes('●'),
  frame: output.includes('┌') && output.includes('│'),
};

await sleep(400);
proc.write('\u0002q');
while (!exited && Date.now() < deadline) await sleep(100);

process.stdout.write(
  JSON.stringify({
    ...beforeQuit,
    exited: Boolean(exited),
    exitCode: exited ? exited.exitCode : null,
    sample: output.slice(-600),
  }),
);
process.exit(0);