import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ProjectMapError } from './errors.mjs';
import { readJson, writeJsonAtomic } from './json.mjs';
import { projectMapPaths } from './paths.mjs';
import { createSourceRecord, writeSource } from './sources.mjs';

export async function storeExists(root) {
  try {
    await access(projectMapPaths(root).index);
    return true;
  } catch {
    return false;
  }
}

export async function loadIndex(root) {
  const paths = projectMapPaths(root);
  try {
    return await readJson(paths.index);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ProjectMapError(
        'PROJECT_MAP_NOT_FOUND',
        `No project map found at ${paths.index}`
      );
    }
    throw error;
  }
}

export async function saveIndex(root, index) {
  await writeJsonAtomic(projectMapPaths(root).index, index);
}

export async function initializeStore(root, {
  title,
  rawSource,
  origin = 'user',
  now = new Date().toISOString()
}) {
  if (await storeExists(root)) {
    throw new ProjectMapError(
      'ALREADY_INITIALIZED',
      'Project map is already initialized'
    );
  }

  const paths = projectMapPaths(root);
  await Promise.all([
    mkdir(paths.sources, { recursive: true }),
    mkdir(paths.nodes, { recursive: true }),
    mkdir(paths.decisions, { recursive: true }),
    mkdir(paths.gates, { recursive: true }),
    mkdir(dirname(paths.events), { recursive: true })
  ]);

  const source = createSourceRecord('SRC-001', rawSource, origin, now);
  await writeSource(root, source, rawSource);

  const index = {
    schema_version: 1,
    project_title: title,
    current_node_id: null,
    counters: { P: 0, E: 0, F: 0, S: 0, T: 0, SRC: 1, D: 0 },
    nodes: {},
    sources: {
      [source.id]: {
        path: source.path,
        sha256: source.sha256,
        raw_bytes: source.raw_bytes,
        origin: source.origin,
        captured_at: source.captured_at
      }
    },
    gsd_reverse: {},
    generation: {
      project_map_sha256: null,
      current_sha256: null
    }
  };

  await writeJsonAtomic(paths.schemaVersion, { schema_version: 1 });
  await saveIndex(root, index);
  return { index, source };
}
