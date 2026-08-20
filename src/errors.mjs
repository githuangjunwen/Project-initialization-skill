export class ProjectMapError extends Error {
  constructor(code, message, exitCode = 1, details = undefined) {
    super(message);
    this.name = 'ProjectMapError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function toErrorPayload(error) {
  const payload = {
    code: error.code ?? 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error)
  };
  if (error.details !== undefined) payload.details = error.details;
  return payload;
}
