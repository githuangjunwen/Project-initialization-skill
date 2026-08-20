function text(value, fallback = '_None_') {
  return value?.trim() ? value.trim() : fallback;
}

function bullets(items, render) {
  return items.length ? items.map(item => `- ${render(item)}`).join('\n') : '- None';
}

export function renderCurrent(context) {
  const current = context.current_node;
  const ancestors = context.must_read.nodes.slice(0, -1);
  const openDecisions = context.open_decisions ?? [];
  const compactManifest = {
    must_read: {
      nodes: context.must_read.nodes.map(
        node => `.planning/project-map/nodes/${node.id}.json`
      ),
      decisions: context.must_read.confirmed_decisions.map(
        decision => `.planning/project-map/decisions/${decision.id}.json`
      )
    },
    may_need: {
      nodes: context.may_need.children.map(
        node => `.planning/project-map/nodes/${node.id}.json`
      ),
      sources: context.may_need.source_files.map(
        path => `.planning/project-map/${path}`
      ),
      code: context.may_need.code,
      tests: context.may_need.tests
    },
    do_not_read_by_default: context.do_not_read_by_default.nodes.map(
      id => `.planning/project-map/nodes/${id}.json`
    )
  };
  return `# Current Node

${current.id} — ${current.title} (${current.status})

## Why It Exists

${text(current.summary)}

## Ancestor Constraints

${bullets(ancestors, node => `${node.id}: ${text(node.summary, node.title)}`)}

## Confirmed Decisions

${bullets(context.must_read.confirmed_decisions, decision => `${decision.id}: ${decision.question} → ${decision.proposal}`)}

## Open Decisions

${bullets(openDecisions, decision => `${decision.id} [${decision.category}]: ${decision.question}`)}

## Children

${bullets(context.may_need.children, node => `${node.id}: ${node.title} (${node.status})`)}

## GSD Handoff

${JSON.stringify(context.must_read.gsd)}

## Evidence

Code: ${current.evidence.code.join(', ') || 'None'}  
Tests: ${current.evidence.tests.join(', ') || 'None'}

## Context Manifest

\`\`\`json
${JSON.stringify(compactManifest, null, 2)}
\`\`\`

## Recommended Next Action

${context.recommended_next_action.kind}: \`${context.recommended_next_action.command}\`
`;
}

function treeLines(nodes) {
  const byParent = new Map();
  for (const node of nodes) {
    const key = node.parent_id ?? 'ROOT';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  const lines = [];
  function visit(parentId, depth) {
    for (const node of byParent.get(parentId) ?? []) {
      lines.push(`${'  '.repeat(depth)}- ${node.id} ${node.title} [${node.status}]`);
      visit(node.id, depth + 1);
    }
  }
  visit('ROOT', 0);
  return lines.join('\n') || '- No nodes';
}

export function renderProjectMap(snapshot) {
  const current = snapshot.current_node;
  const progress = Object.entries(snapshot.progress)
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
  return `# Project Map

## Original Motivation

${text(snapshot.original_motivation)}

## Tree

${treeLines(snapshot.nodes)}

## Progress

${progress || 'No nodes'}

## Current Work

Current node: ${current ? `${current.id} — ${current.title}` : 'None'}

## Next Action

Recommended next action: ${snapshot.next_action.command}

## Blocking Decisions

${bullets(snapshot.blocking_decisions, decision => `${decision.id}: ${decision.question}`)}

## Open Questions

${bullets(snapshot.open_questions, item => `${item.node_id}: ${item.text}`)}

## Needs Review

${bullets(snapshot.needs_review, node => `${node.id}: ${node.review.reasons.join('; ') || 'review required'}`)}

## Artifact Health

${snapshot.artifact_health}
`;
}
