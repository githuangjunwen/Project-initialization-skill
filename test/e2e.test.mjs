import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../src/cli.mjs';
import { checkProject } from '../src/check.mjs';
import { createFixtureRepo } from './helpers/repo.mjs';

async function cli(repo, args) {
  const stdout = [];
  const stderr = [];
  const argv = args.includes('--json') ? args : [...args, '--json'];
  const code = await run(argv, {
    cwd: repo,
    stdout: value => stdout.push(value),
    stderr: value => stderr.push(value)
  });
  return {
    code,
    output: stdout.length ? JSON.parse(stdout.join('')) : null,
    stderr: stderr.join('')
  };
}

test('fuzzy idea progresses to traceable ready work without losing intent', async () => {
  const repo = await createFixtureRepo();
  await cli(repo, [
    'init', '--project-title', 'Demo', '--text', '做一个团队审批工具'
  ]);
  await cli(repo, [
    'add', 'project', '--title', '审批工具', '--source', 'SRC-001'
  ]);
  await cli(repo, [
    'add', 'epic', '--parent', 'P-001', '--title', '审批流程'
  ]);
  await cli(repo, [
    'add', 'feature', '--parent', 'E-001', '--title', '删除申请'
  ]);
  await cli(repo, [
    'node', 'update', 'F-001', '--summary', '用户提交并追踪删除申请'
  ]);
  await cli(repo, [
    'ac', 'add', 'F-001', '--text', '用户可以提交删除申请'
  ]);
  await cli(repo, [
    'decision', 'create', 'F-001', '--category', 'approval',
    '--question', '谁批准删除？', '--proposal', '管理员'
  ]);

  const blocked = await cli(repo, [
    'readiness', 'F-001', '--stage', 'plan', '--json'
  ]);
  assert.equal(blocked.code, 3);
  assert.deepEqual(
    blocked.output.data.blockers.map(item => item.code),
    ['CRITICAL_DECISION_UNCONFIRMED']
  );

  await cli(repo, [
    'decide', 'D-001', '--confirm', '--authority', 'user',
    '--evidence', '产品负责人确认'
  ]);
  await cli(repo, [
    'link', 'F-001', '--gsd-requirement', 'DELETE-01', '--gsd-phase', '2'
  ]);
  await cli(repo, ['focus', 'F-001']);
  const ready = await cli(repo, [
    'readiness', 'F-001', '--stage', 'plan', '--json'
  ]);
  assert.equal(ready.code, 0);
  assert.equal(ready.output.data.ready, true);

  const source = await readFile(
    join(repo, '.planning/project-map/sources/SRC-001.md'), 'utf8'
  );
  assert.match(source, /做一个团队审批工具/);
  const trace = await cli(repo, ['trace', 'F-001']);
  assert.deepEqual(trace.output.data.forward.map(edge => edge.kind), [
    'source', 'epic', 'feature', 'gsd-requirement', 'gsd-phase'
  ]);
  assert.equal((await checkProject(repo)).ok, true);
});
