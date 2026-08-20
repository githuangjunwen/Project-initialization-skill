import { access, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { focusNode } from './context.mjs';
import { loadDecision } from './decisions.mjs';
import { ProjectMapError } from './errors.mjs';
import { sha256 } from './hash.mjs';
import { stableStringify } from './json.mjs';
import { NODE_STATUS, NODE_TYPES, allowedParentType } from './model.mjs';
import { loadNode } from './nodes.mjs';
import { projectMapPaths } from './paths.mjs';
import { evaluateReadiness, writeReadinessStamp } from './readiness.mjs';
import { verifySources } from './sources.mjs';
import { loadIndex } from './store.mjs';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function jsonFiles(directory) {
  try {
    return (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function issue(code, details = {}) {
  return { code, ...details };
}

function evidenceIsConfined(root, path) {
  if (isAbsolute(path)) return false;
  const relation = relative(resolve(root), resolve(root, path));
  return relation !== '..' && !relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

export async function checkProject(root) {
  const errors = [];
  const warnings = [];
  let index;
  try {
    index = await loadIndex(root);
  } catch (error) {
    return {
      ok: false,
      errors: [issue(error.code ?? 'INDEX_INVALID', { message: error.message })],
      warnings,
      stats: { nodes: 0, sources: 0, decisions: 0 }
    };
  }

  if (index.schema_version !== 1) {
    errors.push(issue('SCHEMA_VERSION_UNSUPPORTED', { actual: index.schema_version }));
  }
  const sourceResult = await verifySources(root);
  errors.push(...sourceResult.errors);

  const paths = projectMapPaths(root);
  const indexedIds = Object.keys(index.nodes).sort();
  const nodeFiles = await jsonFiles(paths.nodes);
  const fileIds = nodeFiles.map(name => name.slice(0, -5));
  for (const id of indexedIds.filter(id => !fileIds.includes(id))) {
    errors.push(issue('NODE_FILE_MISSING', { node_id: id }));
  }
  for (const id of fileIds.filter(id => !index.nodes[id])) {
    errors.push(issue('NODE_NOT_INDEXED', { node_id: id }));
  }

  const nodes = new Map();
  for (const id of indexedIds) {
    try {
      const node = await loadNode(root, id);
      nodes.set(id, node);
      if (node.id !== id) errors.push(issue('NODE_ID_MISMATCH', { node_id: id }));
      if (node.schema_version !== 1) {
        errors.push(issue('NODE_SCHEMA_INVALID', { node_id: id }));
      }
      if (!NODE_TYPES.includes(node.type)) {
        errors.push(issue('NODE_TYPE_INVALID', { node_id: id, type: node.type }));
      }
      if (!NODE_STATUS.includes(node.status)) {
        errors.push(issue('NODE_STATUS_INVALID', { node_id: id, status: node.status }));
      }
      const summary = index.nodes[id];
      if (
        summary.type !== node.type || summary.parent_id !== node.parent_id ||
        summary.title !== node.title || summary.status !== node.status
      ) {
        errors.push(issue('NODE_INDEX_MISMATCH', { node_id: id }));
      }
    } catch (error) {
      if (error.code !== 'NODE_NOT_FOUND') {
        errors.push(issue('NODE_JSON_INVALID', { node_id: id, message: error.message }));
      }
    }
  }

  const prefixByType = {
    project: 'P', epic: 'E', feature: 'F', story: 'S', task: 'T'
  };
  for (const [type, prefix] of Object.entries(prefixByType)) {
    const maximum = [...nodes.values()]
      .filter(node => node.type === type)
      .reduce((value, node) => Math.max(value, Number(node.id.slice(2)) || 0), 0);
    if ((index.counters[prefix] ?? -1) < maximum) {
      errors.push(issue('ID_COUNTER_BEHIND', {
        prefix, counter: index.counters[prefix], maximum
      }));
    }
  }

  const roots = [...nodes.values()].filter(node => node.type === 'project');
  if (roots.length !== 1) errors.push(issue('PROJECT_ROOT_COUNT_INVALID', { actual: roots.length }));
  for (const node of nodes.values()) {
    if (node.type === 'project') {
      if (node.parent_id !== null) {
        errors.push(issue('PROJECT_PARENT_INVALID', { node_id: node.id }));
      }
    } else {
      const parent = nodes.get(node.parent_id);
      if (!parent) {
        errors.push(issue('PARENT_NODE_MISSING', { node_id: node.id, parent_id: node.parent_id }));
      } else if (parent.type !== allowedParentType(node.type)) {
        errors.push(issue('PARENT_TYPE_INVALID', { node_id: node.id }));
      }
    }

    const seen = new Set([node.id]);
    let parentId = node.parent_id;
    while (parentId) {
      if (seen.has(parentId)) {
        errors.push(issue('ANCESTRY_CYCLE', { node_id: node.id }));
        break;
      }
      seen.add(parentId);
      parentId = nodes.get(parentId)?.parent_id ?? null;
    }
    for (const link of node.source_links) {
      if (!index.sources[link.source_id]) {
        errors.push(issue('SOURCE_REFERENCE_INVALID', {
          node_id: node.id, source_id: link.source_id
        }));
      }
    }
  }

  const decisionFiles = await jsonFiles(paths.decisions);
  const decisionIds = decisionFiles.map(name => name.slice(0, -5));
  for (const node of nodes.values()) {
    for (const decisionId of node.decision_ids) {
      if (!decisionIds.includes(decisionId)) {
        errors.push(issue('DECISION_FILE_MISSING', {
          node_id: node.id, decision_id: decisionId
        }));
        continue;
      }
      try {
        const decision = await loadDecision(root, decisionId);
        if (decision.node_id !== node.id) {
          errors.push(issue('DECISION_NODE_MISMATCH', {
            node_id: node.id, decision_id: decisionId
          }));
        }
      } catch (error) {
        errors.push(issue('DECISION_JSON_INVALID', {
          decision_id: decisionId, message: error.message
        }));
      }
    }
  }
  for (const decisionId of decisionIds) {
    const referenced = [...nodes.values()].some(node =>
      node.decision_ids.includes(decisionId)
    );
    if (!referenced) errors.push(issue('DECISION_NOT_REFERENCED', { decision_id: decisionId }));
  }

  const expectedReverse = {};
  for (const node of nodes.values()) {
    for (const [kind, values] of [
      ['requirement', node.gsd.requirement_ids],
      ['phase', node.gsd.phase_ids],
      ['plan', node.gsd.plan_paths]
    ]) {
      for (const value of values) {
        const key = `${kind}:${value}`;
        expectedReverse[key] ??= [];
        expectedReverse[key].push(node.id);
      }
    }
    if (node.gsd.milestone) {
      const key = `milestone:${node.gsd.milestone}`;
      expectedReverse[key] ??= [];
      expectedReverse[key].push(node.id);
    }

    for (const [kind, evidencePaths] of Object.entries(node.evidence)) {
      for (const evidencePath of evidencePaths) {
        if (!evidenceIsConfined(root, evidencePath)) {
          errors.push(issue('EVIDENCE_PATH_INVALID', {
            node_id: node.id, kind, path: evidencePath
          }));
        } else if (!await exists(join(root, evidencePath))) {
          warnings.push(issue('EVIDENCE_PATH_MISSING', {
            node_id: node.id, kind, path: evidencePath
          }));
        }
      }
    }
  }
  for (const values of Object.values(expectedReverse)) values.sort();
  if (stableStringify(index.gsd_reverse) !== stableStringify(expectedReverse)) {
    errors.push(issue('GSD_REVERSE_MISMATCH'));
  }

  for (const [field, path] of [
    ['current_sha256', paths.current],
    ['project_map_sha256', paths.projectMap]
  ]) {
    const expected = index.generation?.[field];
    if (!expected) continue;
    if (!await exists(path)) {
      errors.push(issue('GENERATED_FILE_MISSING', { path }));
    } else {
      const actual = sha256(await readFile(path, 'utf8'));
      if (actual !== expected) {
        errors.push(issue('GENERATED_HASH_MISMATCH', { path, expected, actual }));
      }
    }
  }

  for (const stage of ['plan', 'code']) {
    const stampPath = join(paths.gates, `current-${stage}.ready`);
    if (!await exists(stampPath)) continue;
    try {
      const stamp = JSON.parse(await readFile(stampPath, 'utf8'));
      const result = await evaluateReadiness(root, stamp.node_id, stage, {
        removeBlockedStamp: false
      });
      if (!result.ready || result.state_sha256 !== stamp.state_sha256) {
        errors.push(issue('READINESS_STAMP_HASH_MISMATCH', {
          stage, node_id: stamp.node_id
        }));
      }
    } catch (error) {
      errors.push(issue('READINESS_STAMP_INVALID', { stage, message: error.message }));
    }
  }

  errors.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  warnings.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      nodes: nodes.size,
      sources: Object.keys(index.sources).length,
      decisions: decisionIds.length
    }
  };
}

const DERIVED_ERROR_CODES = new Set([
  'GENERATED_FILE_MISSING',
  'GENERATED_HASH_MISMATCH',
  'READINESS_STAMP_HASH_MISMATCH',
  'READINESS_STAMP_INVALID'
]);

export async function rebuildDerived(root) {
  const audit = await checkProject(root);
  const canonicalErrors = audit.errors.filter(
    error => !DERIVED_ERROR_CODES.has(error.code)
  );
  if (canonicalErrors.length) {
    throw new ProjectMapError(
      'CANONICAL_DATA_INVALID',
      'Cannot rebuild derived artifacts while canonical data is invalid',
      1,
      canonicalErrors
    );
  }
  const index = await loadIndex(root);
  if (!index.current_node_id) {
    throw new ProjectMapError(
      'NO_CURRENT_NODE', 'Focus a node before rebuilding derived artifacts'
    );
  }
  const paths = projectMapPaths(root);
  const existingStages = [];
  for (const stage of ['plan', 'code']) {
    if (await exists(join(paths.gates, `current-${stage}.ready`))) {
      existingStages.push(stage);
    }
  }
  const focused = await focusNode(root, index.current_node_id);
  for (const stage of existingStages) {
    const result = await evaluateReadiness(root, index.current_node_id, stage);
    if (result.ready) await writeReadinessStamp(root, result);
  }
  return {
    current: focused.contextPath,
    project_map: focused.projectMapPath,
    audit: await checkProject(root)
  };
}
