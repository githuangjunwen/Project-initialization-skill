import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const skillRoot = 'capability/skills/project-map';

test('发布包包含中文安装、多端更新与回滚说明', async () => {
  const packageManifest = JSON.parse(await readFile('package.json', 'utf8'));
  const guidePath = 'docs/安装部署与更新.md';
  const [guide, readme, design, historicalPlan] = await Promise.all([
    readFile(guidePath, 'utf8'),
    readFile('README.md', 'utf8'),
    readFile('docs/design/2026-08-20-project-map-capability-design.md', 'utf8'),
    readFile('docs/superpowers/plans/2026-08-20-project-map-capability.md', 'utf8')
  ]);

  assert.equal(packageManifest.files.includes(guidePath), true);
  assert.equal(packageManifest.files.includes('install.sh'), true);
  assert.match(guide, /每台设备的五分钟部署清单/);
  assert.match(guide, /多设备日常操作协议/);
  assert.match(guide, /回滚流程/);
  assert.match(guide, /\.agents\/skills\/project-map/);
  assert.match(guide, /@opengsd\/gsd-core@1\.11\.0/);
  assert.match(guide, /install-skill-from-github\.py/);
  assert.match(guide, /每条安装命令实际提供什么/);
  assert.match(guide, /\.\/install\.sh --project/);
  assert.match(guide, /文档职责与单一事实来源/);
  assert.doesNotMatch(guide, /mkdir -p ~\/\.codex\/skills/);
  assert.doesNotMatch(guide, /test ! -e ~\/\.codex\/skills\/project-map/);

  // README 只保留一键入口；容易漂移的精确手工命令集中到完整指南。
  assert.match(readme, /\.\/install\.sh --project/);
  assert.doesNotMatch(readme, /install-skill-from-github\.py/);
  assert.doesNotMatch(readme, /@opengsd\/gsd-core@/);
  assert.doesNotMatch(readme, /gsd-tools\.cjs/);

  // 历史设计与实施计划保留为证据，但必须明确阻止读者当作现行手册。
  assert.match(design, /历史设计文档/);
  assert.match(historicalPlan, /历史实施计划/);
  assert.match(historicalPlan, /当前 GSD 1\.11\.0 不应照抄执行/);
});

test('package 与 capability 清单版本保持一致', async () => {
  const [packageManifest, capabilityManifest] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('capability/capability.json', 'utf8').then(JSON.parse)
  ]);

  assert.equal(packageManifest.version, capabilityManifest.version);
});

test('一键安装脚本在隔离环境部署并重复验证四层安装', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'project-map-installer-'));
  const fakeBin = join(sandbox, 'bin');
  const home = join(sandbox, 'home');
  const project = join(sandbox, 'target-project');
  await mkdir(fakeBin, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), '{"name":"target","private":true}\n');

  const fakeNpx = join(fakeBin, 'npx');
  await writeFile(fakeNpx, `#!/bin/sh
set -eu
mkdir -p "$HOME/.codex/gsd-core"
mkdir -p "$HOME/.agents/skills/gsd-new-project"
mkdir -p "$HOME/.agents/skills/gsd-debug"
printf '1.11.0\\n' > "$HOME/.codex/gsd-core/VERSION"
: > "$HOME/.agents/skills/gsd-new-project/SKILL.md"
: > "$HOME/.agents/skills/gsd-debug/SKILL.md"
`);
  await chmod(fakeNpx, 0o755);

  const fakeNpm = join(fakeBin, 'npm');
  await writeFile(fakeNpm, `#!/bin/sh
set -eu
if [ "$1" = "--prefix" ]; then
  project_dir="$2"
  shift 2
else
  exit 2
fi
if [ "$1" = "install" ]; then
  mkdir -p "$project_dir/node_modules/.bin"
  printf '#!/bin/sh\\nexit 0\\n' > "$project_dir/node_modules/.bin/project-map"
  chmod +x "$project_dir/node_modules/.bin/project-map"
fi
`);
  await chmod(fakeNpm, 0o755);

  const env = {
    ...process.env,
    HOME: home,
    PATH: `${fakeBin}:${process.env.PATH}`
  };
  delete env.CODEX_HOME;

  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync('bash', [
      'install.sh', '--project', project, '--allow-dirty'
    ], { cwd: process.cwd(), env, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }

  await readFile(join(home, '.agents/skills/project-map/SKILL.md'), 'utf8');
  assert.equal(
    (await readFile(join(home, '.codex/gsd-core/VERSION'), 'utf8')).trim(),
    '1.11.0'
  );
  await readFile(join(home, '.agents/skills/gsd-debug/SKILL.md'), 'utf8');
  await readFile(join(project, 'node_modules/.bin/project-map'), 'utf8');
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
