const label = process.argv[2] ?? 'task';
const interval = Number(process.argv[3] ?? 1000);
let count = 0;

console.log(`${label}: starting (every ${interval}ms)`);
setInterval(() => {
  count += 1;
  console.log(`${new Date().toLocaleTimeString()}  ${label}: tick ${count}`);
}, interval);