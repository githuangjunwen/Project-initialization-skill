import { join } from 'node:path';
import { ProjectMapError } from './errors.mjs';
import { readJson, writeJsonAtomic } from './json.mjs';
import { loadNode } from './nodes.mjs';
import { projectMapPaths } from './paths.mjs';
import {
  invalidateDerived, loadIndex, saveNodeAndIndex
} from './store.mjs';

export const CRITICAL_CATEGORIES = new Set([
  'deletion', 'permission', 'approval', 'retention', 'billing',
  'identity', 'security', 'privacy', 'compliance', 'irreversible-migration'
]);

export const CONFIRMATION_AUTHORITIES = new Set(['user', 'authority-source']);

export async function loadDecision(root, id) {
  if (!/^D-\d{3,}$/.test(id)) {
    throw new ProjectMapError('DECISION_NOT_FOUND', `Unknown decision: ${id}`);
  }
  try {
    return await readJson(join(projectMapPaths(root).decisions, `${id}.json`));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ProjectMapError('DECISION_NOT_FOUND', `Unknown decision: ${id}`);
    }
    throw error;
  }
}

export async function createDecision(root, {
  nodeId,
  category,
  question,
  proposal = '',
  critical = false,
  actor = 'ai',
  now = new Date().toISOString()
}) {
  if (!category || !question?.trim()) {
    throw new ProjectMapError(
      'INVALID_DECISION', 'Decision category and question are required'
    );
  }
  const index = await loadIndex(root);
  const node = await loadNode(root, nodeId);
  const number = index.counters.D + 1;
  const id = `D-${String(number).padStart(3, '0')}`;
  const status = proposal ? 'proposed' : 'open';
  const decision = {
    schema_version: 1,
    id,
    node_id: nodeId,
    category,
    question: question.trim(),
    proposal,
    status,
    critical: critical || CRITICAL_CATEGORIES.has(category),
    created_by: actor,
    confirmation: null,
    history: [],
    created_at: now,
    updated_at: now
  };

  node.decision_ids.push(id);
  node.updated_at = now;
  index.counters.D = number;
  await writeJsonAtomic(join(projectMapPaths(root).decisions, `${id}.json`), decision);
  await saveNodeAndIndex(root, node, index);
  const { markImpact } = await import('./impact.mjs');
  await markImpact(root, nodeId, ['decision_ids'], now);
  await invalidateDerived(root);
  return decision;
}

export async function confirmDecision(root, id, {
  authority,
  evidence,
  now = new Date().toISOString()
}) {
  if (!CONFIRMATION_AUTHORITIES.has(authority)) {
    throw new ProjectMapError(
      'INVALID_CONFIRMATION_AUTHORITY',
      'Only user or authority-source may confirm a decision'
    );
  }
  if (!evidence?.trim()) {
    throw new ProjectMapError(
      'CONFIRMATION_EVIDENCE_REQUIRED', 'Confirmation evidence is required'
    );
  }
  const decision = await loadDecision(root, id);
  if (!['open', 'proposed'].includes(decision.status)) {
    throw new ProjectMapError(
      'INVALID_DECISION_TRANSITION',
      `Cannot confirm a decision in status ${decision.status}`
    );
  }
  const transition = {
    from: decision.status,
    to: 'confirmed',
    authority,
    evidence: evidence.trim(),
    at: now
  };
  decision.status = 'confirmed';
  decision.confirmation = { authority, evidence: evidence.trim(), at: now };
  decision.history.push(transition);
  decision.updated_at = now;
  await writeJsonAtomic(
    join(projectMapPaths(root).decisions, `${id}.json`), decision
  );
  const { markImpact } = await import('./impact.mjs');
  await markImpact(root, decision.node_id, ['confirmed_decision'], now);
  await invalidateDerived(root);
  return decision;
}
