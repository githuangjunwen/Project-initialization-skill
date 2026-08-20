#!/usr/bin/env node

import { run } from '../src/cli.mjs';

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: value => process.stdout.write(value),
  stderr: value => process.stderr.write(value)
});
