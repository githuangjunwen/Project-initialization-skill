import { loadDecision } from './decisions.mjs';
import { sha256 } from './hash.mjs';
import { writeTextAtomic } from './json.mjs';
import { listAncestors, listChildren, loadNode } from './nodes.mjs';
import { projectMapPaths } from './paths.mjs';
import { renderCurrent, renderProjectMap } from './render.mjs';
import { readSource } from './sources.mjs';
import { loadIndex, saveIndex } from './store.mjs';

async function decisionsFor(root, nodes) {
  const ids = [...new Set(nodes.flatMap(node => node.decision_ids))].sort();
  return Promise.all(ids.map(id => loadDecision(root, id)));
}

function nextAction(node, blockers) {
  if (node.review.state === 'needs-review') {
    return { kind: 'review-impact', command: `project-map impact ${node.id}` };
  }
  if (node.status === 'done') {
    return { kind: 'done', command: 'project-map status' };
  }
  if (blockers.length > 0 || ['idea', 'exploring'].includes(node.status)) {
    return { kind: 'refine', command: `project-map focus ${node.id}` };
  }
  if (node.type === 'feature' && node.status === 'specified') {
    return {
      kind: 'plan', command: `project-map readiness ${node.id} --stage plan`
    };
  }
  if (['story', 'task'].includes(node.type) && node.status === 'planned') {
    return {
      kind: 'execute', command: `project-map readiness ${node.id} --stage code`
    };
  }
  if (node.status === 'verifying') {
    return { kind: 'verify', command: `project-map status ${node.id}` };
  }
  return { kind: 'discuss', command: `project-map focus ${node.id}` };
}

export async function resolveContext(root, nodeId) {
  const index = await loadIndex(root);
  const current = await loadNode(root, nodeId);
  const ancestors = await listAncestors(root, nodeId);
  const children = await listChildren(root, nodeId);
  const relevantNodes = [...ancestors, current];
  const decisions = await decisionsFor(root, relevantNodes);
  const confirmed = decisions.filter(decision => decision.status === 'confirmed');
  const open = decisions.filter(decision => decision.status !== 'confirmed');
  const blockers = open
    .filter(decision => decision.critical)
    .map(decision => ({
      code: 'CRITICAL_DECISION_UNCONFIRMED', decision_id: decision.id
    }));
  const included = new Set([...relevantNodes, ...children].map(node => node.id));
  const excluded = Object.keys(index.nodes).filter(id => !included.has(id)).sort();
  const sourceIds = [...new Set(current.source_links.map(link => link.source_id))];

  return {
    schema_version: 1,
    current_node: current,
    must_read: {
      nodes: relevantNodes,
      confirmed_decisions: confirmed,
      source_excerpts: current.source_links.map(link => ({
        source_id: link.source_id,
        excerpt: link.excerpt
      })),
      gsd: current.gsd
    },
    may_need: {
      children,
      source_files: sourceIds.map(id => index.sources[id].path),
      code: current.evidence.code,
      tests: current.evidence.tests
    },
    do_not_read_by_default: {
      nodes: excluded,
      reason: 'unrelated branch'
    },
    blockers,
    open_decisions: open,
    recommended_next_action: nextAction(current, blockers)
  };
}

async function projectSnapshot(root, context) {
  const index = await loadIndex(root);
  const nodeIds = Object.keys(index.nodes).sort();
  const nodes = await Promise.all(nodeIds.map(id => loadNode(root, id)));
  const decisions = await decisionsFor(root, nodes);
  const progress = {};
  for (const node of nodes) progress[node.status] = (progress[node.status] ?? 0) + 1;
  const questions = nodes.flatMap(node => node.open_questions.map(question => ({
    node_id: node.id,
    text: typeof question === 'string' ? question : question.text
  })));
  const sourceIds = Object.keys(index.sources).sort();
  const original = sourceIds.length ? await readSource(root, sourceIds[0]) : '';
  return {
    original_motivation: original.slice(0, 500),
    nodes,
    progress,
    current_node: context.current_node,
    next_action: context.recommended_next_action,
    blocking_decisions: decisions.filter(
      decision => decision.critical && decision.status !== 'confirmed'
    ),
    open_questions: questions,
    needs_review: nodes.filter(node => node.review.state === 'needs-review'),
    artifact_health: 'Generated from canonical project-map data.'
  };
}

export async function focusNode(root, nodeId, now = new Date().toISOString()) {
  const index = await loadIndex(root);
  await loadNode(root, nodeId);
  index.current_node_id = nodeId;
  await saveIndex(root, index);

  const context = await resolveContext(root, nodeId);
  const paths = projectMapPaths(root);
  const currentText = renderCurrent(context);
  const mapText = renderProjectMap(await projectSnapshot(root, context));
  await writeTextAtomic(paths.current, currentText);
  await writeTextAtomic(paths.projectMap, mapText);

  const updatedIndex = await loadIndex(root);
  updatedIndex.generation = {
    current_sha256: sha256(currentText),
    project_map_sha256: sha256(mapText),
    generated_at: now
  };
  await saveIndex(root, updatedIndex);
  return {
    contextPath: paths.current,
    projectMapPath: paths.projectMap,
    nextAction: context.recommended_next_action,
    context
  };
}
