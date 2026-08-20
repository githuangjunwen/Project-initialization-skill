import { access } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ProjectMapError } from './errors.mjs';

export function projectMapPaths(root) {
  const planning = join(resolve(root), '.planning');
  const base = join(planning, 'project-map');
  return {
    root: resolve(root),
    planning,
    base,
    index: join(base, 'index.json'),
    schemaVersion: join(base, 'schema-version.json'),
    sources: join(base, 'sources'),
    nodes: join(base, 'nodes'),
    decisions: join(base, 'decisions'),
    events: join(base, 'events', 'events.jsonl'),
    gates: join(base, 'gates'),
    current: join(base, 'CURRENT.md'),
    projectMap: join(base, 'PROJECT-MAP.md')
  };
}

export function assertConfined(base, candidate) {
  const resolvedBase = resolve(base);
  const resolvedCandidate = resolve(candidate);
  const relation = relative(resolvedBase, resolvedCandidate);
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) {
    return resolvedCandidate;
  }
  throw new ProjectMapError(
    'PATH_OUTSIDE_PROJECT_MAP',
    `Path is outside project-map storage: ${candidate}`
  );
}

export async function findProjectRoot(startDir) {
  let current = resolve(startDir);
  while (true) {
    try {
      await access(join(current, '.planning', 'project-map', 'index.json'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new ProjectMapError(
          'PROJECT_MAP_NOT_FOUND',
          `No .planning/project-map/index.json found from ${startDir}`
        );
      }
      current = parent;
    }
  }
}
