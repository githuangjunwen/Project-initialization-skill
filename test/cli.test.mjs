import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';
import { assertConfined } from '../src/paths.mjs';

test('unknown command exits 2 with stable JSON error', async () => {
  const stdout = [];
  const stderr = [];

  const code = await run(['unknown', '--json'], {
    cwd: process.cwd(),
    stdout: value => stdout.push(value),
    stderr: value => stderr.push(value)
  });

  assert.equal(code, 2);
  assert.equal(stderr.join(''), '');
  assert.deepEqual(JSON.parse(stdout.join('')), {
    ok: false,
    error: { code: 'UNKNOWN_COMMAND', message: 'Unknown command: unknown' }
  });
});

test('path confinement rejects paths outside project-map storage', () => {
  assert.throws(
    () => assertConfined('/tmp/repo/.planning/project-map', '/tmp/outside'),
    error => error.code === 'PATH_OUTSIDE_PROJECT_MAP'
  );
});
