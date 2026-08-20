import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixtureRepo, fixedNow } from './helpers/repo.mjs';
import { initializeStore } from '../src/store.mjs';
import {
  addNode, listAncestors, listChildren, loadNode, updateNode
} from '../src/nodes.mjs';

async function initializedRepo() {
  const repo = await createFixtureRepo();
  await initializeStore(repo, {
    title: 'Demo', rawSource: 'original idea', origin: 'user', now: fixedNow
  });
  return repo;
}

test('allocates stable IDs and permits an incomplete tree', async () => {
  const repo = await initializedRepo();
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  const epic = await addNode(repo, {
    type: 'epic', parentId: project.id, title: 'Auth', now: fixedNow
  });

  assert.equal(project.id, 'P-001');
  assert.equal(epic.id, 'E-001');
  assert.deepEqual(epic.source_links, project.source_links);
  assert.deepEqual((await listChildren(repo, project.id)).map(node => node.id), ['E-001']);
  assert.deepEqual((await listAncestors(repo, epic.id)).map(node => node.id), ['P-001']);
});

test('rejects skipped levels and duplicate project roots', async () => {
  const repo = await initializedRepo();
  await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });

  await assert.rejects(
    addNode(repo, {
      type: 'story', parentId: 'P-001', title: 'Invalid', now: fixedNow
    }),
    error => error.code === 'INVALID_PARENT_TYPE'
  );
  await assert.rejects(
    addNode(repo, {
      type: 'project', title: 'Second', sourceIds: ['SRC-001'], now: fixedNow
    }),
    error => error.code === 'PROJECT_ALREADY_EXISTS'
  );
});

test('a failed node mutation does not consume an ID', async () => {
  const repo = await initializedRepo();
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  await assert.rejects(
    addNode(repo, { type: 'epic', parentId: 'missing', title: 'Bad', now: fixedNow }),
    error => error.code === 'PARENT_NOT_FOUND'
  );
  const epic = await addNode(repo, {
    type: 'epic', parentId: project.id, title: 'Good', now: fixedNow
  });
  assert.equal(epic.id, 'E-001');
});

test('updates supported fields and invalidates derived artifacts', async () => {
  const repo = await initializedRepo();
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  const base = join(repo, '.planning/project-map');
  await mkdir(join(base, 'gates'), { recursive: true });
  await Promise.all([
    writeFile(join(base, 'CURRENT.md'), 'old'),
    writeFile(join(base, 'PROJECT-MAP.md'), 'old'),
    writeFile(join(base, 'gates/current-plan.ready'), 'old'),
    writeFile(join(base, 'gates/current-code.ready'), 'old')
  ]);

  const result = await updateNode(repo, project.id, {
    summary: 'clear scope', status: 'exploring'
  }, fixedNow);
  assert.deepEqual(result.changedFields, ['status', 'summary']);
  assert.equal((await loadNode(repo, project.id)).summary, 'clear scope');
  for (const path of [
    'CURRENT.md', 'PROJECT-MAP.md',
    'gates/current-plan.ready', 'gates/current-code.ready'
  ]) {
    await assert.rejects(import('node:fs/promises').then(fs => fs.access(join(base, path))));
  }
});

test('rejects unsupported node patches', async () => {
  const repo = await initializedRepo();
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  await assert.rejects(
    updateNode(repo, project.id, { parent_id: 'E-999' }, fixedNow),
    error => error.code === 'INVALID_PATCH_FIELD'
  );
});

test('a task cannot be completed without code, test, or document evidence', async () => {
  const repo = await initializedRepo();
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  const epic = await addNode(repo, {
    type: 'epic', parentId: project.id, title: 'Epic', now: fixedNow
  });
  const feature = await addNode(repo, {
    type: 'feature', parentId: epic.id, title: 'Feature', now: fixedNow
  });
  const story = await addNode(repo, {
    type: 'story', parentId: feature.id, title: 'Story', now: fixedNow
  });
  const task = await addNode(repo, {
    type: 'task', parentId: story.id, title: 'Task', now: fixedNow
  });

  await assert.rejects(
    updateNode(repo, task.id, { status: 'done' }, fixedNow),
    error => error.code === 'TASK_EVIDENCE_REQUIRED'
  );
});
