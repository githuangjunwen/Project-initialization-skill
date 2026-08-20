import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/cli.mjs';
import { assertConfined } from '../src/paths.mjs';
import { createFixtureRepo } from './helpers/repo.mjs';

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

test('init and capture accept inline source text', async () => {
  const repo = await createFixtureRepo();
  const output = [];
  const io = {
    cwd: repo,
    stdout: value => output.push(value),
    stderr: () => {}
  };

  assert.equal(await run([
    'init', '--project-title', 'Demo', '--text', 'first', '--json'
  ], io), 0);
  assert.equal(JSON.parse(output.pop()).data.source.id, 'SRC-001');

  assert.equal(await run([
    'capture', '--text', 'second', '--origin', 'user-note', '--json'
  ], io), 0);
  assert.equal(JSON.parse(output.pop()).data.source.id, 'SRC-002');
});

test('init requires exactly one source input', async () => {
  const repo = await createFixtureRepo();
  const output = [];
  const code = await run([
    'init', '--project-title', 'Demo', '--text', 'one',
    '--source', 'idea.txt', '--json'
  ], {
    cwd: repo,
    stdout: value => output.push(value),
    stderr: () => {}
  });

  assert.equal(code, 2);
  assert.equal(JSON.parse(output.join('')).error.code, 'INVALID_ARGUMENTS');
});

test('add and node update manage the recursive tree', async () => {
  const repo = await createFixtureRepo();
  const output = [];
  const io = { cwd: repo, stdout: value => output.push(value), stderr: () => {} };
  await run(['init', '--project-title', 'Demo', '--text', 'idea', '--json'], io);

  assert.equal(await run([
    'add', 'project', '--title', 'Demo', '--source', 'SRC-001', '--json'
  ], io), 0);
  assert.equal(JSON.parse(output.pop()).data.node.id, 'P-001');
  assert.equal(await run([
    'add', 'epic', '--parent', 'P-001', '--title', 'Auth', '--json'
  ], io), 0);
  assert.equal(JSON.parse(output.pop()).data.node.id, 'E-001');

  assert.equal(await run([
    'node', 'update', 'E-001', '--summary', 'Login boundary',
    '--status', 'exploring', '--json'
  ], io), 0);
  assert.deepEqual(
    JSON.parse(output.pop()).data.changed_fields,
    ['status', 'summary']
  );
});
