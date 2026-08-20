import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ProjectMapError, toErrorPayload } from './errors.mjs';
import { findProjectRoot } from './paths.mjs';
import { captureSource } from './sources.mjs';
import { initializeStore, loadIndex } from './store.mjs';
import { addAcceptanceCriterion, addNode, updateNode } from './nodes.mjs';
import { confirmDecision, createDecision } from './decisions.mjs';
import { evaluateReadiness, writeReadinessStamp } from './readiness.mjs';
import { focusNode, resolveContext } from './context.mjs';
import { linkEvidence, linkGsd, traceNode } from './trace.mjs';
import { markImpact, reviewImpact } from './impact.mjs';
import { checkProject, rebuildDerived } from './check.mjs';

function emitJson(io, value) {
  io.stdout(`${JSON.stringify(value)}\n`);
}

function parseOptions(args, allowed, repeatable = new Set()) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith('--') || !allowed.has(key)) {
      throw new ProjectMapError(
        'INVALID_ARGUMENTS', `Unknown option: ${key}`, 2
      );
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new ProjectMapError(
        'INVALID_ARGUMENTS', `Missing value for ${key}`, 2
      );
    }
    if (Object.hasOwn(values, key) && !repeatable.has(key)) {
      throw new ProjectMapError(
        'INVALID_ARGUMENTS', `Option may only be used once: ${key}`, 2
      );
    }
    if (repeatable.has(key)) {
      values[key] ??= [];
      values[key].push(value);
    } else {
      values[key] = value;
    }
    index += 1;
  }
  return values;
}

async function sourceInput(options, cwd) {
  const hasText = Object.hasOwn(options, '--text');
  const hasFile = Object.hasOwn(options, '--source');
  if (hasText === hasFile) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS',
      'Provide exactly one of --text or --source',
      2
    );
  }
  return hasText
    ? options['--text']
    : readFile(resolve(cwd, options['--source']), 'utf8');
}

async function initCommand(args, io) {
  const options = parseOptions(
    args, new Set(['--project-title', '--text', '--source', '--origin'])
  );
  if (!options['--project-title']) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Missing --project-title', 2
    );
  }
  const rawSource = await sourceInput(options, io.cwd);
  const result = await initializeStore(io.cwd, {
    title: options['--project-title'],
    rawSource,
    origin: options['--origin'] ?? 'user'
  });
  return { source: result.source };
}

async function captureCommand(args, io) {
  const options = parseOptions(
    args, new Set(['--text', '--source', '--origin'])
  );
  const text = await sourceInput(options, io.cwd);
  const root = await findProjectRoot(io.cwd);
  const source = await captureSource(root, {
    text,
    origin: options['--origin'] ?? 'user'
  });
  return { source };
}

async function addCommand(args, io) {
  const type = args[0];
  if (!type || type.startsWith('--')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Missing node type', 2);
  }
  const options = parseOptions(
    args.slice(1),
    new Set(['--parent', '--title', '--source']),
    new Set(['--source'])
  );
  if (!options['--title']) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Missing --title', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const node = await addNode(root, {
    type,
    parentId: options['--parent'] ?? null,
    title: options['--title'],
    sourceIds: options['--source'] ?? []
  });
  return { node };
}

async function nodeCommand(args, io) {
  const operation = args[0];
  const id = args[1];
  if (operation !== 'update' || !id || id.startsWith('--')) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Usage: node update <ID> [options]', 2
    );
  }
  const options = parseOptions(
    args.slice(2),
    new Set([
      '--title', '--summary', '--status', '--verification-method',
      '--completion-condition', '--test-step'
    ]),
    new Set(['--test-step'])
  );
  if (Object.keys(options).length === 0) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'At least one update field is required', 2
    );
  }
  const patch = Object.fromEntries(Object.entries({
    title: options['--title'],
    summary: options['--summary'],
    status: options['--status'],
    verification_method: options['--verification-method'],
    completion_condition: options['--completion-condition'],
    test_steps: options['--test-step']
  }).filter(([, value]) => value !== undefined));
  const root = await findProjectRoot(io.cwd);
  const result = await updateNode(root, id, patch);
  return { node: result.node, changed_fields: result.changedFields };
}

async function acceptanceCommand(args, io) {
  if (args[0] !== 'add' || !args[1] || args[1].startsWith('--')) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Usage: ac add <ID> --text <criterion>', 2
    );
  }
  const options = parseOptions(args.slice(2), new Set(['--text']));
  if (!Object.hasOwn(options, '--text')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Missing --text', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const node = await addAcceptanceCriterion(root, args[1], options['--text']);
  return { node, criterion: node.acceptance_criteria.at(-1) };
}

async function decisionCommand(args, io) {
  if (args[0] !== 'create' || !args[1] || args[1].startsWith('--')) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS',
      'Usage: decision create <NODE-ID> --category <value> --question <text>',
      2
    );
  }
  const options = parseOptions(
    args.slice(2), new Set(['--category', '--question', '--proposal'])
  );
  if (!options['--category'] || !options['--question']) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Missing --category or --question', 2
    );
  }
  const root = await findProjectRoot(io.cwd);
  const decision = await createDecision(root, {
    nodeId: args[1],
    category: options['--category'],
    question: options['--question'],
    proposal: options['--proposal'] ?? '',
    actor: 'ai'
  });
  return { decision };
}

async function decideCommand(args, io) {
  const id = args[0];
  const confirms = args.filter(argument => argument === '--confirm').length;
  if (!id || id.startsWith('--') || confirms !== 1) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Usage: decide <D-ID> --confirm [options]', 2
    );
  }
  const options = parseOptions(
    args.slice(1).filter(argument => argument !== '--confirm'),
    new Set(['--authority', '--evidence'])
  );
  if (!options['--authority'] || !options['--evidence']) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Missing --authority or --evidence', 2
    );
  }
  const root = await findProjectRoot(io.cwd);
  const decision = await confirmDecision(root, id, {
    authority: options['--authority'],
    evidence: options['--evidence']
  });
  return { decision };
}

async function readinessCommand(args, io) {
  const id = args[0];
  if (!id || id.startsWith('--')) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'Usage: readiness <ID> --stage plan|code', 2
    );
  }
  const options = parseOptions(args.slice(1), new Set(['--stage']));
  if (!options['--stage']) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Missing --stage', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const result = await evaluateReadiness(root, id, options['--stage']);
  if (result.ready) await writeReadinessStamp(root, result);
  return { __command_result: true, data: result, exitCode: result.ready ? 0 : 3 };
}

async function focusCommand(args, io) {
  if (args.length !== 1 || args[0].startsWith('--')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: focus <ID>', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const result = await focusNode(root, args[0]);
  return {
    current_node: result.context.current_node,
    next_action: result.nextAction,
    context_path: result.contextPath,
    project_map_path: result.projectMapPath
  };
}

async function statusCommand(args, io) {
  if (args.length > 1 || args[0]?.startsWith('--')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: status [ID]', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const index = await loadIndex(root);
  const id = args[0] ?? index.current_node_id;
  if (!id) {
    throw new ProjectMapError('NO_CURRENT_NODE', 'No current node is selected');
  }
  const context = await resolveContext(root, id);
  return { ...context, project_focus: index.current_node_id };
}

async function linkCommand(args, io) {
  const id = args[0];
  if (!id || id.startsWith('--')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: link <ID> [links]', 2);
  }
  const allowed = new Set([
    '--gsd-requirement', '--gsd-milestone', '--gsd-phase', '--gsd-plan',
    '--code', '--test', '--document'
  ]);
  const options = parseOptions(args.slice(1), allowed);
  if (Object.keys(options).length === 0) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'At least one link is required', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const links = [];
  for (const [option, kind] of [
    ['--gsd-requirement', 'requirement'],
    ['--gsd-milestone', 'milestone'],
    ['--gsd-phase', 'phase'],
    ['--gsd-plan', 'plan']
  ]) {
    if (options[option]) {
      await linkGsd(root, id, { kind, value: options[option] });
      links.push({ kind: `gsd-${kind}`, value: options[option] });
    }
  }
  for (const [option, kind] of [
    ['--code', 'code'], ['--test', 'test'], ['--document', 'document']
  ]) {
    if (options[option]) {
      await linkEvidence(root, id, { kind, path: options[option] });
      links.push({ kind, path: options[option] });
    }
  }
  return { node_id: id, links };
}

async function traceCommand(args, io) {
  if (args.length !== 1 || args[0].startsWith('--')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: trace <ID>', 2);
  }
  const root = await findProjectRoot(io.cwd);
  return traceNode(root, args[0]);
}

async function impactCommand(args, io) {
  const root = await findProjectRoot(io.cwd);
  if (args[0] === 'review') {
    const id = args[1];
    if (!id || id.startsWith('--')) {
      throw new ProjectMapError(
        'INVALID_ARGUMENTS', 'Usage: impact review <ID> [options]', 2
      );
    }
    const options = parseOptions(
      args.slice(2), new Set(['--authority', '--note'])
    );
    if (!options['--authority'] || !options['--note']) {
      throw new ProjectMapError(
        'INVALID_ARGUMENTS', 'Missing --authority or --note', 2
      );
    }
    const node = await reviewImpact(root, id, {
      authority: options['--authority'], note: options['--note']
    });
    return { node };
  }
  if (args.length !== 1 || args[0].startsWith('--')) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: impact <ID>', 2);
  }
  const affected = await markImpact(root, args[0], ['manual_change']);
  return { changed_node: args[0], affected };
}

async function checkCommand(args, io) {
  if (args.length !== 0) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: check', 2);
  }
  const root = await findProjectRoot(io.cwd);
  const result = await checkProject(root);
  return { __command_result: true, data: result, exitCode: result.ok ? 0 : 1 };
}

async function rebuildCommand(args, io) {
  if (args.length !== 0) {
    throw new ProjectMapError('INVALID_ARGUMENTS', 'Usage: rebuild', 2);
  }
  const root = await findProjectRoot(io.cwd);
  return rebuildDerived(root);
}

const commands = {
  init: initCommand,
  capture: captureCommand,
  add: addCommand,
  node: nodeCommand,
  ac: acceptanceCommand,
  decision: decisionCommand,
  decide: decideCommand,
  readiness: readinessCommand,
  focus: focusCommand,
  status: statusCommand,
  link: linkCommand,
  trace: traceCommand,
  impact: impactCommand,
  check: checkCommand,
  rebuild: rebuildCommand
};

export async function run(argv, io) {
  const useJson = argv.includes('--json');
  const args = argv.filter(argument => argument !== '--json');
  const command = args[0];

  try {
    const handler = commands[command];
    if (!handler) {
      throw new ProjectMapError(
        'UNKNOWN_COMMAND', `Unknown command: ${command ?? ''}`, 2
      );
    }
    const outcome = await handler(args.slice(1), io);
    const wrapped = outcome?.__command_result === true;
    const data = wrapped ? outcome.data : outcome;
    const exitCode = wrapped ? outcome.exitCode : 0;
    if (useJson) emitJson(io, { ok: true, data });
    else io.stdout(`${command} complete\n`);
    return exitCode;
  } catch (error) {
    const normalized = error instanceof ProjectMapError
      ? error
      : new ProjectMapError('INTERNAL_ERROR', error.message ?? String(error));
    if (useJson) emitJson(io, { ok: false, error: toErrorPayload(normalized) });
    else io.stderr(`${normalized.message}\n`);
    return normalized.exitCode;
  }
}
