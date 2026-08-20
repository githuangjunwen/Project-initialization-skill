import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectMapError } from './errors.mjs';
import { sha256 } from './hash.mjs';
import { assertConfined, projectMapPaths } from './paths.mjs';
import { invalidateDerived, loadIndex, saveIndex } from './store.mjs';

const RAW_DELIMITER = '\n## Raw input\n\n';

function sourcePath(root, relativePath) {
  const paths = projectMapPaths(root);
  return assertConfined(paths.base, join(paths.base, relativePath));
}

export function createSourceRecord(id, text, origin, capturedAt) {
  if (/[\r\n]/.test(origin)) {
    throw new ProjectMapError(
      'INVALID_SOURCE_ORIGIN', 'Source origin must be a single line'
    );
  }
  return {
    id,
    path: `sources/${id}.md`,
    origin,
    captured_at: capturedAt,
    raw_bytes: Buffer.byteLength(text, 'utf8'),
    sha256: sha256(text)
  };
}

export async function writeSource(root, record, text) {
  const header = [
    `# ${record.id}`,
    '',
    `- Captured: ${record.captured_at}`,
    `- Origin: ${record.origin}`,
    `- Raw-Bytes: ${record.raw_bytes}`,
    `- SHA-256: ${record.sha256}`
  ].join('\n');
  try {
    await writeFile(
      sourcePath(root, record.path),
      `${header}${RAW_DELIMITER}${text}`,
      { encoding: 'utf8', flag: 'wx' }
    );
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new ProjectMapError(
        'SOURCE_ALREADY_EXISTS',
        `Source file already exists: ${record.id}`
      );
    }
    throw error;
  }
}

async function readSourceFile(root, record) {
  const content = await readFile(sourcePath(root, record.path), 'utf8');
  const delimiterIndex = content.indexOf(RAW_DELIMITER);
  if (delimiterIndex === -1) {
    throw new ProjectMapError(
      'SOURCE_FORMAT_INVALID',
      `Source file has no raw-input delimiter: ${record.id}`
    );
  }
  const header = content.slice(0, delimiterIndex);
  const rawBytes = header.match(/^- Raw-Bytes: (\d+)$/m)?.[1];
  const hash = header.match(/^- SHA-256: ([a-f0-9]{64})$/m)?.[1];
  const origin = header.match(/^- Origin: (.*)$/m)?.[1];
  const capturedAt = header.match(/^- Captured: (.*)$/m)?.[1];
  return {
    content,
    text: content.slice(delimiterIndex + RAW_DELIMITER.length),
    metadata: {
      raw_bytes: rawBytes === undefined ? null : Number(rawBytes),
      sha256: hash ?? null,
      origin: origin ?? null,
      captured_at: capturedAt ?? null
    }
  };
}

export async function readSource(root, id) {
  const index = await loadIndex(root);
  const record = index.sources[id];
  if (!record) {
    throw new ProjectMapError('SOURCE_NOT_FOUND', `Unknown source: ${id}`);
  }
  return (await readSourceFile(root, { id, ...record })).text;
}

export async function captureSource(root, {
  text,
  origin = 'user',
  now = new Date().toISOString()
}) {
  const index = await loadIndex(root);
  const number = index.counters.SRC + 1;
  const id = `SRC-${String(number).padStart(3, '0')}`;
  const source = createSourceRecord(id, text, origin, now);

  await writeSource(root, source, text);
  index.counters.SRC = number;
  index.sources[id] = {
    path: source.path,
    sha256: source.sha256,
    raw_bytes: source.raw_bytes,
    origin: source.origin,
    captured_at: source.captured_at
  };
  await saveIndex(root, index);
  await invalidateDerived(root);
  return source;
}

export async function verifySources(root) {
  const index = await loadIndex(root);
  const errors = [];

  for (const id of Object.keys(index.sources).sort()) {
    const record = { id, ...index.sources[id] };
    let text;
    let metadata;
    try {
      ({ text, metadata } = await readSourceFile(root, record));
    } catch (error) {
      errors.push({
        code: error.code === 'ENOENT' ? 'SOURCE_FILE_MISSING' : error.code,
        id,
        message: error.message
      });
      continue;
    }

    if (
      metadata.raw_bytes !== record.raw_bytes ||
      metadata.sha256 !== record.sha256 ||
      metadata.origin !== record.origin ||
      metadata.captured_at !== record.captured_at
    ) {
      errors.push({ code: 'SOURCE_METADATA_MISMATCH', id });
      continue;
    }

    const rawBytes = Buffer.byteLength(text, 'utf8');
    if (rawBytes !== record.raw_bytes) {
      errors.push({
        code: 'SOURCE_LENGTH_MISMATCH', id,
        expected: record.raw_bytes, actual: rawBytes
      });
      continue;
    }
    const actualHash = sha256(text);
    if (actualHash !== record.sha256) {
      errors.push({
        code: 'SOURCE_HASH_MISMATCH', id,
        expected: record.sha256, actual: actualHash
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
