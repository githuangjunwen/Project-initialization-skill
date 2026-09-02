import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skillRoot = 'capability/skills/project-map';

test('发布包包含中文安装、多端更新与回滚说明', async () => {
  const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
  const guidePath = 'docs/安装部署与更新.md';
  const guide = await readFile(guidePath, 'utf8');

  assert.equal(packageManifest.files.includes(guidePath), true);
  assert.match(guide, /每台设备的五分钟部署清单/);
  assert.match(guide, /多设备日常操作协议/);
  assert.match(guide, /回滚流程/);
});

test('capability exposes one project-map skill and no internal command module', async () => {
  const manifest = JSON.parse(await readFile('capability/capability.json', 'utf8'));
  assert.equal(manifest.id, 'project-map');
  assert.deepEqual(manifest.runtimeCompat.supported, ['codex']);
  assert.deepEqual(manifest.skills, ['project-map']);
  assert.equal('commands' in manifest, false);
  assert.equal('module' in manifest, false);
  assert.deepEqual(manifest.steps, []);
  assert.deepEqual(manifest.gates, []);
});

test('skill routes Chinese resume intent through focus before GSD handoff', async () => {
  const skill = await readFile(`${skillRoot}/SKILL.md`, 'utf8');
  assert.match(skill, /推进.*focus/s);
  assert.match(skill, /readiness/);
  assert.match(
    skill,
    /就绪检查被阻断时，绝不调用 GSD 计划或执行/
  );
  assert.match(skill, /自动生成的 Markdown 文档必须使用简体中文/);
  assert.match(skill, /references\/discovery\.md/);
  assert.match(skill, /references\/readiness\.md/);
  assert.match(skill, /references\/gsd-handoff\.md/);
  assert.equal(skill.trim().split(/\s+/).length < 500, true);
});

test('references keep discovery, deterministic gates, and GSD mapping separate', async () => {
  const [discovery, readiness, handoff] = await Promise.all([
    readFile(`${skillRoot}/references/discovery.md`, 'utf8'),
    readFile(`${skillRoot}/references/readiness.md`, 'utf8'),
    readFile(`${skillRoot}/references/gsd-handoff.md`, 'utf8')
  ]);
  assert.match(discovery, /业务规则/);
  assert.match(readiness, /CRITICAL_DECISION_UNCONFIRMED/);
  assert.match(handoff, /GSD/);
});
