import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixtureRepo, fixedNow } from './helpers/repo.mjs';
import { initializeStore, loadIndex } from '../src/store.mjs';
import { addNode, updateNode } from '../src/nodes.mjs';
import { focusNode, resolveContext } from '../src/context.mjs';

async function repoWithTwoEpics() {
  const repo = await createFixtureRepo();
  await initializeStore(repo, {
    title: 'Demo', rawSource: '帮助团队安全推进产品', origin: 'user', now: fixedNow
  });
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  await updateNode(repo, project.id, { summary: 'Product scope' }, fixedNow);
  const epicOne = await addNode(repo, {
    type: 'epic', parentId: project.id, title: 'Auth', now: fixedNow
  });
  await updateNode(repo, epicOne.id, { summary: 'Public auth summary' }, fixedNow);
  const epicTwo = await addNode(repo, {
    type: 'epic', parentId: project.id, title: 'Billing', now: fixedNow
  });
  await updateNode(repo, epicTwo.id, { summary: 'E-002 private body' }, fixedNow);
  const feature = await addNode(repo, {
    type: 'feature', parentId: epicOne.id, title: 'Login', now: fixedNow
  });
  await updateNode(repo, feature.id, { summary: 'Sign in safely' }, fixedNow);
  await addNode(repo, {
    type: 'story', parentId: feature.id, title: 'Password login', now: fixedNow
  });
  return repo;
}

test('focus includes ancestors and direct children but excludes sibling bodies', async () => {
  const repo = await repoWithTwoEpics();
  const context = await resolveContext(repo, 'F-001');

  assert.deepEqual(
    context.must_read.nodes.map(node => node.id),
    ['P-001', 'E-001', 'F-001']
  );
  assert.deepEqual(
    context.may_need.children.map(node => node.id),
    ['S-001']
  );
  assert.equal(context.do_not_read_by_default.nodes.includes('E-002'), true);
  assert.equal(JSON.stringify(context).includes('E-002 private body'), false);
});

test('project map renders Chinese headings and exactly one next action', async () => {
  const repo = await repoWithTwoEpics();
  const result = await focusNode(repo, 'E-001', fixedNow);
  const text = await readFile(
    join(repo, '.planning/project-map/PROJECT-MAP.md'), 'utf8'
  );

  assert.match(text, /# 项目地图/);
  assert.match(text, /当前节点：E-001/);
  assert.equal((text.match(/建议的下一步操作：/g) ?? []).length, 1);
  assert.doesNotMatch(text, /Current node:|Recommended next action:/);
  assert.match(text, /帮助团队安全推进产品/);
  assert.equal(result.contextPath.endsWith('CURRENT.md'), true);
  assert.equal((await loadIndex(repo)).current_node_id, 'E-001');
  const current = await readFile(
    join(repo, '.planning/project-map/CURRENT.md'), 'utf8'
  );
  assert.match(current, /# 当前节点/);
  assert.match(current, /## 建议的下一步操作/);
  assert.doesNotMatch(current, /# Current Node|## Recommended Next Action/);
  assert.match(current, /\.planning\/project-map\/nodes\/P-001\.json/);
  assert.match(current, /\.planning\/project-map\/nodes\/E-002\.json/);
});

test('status context can inspect another node without changing focus', async () => {
  const repo = await repoWithTwoEpics();
  await focusNode(repo, 'E-001', fixedNow);
  const context = await resolveContext(repo, 'E-002');
  assert.equal(context.current_node.id, 'E-002');
  assert.equal((await loadIndex(repo)).current_node_id, 'E-001');
});
