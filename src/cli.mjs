import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ProjectMapError, toErrorPayload } from './errors.mjs';
import { findProjectRoot } from './paths.mjs';
import { captureSource } from './sources.mjs';
import { initializeStore } from './store.mjs';
import { addNode, updateNode } from './nodes.mjs';

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
    args.slice(2), new Set(['--title', '--summary', '--status'])
  );
  if (Object.keys(options).length === 0) {
    throw new ProjectMapError(
      'INVALID_ARGUMENTS', 'At least one update field is required', 2
    );
  }
  const patch = Object.fromEntries(Object.entries({
    title: options['--title'],
    summary: options['--summary'],
    status: options['--status']
  }).filter(([, value]) => value !== undefined));
  const root = await findProjectRoot(io.cwd);
  const result = await updateNode(root, id, patch);
  return { node: result.node, changed_fields: result.changedFields };
}

const commands = {
  init: initCommand,
  capture: captureCommand,
  add: addCommand,
  node: nodeCommand
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
    const data = await handler(args.slice(1), io);
    if (useJson) emitJson(io, { ok: true, data });
    else io.stdout(`${command} complete\n`);
    return 0;
  } catch (error) {
    const normalized = error instanceof ProjectMapError
      ? error
      : new ProjectMapError('INTERNAL_ERROR', error.message ?? String(error));
    if (useJson) emitJson(io, { ok: false, error: toErrorPayload(normalized) });
    else io.stderr(`${normalized.message}\n`);
    return normalized.exitCode;
  }
}
