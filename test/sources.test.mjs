import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFixtureRepo, fixedNow } from './helpers/repo.mjs';
import { initializeStore } from '../src/store.mjs';
import { captureSource, readSource, verifySources } from '../src/sources.mjs';

test('init preserves arbitrary raw bytes and refuses overwrite', async () => {
  const repo = await createFixtureRepo();
  const rawSource = '模糊想法\n```text\n嵌套围栏\n```\n第二行\n';

  await initializeStore(repo, {
    title: 'Demo', rawSource, origin: 'user', now: fixedNow
  });

  assert.equal(await readSource(repo, 'SRC-001'), rawSource);
  await assert.rejects(
    initializeStore(repo, {
      title: 'Again', rawSource: 'other', origin: 'user', now: fixedNow
    }),
    error => error.code === 'ALREADY_INITIALIZED'
  );
});

test('capture creates a new source instead of updating an existing source', async () => {
  const repo = await createFixtureRepo();
  await initializeStore(repo, {
    title: 'Demo', rawSource: 'first', origin: 'user', now: fixedNow
  });

  const source = await captureSource(repo, {
    text: 'second', origin: 'https://example.test/issue/2', now: fixedNow
  });

  assert.equal(source.id, 'SRC-002');
  assert.equal(await readSource(repo, 'SRC-001'), 'first');
  assert.equal(await readSource(repo, 'SRC-002'), 'second');
});

test('verification detects a modified source body', async () => {
  const repo = await createFixtureRepo();
  await initializeStore(repo, {
    title: 'Demo', rawSource: 'original', origin: 'user', now: fixedNow
  });
  await appendFile(
    join(repo, '.planning/project-map/sources/SRC-001.md'),
    'changed'
  );

  const result = await verifySources(repo);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SOURCE_LENGTH_MISMATCH');
});

test('source metadata records raw length and SHA-256', async () => {
  const repo = await createFixtureRepo();
  await initializeStore(repo, {
    title: 'Demo', rawSource: '原文', origin: 'user', now: fixedNow
  });

  const file = await readFile(
    join(repo, '.planning/project-map/sources/SRC-001.md'),
    'utf8'
  );
  assert.match(file, /- Raw-Bytes: 6/);
  assert.match(file, /- SHA-256: [a-f0-9]{64}/);
});
