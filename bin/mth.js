#!/usr/bin/env node
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
