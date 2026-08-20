import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { ProjectMapError } from './errors.mjs';
import { sha256 } from './hash.mjs';
import { stableStringify, writeJsonAtomic } from './json.mjs';
import { loadDecision } from './decisions.mjs';
import { listAncestors, loadNode } from './nodes.mjs';
import { projectMapPaths } from './paths.mjs';
import { loadIndex } from './store.mjs';

function blocker(code, nodeId, details = {}) {
  return { code, node_id: nodeId, ...details };
}

async function decisionList(root, nodes) {
  const ids = [...new Set(nodes.flatMap(node => node.decision_ids))].sort();
  return Promise.all(ids.map(id => loadDecision(root, id)));
}

function planBlockers(node, ancestors, decisions) {
  const blockers = [];
  if (node.source_links.length === 0) blockers.push(blocker('MISSING_SOURCE', node.id));
  if (!node.summary.trim()) blockers.push(blocker('MISSING_SUMMARY', node.id));
  if (node.acceptance_criteria.length === 0) {
    blockers.push(blocker('MISSING_ACCEPTANCE_CRITERIA', node.id));
  } else if (node.acceptance_criteria.some(item => !item.text.trim())) {
    blockers.push(blocker('EMPTY_ACCEPTANCE_CRITERION', node.id));
  }
  for (const decision of decisions) {
    if (
      decision.critical &&
      !['confirmed', 'superseded'].includes(decision.status)
    ) {
      blockers.push(blocker(
        'CRITICAL_DECISION_UNCONFIRMED', node.id, { decision_id: decision.id }
      ));
    }
  }
  if (node.open_questions.some(question =>
    typeof question === 'string' || (question.blocking && question.status !== 'resolved')
  )) {
    blockers.push(blocker('BLOCKING_QUESTION_OPEN', node.id));
  }
  for (const ancestor of ancestors) {
    if (ancestor.review.state === 'needs-review') {
      blockers.push(blocker(
        'ANCESTOR_NEEDS_REVIEW', node.id, { ancestor_id: ancestor.id }
      ));
    }
  }
  if (node.review.state === 'needs-review') {
    blockers.push(blocker('NODE_NEEDS_REVIEW', node.id));
  }
  return blockers;
}

async function removeStamp(root, stage, nodeId) {
  const path = join(projectMapPaths(root).gates, `current-${stage}.ready`);
  try {
    const stamp = JSON.parse(await readFile(path, 'utf8'));
    if (stamp.node_id !== nodeId) return;
    await unlink(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    if (error instanceof SyntaxError) {
      await unlink(path).catch(unlinkError => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
      return;
    }
    throw error;
  }
}

export async function evaluateReadiness(
  root,
  nodeId,
  stage,
  { removeBlockedStamp = true } = {}
) {
  if (!['plan', 'code'].includes(stage)) {
    throw new ProjectMapError('INVALID_READINESS_STAGE', `Invalid stage: ${stage}`);
  }
  const node = await loadNode(root, nodeId);
  const ancestors = await listAncestors(root, nodeId);
  const decisions = await decisionList(root, [...ancestors, node]);
  const blockers = planBlockers(node, ancestors, decisions);

  if (stage === 'code') {
    const parentFeature = [...ancestors, node].find(item => item.type === 'feature');
    if (parentFeature && parentFeature.id !== node.id) {
      const featureAncestors = await listAncestors(root, parentFeature.id);
      const featureDecisions = await decisionList(
        root, [...featureAncestors, parentFeature]
      );
      if (planBlockers(parentFeature, featureAncestors, featureDecisions).length > 0) {
        blockers.push(blocker(
          'PARENT_FEATURE_NOT_READY', node.id, { feature_id: parentFeature.id }
        ));
      }
    }
    if (node.type === 'story' && !node.verification_method?.trim()) {
      blockers.push(blocker('MISSING_VERIFICATION_METHOD', node.id));
    }
    if (node.type === 'task' && !node.completion_condition?.trim()) {
      blockers.push(blocker('MISSING_COMPLETION_CONDITION', node.id));
    }
    if (
      node.type === 'task' &&
      (!node.test_steps || node.test_steps.length === 0 ||
        node.test_steps.some(step => !step.trim()))
    ) {
      blockers.push(blocker('MISSING_TEST_STEPS', node.id));
    }
    if (node.gsd.plan_paths.length === 0) {
      blockers.push(blocker('MISSING_GSD_PLAN', node.id));
    }
  }

  const state = { node, ancestors, decisions, stage };
  const result = {
    node_id: nodeId,
    stage,
    ready: blockers.length === 0,
    blockers,
    state_sha256: sha256(stableStringify(state))
  };
  if (!result.ready && removeBlockedStamp) {
    await removeStamp(root, stage, nodeId);
  }
  return result;
}

export async function writeReadinessStamp(
  root,
  result,
  checkedAt = new Date().toISOString()
) {
  if (!result.ready) {
    throw new ProjectMapError(
      'READINESS_BLOCKED', 'Cannot write a readiness stamp for a blocked node'
    );
  }
  const index = await loadIndex(root);
  if (index.current_node_id !== result.node_id) {
    throw new ProjectMapError(
      'READINESS_NODE_NOT_FOCUSED',
      `Focus ${result.node_id} before writing its readiness stamp`
    );
  }
  const path = join(
    projectMapPaths(root).gates, `current-${result.stage}.ready`
  );
  await writeJsonAtomic(path, {
    node_id: result.node_id,
    stage: result.stage,
    state_sha256: result.state_sha256,
    checked_at: checkedAt
  });
  return path;
}
