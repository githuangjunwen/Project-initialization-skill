import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tracedFeatureRepo } from './helpers/traced-repo.mjs';
import { checkProject, rebuildDerived } from '../src/check.mjs';
import { focusNode } from '../src/context.mjs';
import { linkEvidence, linkGsd } from '../src/trace.mjs';
import { createDecision } from '../src/decisions.mjs';

test('check detects canonical source tampering', async () => {
  const repo = await tracedFeatureRepo();
  await appendFile(join(repo, '.planning/project-map/sources/SRC-001.md'), 'tamper');
  const result = await checkProject(repo);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.code === 'SOURCE_LENGTH_MISMATCH'), true);
});

test('missing evidence is a warning and does not fail structural health', async () => {
  const repo = await tracedFeatureRepo();
  await linkEvidence(repo, 'T-001', { kind: 'document', path: 'docs/missing.md' });
  const result = await checkProject(repo);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some(error => error.code === 'EVIDENCE_PATH_MISSING'), true);
});

test('rebuild repairs generated files but refuses missing canonical nodes', async () => {
  const repo = await tracedFeatureRepo();
  await focusNode(repo, 'F-001');
  const mapPath = join(repo, '.planning/project-map/PROJECT-MAP.md');
  await writeFile(mapPath, 'stale');
  assert.equal(
    (await checkProject(repo)).errors.some(error => error.code === 'GENERATED_HASH_MISMATCH'),
    true
  );
  await rebuildDerived(repo);
  assert.notEqual(await readFile(mapPath, 'utf8'), 'stale');
  assert.equal((await checkProject(repo)).ok, true);

  await unlink(join(repo, '.planning/project-map/nodes/F-001.json'));
  await assert.rejects(
    rebuildDerived(repo), error => error.code === 'CANONICAL_DATA_INVALID'
  );
});

test('replacing a singleton GSD milestone keeps the reverse index consistent', async () => {
  const repo = await tracedFeatureRepo();
  await linkGsd(repo, 'F-001', { kind: 'milestone', value: 'M1' });
  await linkGsd(repo, 'F-001', { kind: 'milestone', value: 'M2' });
  const result = await checkProject(repo);
  assert.equal(result.errors.some(error => error.code === 'GSD_REVERSE_MISMATCH'), false);
});

test('check rejects an invalid canonical decision state', async () => {
  const repo = await tracedFeatureRepo();
  const decision = await createDecision(repo, {
    nodeId: 'F-001', category: 'product', question: 'Which mode?',
    proposal: 'Simple', actor: 'ai'
  });
  const path = join(repo, '.planning/project-map/decisions', `${decision.id}.json`);
  const data = JSON.parse(await readFile(path, 'utf8'));
  data.status = 'invented';
  await writeFile(path, JSON.stringify(data));

  const result = await checkProject(repo);
  assert.equal(
    result.errors.some(error => error.code === 'DECISION_SCHEMA_INVALID'),
    true
  );
});
