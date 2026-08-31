const STATUS_LABELS = {
  idea: '想法',
  exploring: '探索中',
  specified: '已明确',
  planned: '已计划',
  implementing: '实施中',
  verifying: '验证中',
  done: '已完成'
};

const ACTION_LABELS = {
  'review-impact': '复核变更影响',
  done: '已完成',
  refine: '继续完善',
  plan: '准备计划',
  execute: '准备实施',
  verify: '准备验证',
  discuss: '继续讨论'
};

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function actionLabel(kind) {
  return ACTION_LABELS[kind] ?? kind;
}

function text(value, fallback = '（无）') {
  return value?.trim() ? value.trim() : fallback;
}

function bullets(items, render) {
  return items.length ? items.map(item => `- ${render(item)}`).join('\n') : '- 无';
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
  return `# 当前节点

${current.id} — ${current.title}（${statusLabel(current.status)}）

## 存在理由

${text(current.summary)}

## 上级约束

${bullets(ancestors, node => `${node.id}: ${text(node.summary, node.title)}`)}

## 已确认决策

${bullets(context.must_read.confirmed_decisions, decision => `${decision.id}: ${decision.question} → ${decision.proposal}`)}

## 待定决策

${bullets(openDecisions, decision => `${decision.id} [${decision.category}]: ${decision.question}`)}

## 子节点

${bullets(context.may_need.children, node => `${node.id}: ${node.title}（${statusLabel(node.status)}）`)}

## GSD 交接

${JSON.stringify(context.must_read.gsd)}

## 证据

代码：${current.evidence.code.join(', ') || '无'}
测试：${current.evidence.tests.join(', ') || '无'}

## 上下文清单

\`\`\`json
${JSON.stringify(compactManifest, null, 2)}
\`\`\`

## 建议的下一步操作

${actionLabel(context.recommended_next_action.kind)}：\`${context.recommended_next_action.command}\`
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
      lines.push(`${'  '.repeat(depth)}- ${node.id} ${node.title} [${statusLabel(node.status)}]`);
      visit(node.id, depth + 1);
    }
  }
  visit('ROOT', 0);
  return lines.join('\n') || '- 无节点';
}

export function renderProjectMap(snapshot) {
  const current = snapshot.current_node;
  const progress = Object.entries(snapshot.progress)
    .map(([status, count]) => `${statusLabel(status)}：${count}`)
    .join(', ');
  return `# 项目地图

## 原始动机

${text(snapshot.original_motivation)}

## 需求树

${treeLines(snapshot.nodes)}

## 进度

${progress || '无节点'}

## 当前工作

当前节点：${current ? `${current.id} — ${current.title}` : '无'}

## 下一步操作

建议的下一步操作：${snapshot.next_action.command}

## 阻断性决策

${bullets(snapshot.blocking_decisions, decision => `${decision.id}: ${decision.question}`)}

## 待解决问题

${bullets(snapshot.open_questions, item => `${item.node_id}: ${item.text}`)}

## 待复核节点

${bullets(snapshot.needs_review, node => `${node.id}: ${node.review.reasons.join('; ') || '需要复核'}`)}

## 产物健康状态

${snapshot.artifact_health}
`;
}
