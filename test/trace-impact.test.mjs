import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedNow } from './helpers/repo.mjs';
import { loadNode, updateNode } from '../src/nodes.mjs';
import { linkEvidence, linkSource, traceNode } from '../src/trace.mjs';
import { captureSource } from '../src/sources.mjs';
import { reviewImpact } from '../src/impact.mjs';
import { tracedFeatureRepo } from './helpers/traced-repo.mjs';

test('trace returns source through test evidence', async () => {
  const repo = await tracedFeatureRepo();
  const result = await traceNode(repo, 'F-001');
  assert.deepEqual(result.forward.map(edge => edge.kind), [
    'source', 'epic', 'feature', 'gsd-requirement', 'gsd-phase',
    'gsd-plan', 'task', 'code', 'test'
  ]);
  assert.deepEqual(result.reverse.find(edge => edge.kind === 'gsd-requirement').node_ids, ['F-001']);
});

test('changing an epic marks descendants and evidence for review', async () => {
  const repo = await tracedFeatureRepo();
  await updateNode(repo, 'E-001', { summary: 'Changed boundary' }, fixedNow);
  const feature = await loadNode(repo, 'F-001');
  const task = await loadNode(repo, 'T-001');
  assert.equal(feature.review.state, 'needs-review');
  assert.equal(feature.review.reasons[0].changed_node, 'E-001');
  assert.equal(task.review.state, 'needs-review');

  await assert.rejects(
    reviewImpact(repo, 'F-001', { authority: 'ai', note: 'looks fine', now: fixedNow }),
    error => error.code === 'INVALID_REVIEW_AUTHORITY'
  );
  await reviewImpact(repo, 'F-001', {
    authority: 'user', note: 'Reviewed against new boundary', now: fixedNow
  });
  assert.equal((await loadNode(repo, 'F-001')).review.state, 'clean');
});

test('evidence paths must remain repository-relative', async () => {
  const repo = await tracedFeatureRepo();
  await assert.rejects(
    linkEvidence(repo, 'T-001', { kind: 'code', path: '../outside.js' }, fixedNow),
    error => error.code === 'INVALID_EVIDENCE_PATH'
  );
  await assert.rejects(
    linkEvidence(repo, 'T-001', { kind: 'code', path: '.' }, fixedNow),
    error => error.code === 'INVALID_EVIDENCE_PATH'
  );
});

test('a later immutable source can be linked to an existing node', async () => {
  const repo = await tracedFeatureRepo();
  const source = await captureSource(repo, {
    text: 'New clarification', origin: 'user', now: fixedNow
  });
  await linkSource(repo, 'F-001', {
    sourceId: source.id, excerpt: 'New clarification'
  }, fixedNow);
  const trace = await traceNode(repo, 'F-001');
  assert.deepEqual(
    trace.forward.filter(edge => edge.kind === 'source').map(edge => edge.id),
    ['SRC-001', 'SRC-002']
  );
});
