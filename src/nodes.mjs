import { join } from 'node:path';
import { ProjectMapError } from './errors.mjs';
import {
  NODE_PREFIX, NODE_STATUS, NODE_TYPES, allowedParentType
} from './model.mjs';
import { readJson } from './json.mjs';
import { assertConfined, projectMapPaths } from './paths.mjs';
import {
  invalidateDerived, loadIndex, saveNodeAndIndex
} from './store.mjs';

function nodeIndexRecord(node) {
  return {
    path: `nodes/${node.id}.json`,
    type: node.type,
    parent_id: node.parent_id,
    title: node.title,
    status: node.status
  };
}

function validateType(type) {
  if (!NODE_TYPES.includes(type)) {
    throw new ProjectMapError('INVALID_NODE_TYPE', `Invalid node type: ${type}`);
  }
}

function linksFor(sourceIds, index) {
  return sourceIds.map(sourceId => {
    if (!index.sources[sourceId]) {
      throw new ProjectMapError(
        'SOURCE_NOT_FOUND', `Unknown source: ${sourceId}`
      );
    }
    return { source_id: sourceId, relation: 'derived-from', excerpt: '' };
  });
}

export async function loadNode(root, id) {
  const index = await loadIndex(root);
  const record = index.nodes[id];
  if (!record) {
    throw new ProjectMapError('NODE_NOT_FOUND', `Unknown node: ${id}`);
  }
  const paths = projectMapPaths(root);
  return readJson(assertConfined(paths.base, join(paths.base, record.path)));
}

export async function addNode(root, {
  type,
  parentId = null,
  title,
  sourceIds = [],
  now = new Date().toISOString()
}) {
  validateType(type);
  if (!title?.trim()) {
    throw new ProjectMapError('TITLE_REQUIRED', 'Node title is required');
  }

  const index = await loadIndex(root);
  let parent = null;
  if (type === 'project') {
    if (parentId !== null) {
      throw new ProjectMapError(
        'INVALID_PARENT_TYPE', 'Project nodes cannot have a parent'
      );
    }
    if (Object.values(index.nodes).some(node => node.type === 'project')) {
      throw new ProjectMapError(
        'PROJECT_ALREADY_EXISTS', 'Only one project root is allowed'
      );
    }
  } else {
    if (!parentId || !index.nodes[parentId]) {
      throw new ProjectMapError(
        'PARENT_NOT_FOUND', `Unknown parent: ${parentId ?? ''}`
      );
    }
    parent = await loadNode(root, parentId);
    if (parent.type !== allowedParentType(type)) {
      throw new ProjectMapError(
        'INVALID_PARENT_TYPE',
        `${type} requires a ${allowedParentType(type)} parent`
      );
    }
  }

  const sourceLinks = sourceIds.length > 0
    ? linksFor(sourceIds, index)
    : parent?.source_links ?? [];
  if (sourceLinks.length === 0) {
    throw new ProjectMapError(
      'SOURCE_LINK_REQUIRED', 'Node must be traceable to at least one source'
    );
  }

  const prefix = NODE_PREFIX[type];
  const number = index.counters[prefix] + 1;
  const id = `${prefix}-${String(number).padStart(3, '0')}`;
  const node = {
    schema_version: 1,
    id,
    type,
    parent_id: parentId,
    title: title.trim(),
    summary: '',
    verification_method: '',
    completion_condition: '',
    test_steps: [],
    status: 'idea',
    blocked: false,
    source_links: sourceLinks,
    acceptance_criteria: [],
    decision_ids: [],
    open_questions: [],
    gsd: {
      requirement_ids: [], milestone: null, phase_ids: [], plan_paths: []
    },
    evidence: { code: [], tests: [], documents: [] },
    review: { state: 'clean', reasons: [] },
    created_at: now,
    updated_at: now
  };

  index.counters[prefix] = number;
  index.nodes[id] = nodeIndexRecord(node);
  await saveNodeAndIndex(root, node, index);
  await invalidateDerived(root);
  return node;
}

export async function updateNode(root, id, patch, now = new Date().toISOString()) {
  const allowed = new Set([
    'title', 'summary', 'status', 'verification_method',
    'completion_condition', 'test_steps'
  ]);
  for (const field of Object.keys(patch)) {
    if (!allowed.has(field)) {
      throw new ProjectMapError(
        'INVALID_PATCH_FIELD', `Unsupported node patch field: ${field}`
      );
    }
  }
  if (patch.status !== undefined && !NODE_STATUS.includes(patch.status)) {
    throw new ProjectMapError(
      'INVALID_NODE_STATUS', `Invalid node status: ${patch.status}`
    );
  }
  if (patch.title !== undefined && !patch.title.trim()) {
    throw new ProjectMapError('TITLE_REQUIRED', 'Node title is required');
  }

  const index = await loadIndex(root);
  const node = await loadNode(root, id);
  if (patch.verification_method !== undefined && node.type !== 'story') {
    throw new ProjectMapError(
      'INVALID_FIELD_FOR_NODE', 'verification_method is only valid for stories'
    );
  }
  if (
    (patch.completion_condition !== undefined || patch.test_steps !== undefined) &&
    node.type !== 'task'
  ) {
    throw new ProjectMapError(
      'INVALID_FIELD_FOR_NODE',
      'completion_condition and test_steps are only valid for tasks'
    );
  }
  if (
    patch.test_steps !== undefined &&
    (!Array.isArray(patch.test_steps) || patch.test_steps.some(step => typeof step !== 'string'))
  ) {
    throw new ProjectMapError('INVALID_TEST_STEPS', 'test_steps must be strings');
  }
  if (
    patch.status === 'done' && node.type === 'task' &&
    Object.values(node.evidence).every(items => items.length === 0)
  ) {
    throw new ProjectMapError(
      'TASK_EVIDENCE_REQUIRED',
      'A task requires code, test, or document evidence before completion'
    );
  }
  const changedFields = Object.keys(patch)
    .filter(field => node[field] !== patch[field])
    .sort();
  if (changedFields.length === 0) return { node, changedFields };

  for (const field of changedFields) node[field] = patch[field];
  node.updated_at = now;
  index.nodes[id] = nodeIndexRecord(node);
  await saveNodeAndIndex(root, node, index);
  if (changedFields.some(field => [
    'title', 'summary', 'parent_id', 'source_links',
    'acceptance_criteria', 'decision_ids', 'confirmed_decision'
  ].includes(field))) {
    const { markImpact } = await import('./impact.mjs');
    await markImpact(root, id, changedFields, now);
  }
  await invalidateDerived(root);
  return { node, changedFields };
}

export async function addAcceptanceCriterion(
  root,
  nodeId,
  text,
  now = new Date().toISOString()
) {
  const index = await loadIndex(root);
  const node = await loadNode(root, nodeId);
  const nextNumber = node.acceptance_criteria.reduce((maximum, criterion) => {
    const number = Number.parseInt(criterion.id.slice(3), 10);
    return Math.max(maximum, Number.isNaN(number) ? 0 : number);
  }, 0) + 1;
  node.acceptance_criteria.push({
    id: `AC-${String(nextNumber).padStart(3, '0')}`,
    text,
    status: 'draft'
  });
  node.updated_at = now;
  index.nodes[nodeId] = nodeIndexRecord(node);
  await saveNodeAndIndex(root, node, index);
  const { markImpact } = await import('./impact.mjs');
  await markImpact(root, nodeId, ['acceptance_criteria'], now);
  await invalidateDerived(root);
  return node;
}

export async function listChildren(root, id) {
  const index = await loadIndex(root);
  const ids = Object.keys(index.nodes)
    .filter(candidate => index.nodes[candidate].parent_id === id)
    .sort();
  return Promise.all(ids.map(candidate => loadNode(root, candidate)));
}

export async function listAncestors(root, id) {
  const ancestors = [];
  let node = await loadNode(root, id);
  while (node.parent_id) {
    node = await loadNode(root, node.parent_id);
    ancestors.unshift(node);
  }
  return ancestors;
}
