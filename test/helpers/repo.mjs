import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const fixedNow = '2026-08-20T00:00:00.000Z';

export async function createFixtureRepo() {
  return mkdtemp(join(tmpdir(), 'project-map-test-'));
}
