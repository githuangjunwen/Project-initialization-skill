import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixtureRepo, fixedNow } from './repo.mjs';
import { initializeStore } from '../../src/store.mjs';
import { addNode } from '../../src/nodes.mjs';
import { linkEvidence, linkGsd } from '../../src/trace.mjs';

export async function tracedFeatureRepo() {
  const repo = await createFixtureRepo();
  await initializeStore(repo, {
    title: 'Demo', rawSource: 'idea', origin: 'user', now: fixedNow
  });
  const project = await addNode(repo, {
    type: 'project', title: 'Demo', sourceIds: ['SRC-001'], now: fixedNow
  });
  const epic = await addNode(repo, {
    type: 'epic', parentId: project.id, title: 'Auth', now: fixedNow
  });
  const feature = await addNode(repo, {
    type: 'feature', parentId: epic.id, title: 'Login', now: fixedNow
  });
  const story = await addNode(repo, {
    type: 'story', parentId: feature.id, title: 'Password login', now: fixedNow
  });
  const task = await addNode(repo, {
    type: 'task', parentId: story.id, title: 'Implement endpoint', now: fixedNow
  });
  await linkGsd(repo, feature.id, { kind: 'requirement', value: 'REQ-1' }, fixedNow);
  await linkGsd(repo, feature.id, { kind: 'phase', value: '2' }, fixedNow);
  await linkGsd(repo, feature.id, {
    kind: 'plan', value: '.planning/phases/02-auth/02-01-PLAN.md'
  }, fixedNow);
  await mkdir(join(repo, 'src'), { recursive: true });
  await mkdir(join(repo, 'test'), { recursive: true });
  await writeFile(join(repo, 'src/login.mjs'), 'export const login = true;\n');
  await writeFile(join(repo, 'test/login.test.mjs'), '// test\n');
  await linkEvidence(repo, task.id, { kind: 'code', path: 'src/login.mjs' }, fixedNow);
  await linkEvidence(repo, task.id, { kind: 'test', path: 'test/login.test.mjs' }, fixedNow);
  return repo;
}
