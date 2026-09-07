import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

function mergeObjects(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
    ) {
      result[key] = mergeObjects(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`${path} 不是有效且可读取的 JSON：${error.message}`);
  }
}

const [defaultsPath, routingPath] = process.argv.slice(2);
if (!defaultsPath || !routingPath) {
  throw new Error('用法：node configure-gsd-defaults.mjs <defaults.json> <routing.json>');
}

const [existing, routing] = await Promise.all([
  readJson(defaultsPath, {}),
  readJson(routingPath, null)
]);
if (!routing || typeof routing !== 'object' || Array.isArray(routing)) {
  throw new Error(`${routingPath} 必须包含 JSON 对象`);
}

await mkdir(dirname(defaultsPath), { recursive: true });
const temporaryPath = `${defaultsPath}.project-map-install.${process.pid}`;
await writeFile(temporaryPath, `${JSON.stringify(mergeObjects(existing, routing), null, 2)}\n`, {
  mode: 0o600
});
await rename(temporaryPath, defaultsPath);
