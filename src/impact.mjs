import { ProjectMapError } from './errors.mjs';
import { loadNode } from './nodes.mjs';
import {
  invalidateDerived, loadIndex, saveNodeAndIndex
} from './store.mjs';

export const IMPACT_FIELDS = new Set([
  'title', 'summary', 'parent_id', 'source_links',
  'acceptance_criteria', 'decision_ids', 'confirmed_decision'
]);

export const REVIEW_AUTHORITIES = new Set(['user', 'authority-source']);

function descendantPaths(index, changedNodeId) {
  const paths = [];
  const queue = [{ id: changedNodeId, path: [changedNodeId] }];
  while (queue.length) {
    const current = queue.shift();
    const children = Object.keys(index.nodes)
      .filter(id => index.nodes[id].parent_id === current.id)
      .sort();
    for (const id of children) {
      const path = [...current.path, id];
      paths.push({ id, path });
      queue.push({ id, path });
    }
  }
  return paths;
}

export async function markImpact(
  root,
  changedNodeId,
  changedFields,
  now = new Date().toISOString()
) {
  const index = await loadIndex(root);
  if (!index.nodes[changedNodeId]) {
    throw new ProjectMapError('NODE_NOT_FOUND', `Unknown node: ${changedNodeId}`);
  }
  const fields = [...new Set(changedFields)].sort();
  const reasonText = `${fields.join(', ')} changed`;
  const records = [];

  for (const item of descendantPaths(index, changedNodeId)) {
    const node = await loadNode(root, item.id);
    const record = {
      changed_node: changedNodeId,
      affected_id: item.id,
      path: item.path,
      reason: reasonText,
      detected_at: now
    };
    const exists = node.review.reasons.some(reason =>
      reason.changed_node === changedNodeId &&
      reason.affected_id === item.id &&
      reason.reason === reasonText
    );
    if (!exists) node.review.reasons.push(record);
    node.review.state = 'needs-review';
    node.updated_at = now;
    await saveNodeAndIndex(root, node, index);
    records.push(record);
  }
  if (records.length) await invalidateDerived(root);
  return records;
}

export async function reviewImpact(root, nodeId, {
  authority,
  note,
  now = new Date().toISOString()
}) {
  if (!REVIEW_AUTHORITIES.has(authority)) {
    throw new ProjectMapError(
      'INVALID_REVIEW_AUTHORITY',
      'Only user or authority-source may clear impact review'
    );
  }
  if (!note?.trim()) {
    throw new ProjectMapError('REVIEW_NOTE_REQUIRED', 'Review note is required');
  }
  const index = await loadIndex(root);
  const node = await loadNode(root, nodeId);
  node.review.history ??= [];
  node.review.history.push({
    authority,
    note: note.trim(),
    reviewed_reasons: node.review.reasons,
    at: now
  });
  node.review.state = 'clean';
  node.review.reasons = [];
  node.updated_at = now;
  await saveNodeAndIndex(root, node, index);
  await invalidateDerived(root);
  return node;
}
