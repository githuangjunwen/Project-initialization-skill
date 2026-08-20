import { isAbsolute } from 'node:path';
import { ProjectMapError } from './errors.mjs';
import { listAncestors, loadNode } from './nodes.mjs';
import {
  invalidateDerived, loadIndex, saveNodeAndIndex
} from './store.mjs';

const GSD_FIELDS = {
  requirement: 'requirement_ids',
  milestone: 'milestone',
  phase: 'phase_ids',
  plan: 'plan_paths'
};

const EVIDENCE_FIELDS = {
  code: 'code',
  test: 'tests',
  document: 'documents'
};

function uniquePush(list, value) {
  if (!list.includes(value)) list.push(value);
}

function validateEvidencePath(path) {
  const normalized = path.replaceAll('\\', '/');
  if (
    !normalized || isAbsolute(path) || /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new ProjectMapError(
      'INVALID_EVIDENCE_PATH',
      `Evidence path must be repository-relative without '..': ${path}`
    );
  }
  return normalized.replace(/^\.\//, '');
}

export async function linkEvidence(
  root,
  nodeId,
  { kind, path },
  now = new Date().toISOString()
) {
  const field = EVIDENCE_FIELDS[kind];
  if (!field) {
    throw new ProjectMapError(
      'INVALID_EVIDENCE_KIND', `Invalid evidence kind: ${kind}`
    );
  }
  const safePath = validateEvidencePath(path);
  const index = await loadIndex(root);
  const node = await loadNode(root, nodeId);
  uniquePush(node.evidence[field], safePath);
  node.updated_at = now;
  await saveNodeAndIndex(root, node, index);
  await invalidateDerived(root);
  return node;
}

export async function linkGsd(
  root,
  nodeId,
  { kind, value },
  now = new Date().toISOString()
) {
  const field = GSD_FIELDS[kind];
  if (!field || !value) {
    throw new ProjectMapError('INVALID_GSD_LINK', `Invalid GSD link: ${kind}`);
  }
  const index = await loadIndex(root);
  const node = await loadNode(root, nodeId);
  if (kind === 'milestone') {
    const previous = node.gsd[field];
    if (previous && previous !== value) {
      const previousKey = `milestone:${previous}`;
      index.gsd_reverse[previousKey] = (
        index.gsd_reverse[previousKey] ?? []
      ).filter(id => id !== nodeId);
      if (index.gsd_reverse[previousKey].length === 0) {
        delete index.gsd_reverse[previousKey];
      }
    }
    node.gsd[field] = value;
  } else uniquePush(node.gsd[field], value);

  const reverseKey = `${kind}:${value}`;
  index.gsd_reverse[reverseKey] ??= [];
  uniquePush(index.gsd_reverse[reverseKey], nodeId);
  index.gsd_reverse[reverseKey].sort();
  node.updated_at = now;
  await saveNodeAndIndex(root, node, index);
  await invalidateDerived(root);
  return node;
}

async function descendants(root, nodeId) {
  const index = await loadIndex(root);
  const result = [];
  const queue = [nodeId];
  while (queue.length) {
    const parent = queue.shift();
    const children = Object.keys(index.nodes)
      .filter(id => index.nodes[id].parent_id === parent)
      .sort();
    for (const id of children) {
      result.push(await loadNode(root, id));
      queue.push(id);
    }
  }
  return result;
}

export async function traceNode(root, nodeId) {
  const index = await loadIndex(root);
  const node = await loadNode(root, nodeId);
  const ancestors = await listAncestors(root, nodeId);
  const forward = [];
  for (const link of node.source_links) {
    forward.push({ kind: 'source', id: link.source_id, node_id: nodeId });
  }
  for (const ancestor of ancestors.filter(item => item.type !== 'project')) {
    forward.push({ kind: ancestor.type, id: ancestor.id });
  }
  forward.push({ kind: node.type, id: node.id });
  for (const id of node.gsd.requirement_ids) {
    forward.push({ kind: 'gsd-requirement', id, node_id: node.id });
  }
  if (node.gsd.milestone) {
    forward.push({ kind: 'gsd-milestone', id: node.gsd.milestone, node_id: node.id });
  }
  for (const id of node.gsd.phase_ids) {
    forward.push({ kind: 'gsd-phase', id, node_id: node.id });
  }
  for (const path of node.gsd.plan_paths) {
    forward.push({ kind: 'gsd-plan', path, node_id: node.id });
  }

  const related = [node, ...await descendants(root, nodeId)];
  for (const item of related.filter(candidate => candidate.type === 'task')) {
    forward.push({ kind: 'task', id: item.id });
  }
  for (const kind of ['code', 'test', 'document']) {
    const field = EVIDENCE_FIELDS[kind];
    for (const item of related) {
      for (const path of item.evidence[field]) {
        forward.push({ kind, path, node_id: item.id });
      }
    }
  }

  const reverse = Object.entries(index.gsd_reverse).sort().map(([key, nodeIds]) => {
    const separator = key.indexOf(':');
    const kind = key.slice(0, separator);
    const value = key.slice(separator + 1);
    return { kind: `gsd-${kind}`, value, node_ids: nodeIds };
  });
  return { node_id: nodeId, forward, reverse };
}
