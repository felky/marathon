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
const waitFor = async (predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline && !exited) await sleep(100);
  return predicate();
};

const results = {};

results.ticker = await waitFor(() => output.includes('ticker tick'));
results.ticksBefore = (output.match(/ticker tick/g) || []).length;

proc.write('\u0002x');
results.killed = await waitFor(() => output.includes('(killed)') && output.includes('killed ticker'));

proc.write('\u0002r');
results.restarted = await waitFor(() => output.includes('restarted ticker'));
results.ticksAfter = await waitFor(() => (output.match(/ticker tick/g) || []).length > results.ticksBefore);

proc.write('\u0002?');
results.help = await waitFor(() => output.includes('mth help'));
await sleep(200);
proc.write('z');
await sleep(200);

proc.write('\u0002[');
results.scroll = await waitFor(() => output.includes('SCROLL'));
await sleep(200);
proc.write('\u001b');
await sleep(200);

proc.write('\u0002q');
await waitFor(() => exited, 8000);

results.exited = Boolean(exited);
results.exitCode = exited ? exited.exitCode : null;
results.sample = output.slice(-600);
process.stdout.write(JSON.stringify(results));
process.exit(0);
