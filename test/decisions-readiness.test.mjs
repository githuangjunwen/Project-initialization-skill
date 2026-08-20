import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixtureRepo, fixedNow } from './helpers/repo.mjs';
import { initializeStore } from '../src/store.mjs';
import { addAcceptanceCriterion, addNode, updateNode } from '../src/nodes.mjs';
import { confirmDecision, createDecision, loadDecision } from '../src/decisions.mjs';
import { evaluateReadiness, writeReadinessStamp } from '../src/readiness.mjs';
import { linkGsd } from '../src/trace.mjs';

async function repoWithFeature() {
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
    type: 'feature', parentId: epic.id, title: 'Delete account', now: fixedNow
  });
  await updateNode(repo, feature.id, { summary: 'Users request account deletion' }, fixedNow);
  await addAcceptanceCriterion(repo, feature.id, 'Deletion request is observable', fixedNow);
  return repo;
}

test('AI proposal cannot become confirmed without authority', async () => {
  const repo = await repoWithFeature();
  const decision = await createDecision(repo, {
    nodeId: 'F-001', category: 'permission', question: 'Who can delete?',
    proposal: 'Admins', critical: true, actor: 'ai', now: fixedNow
  });
  assert.equal(decision.status, 'proposed');
  assert.equal(decision.critical, true);
  await assert.rejects(
    confirmDecision(repo, decision.id, {
      authority: 'ai', evidence: 'model choice', now: fixedNow
    }),
    error => error.code === 'INVALID_CONFIRMATION_AUTHORITY'
  );
});

test('critical proposed decision blocks planning until a user confirms it', async () => {
  const repo = await repoWithFeature();
  const decision = await createDecision(repo, {
    nodeId: 'F-001', category: 'retention', question: 'How long?',
    proposal: '30 days', critical: false, actor: 'ai', now: fixedNow
  });

  const blocked = await evaluateReadiness(repo, 'F-001', 'plan');
  assert.equal(blocked.ready, false);
  assert.deepEqual(
    blocked.blockers.map(item => item.code),
    ['CRITICAL_DECISION_UNCONFIRMED']
  );

  await confirmDecision(repo, decision.id, {
    authority: 'user', evidence: 'User approved in task', now: fixedNow
  });
  const ready = await evaluateReadiness(repo, 'F-001', 'plan');
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);
  assert.equal((await loadDecision(repo, decision.id)).history.length, 1);
});

test('plan readiness reports deterministic structural blockers', async () => {
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

  const result = await evaluateReadiness(repo, feature.id, 'plan');
  assert.deepEqual(result.blockers.map(item => item.code), [
    'MISSING_SUMMARY', 'MISSING_ACCEPTANCE_CRITERIA'
  ]);
});

test('readiness stamp contains a state hash and blocked recheck removes it', async () => {
  const repo = await repoWithFeature();
  const ready = await evaluateReadiness(repo, 'F-001', 'plan');
  const stampPath = await writeReadinessStamp(repo, ready, fixedNow);
  const stamp = JSON.parse(await readFile(stampPath, 'utf8'));
  assert.equal(stamp.node_id, 'F-001');
  assert.match(stamp.state_sha256, /^[a-f0-9]{64}$/);

  await updateNode(repo, 'F-001', { summary: '' }, fixedNow);
  const blocked = await evaluateReadiness(repo, 'F-001', 'plan');
  assert.equal(blocked.ready, false);
  await assert.rejects(access(join(
    repo, '.planning/project-map/gates/current-plan.ready'
  )));
});

test('story and task verification details can satisfy the code gate', async () => {
  const repo = await repoWithFeature();
  const story = await addNode(repo, {
    type: 'story', parentId: 'F-001', title: 'Delete request', now: fixedNow
  });
  await updateNode(repo, story.id, {
    summary: 'Submit a deletion request',
    verification_method: 'Exercise the request API and inspect its response'
  }, fixedNow);
  await addAcceptanceCriterion(repo, story.id, 'Request returns an identifier', fixedNow);
  const task = await addNode(repo, {
    type: 'task', parentId: story.id, title: 'Implement API', now: fixedNow
  });
  await updateNode(repo, task.id, {
    summary: 'Implement the request endpoint',
    completion_condition: 'Endpoint and automated test pass',
    test_steps: ['Run the endpoint test']
  }, fixedNow);
  await addAcceptanceCriterion(repo, task.id, 'Automated test passes', fixedNow);
  await linkGsd(repo, task.id, {
    kind: 'plan', value: '.planning/phases/02-delete/02-01-PLAN.md'
  }, fixedNow);

  const result = await evaluateReadiness(repo, task.id, 'code');
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
});
