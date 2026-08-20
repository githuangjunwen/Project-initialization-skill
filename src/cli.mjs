import { ProjectMapError, toErrorPayload } from './errors.mjs';

function jsonMode(argv) {
  return argv.includes('--json');
}

function emitJson(io, value) {
  io.stdout(`${JSON.stringify(value)}\n`);
}

export async function run(argv, io) {
  const useJson = jsonMode(argv);
  const args = argv.filter(argument => argument !== '--json');
  const command = args[0];

  try {
    throw new ProjectMapError(
      'UNKNOWN_COMMAND',
      `Unknown command: ${command ?? ''}`,
      2
    );
  } catch (error) {
    const normalized = error instanceof ProjectMapError
      ? error
      : new ProjectMapError('INTERNAL_ERROR', error.message ?? String(error));
    if (useJson) emitJson(io, { ok: false, error: toErrorPayload(normalized) });
    else io.stderr(`${normalized.message}\n`);
    return normalized.exitCode;
  }
}
