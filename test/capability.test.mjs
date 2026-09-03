import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
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
  assert.equal(packageManifest.files.includes('uninstall.sh'), true);
  assert.match(guide, /每台设备的五分钟部署清单/);
  assert.match(guide, /多设备日常操作协议/);
  assert.match(guide, /回滚流程/);
  assert.match(guide, /\.agents\/skills\/project-map/);
  assert.match(guide, /GSD 1\.11\.0 需要 Node\.js 24/);
  assert.match(guide, /~\/\.local\/bin\/project-map/);
  assert.match(guide, /\$project-map 初始化新项目/);
  assert.match(guide, /\.\/install\.sh --project/);
  assert.match(guide, /\.\/uninstall\.sh/);
  assert.match(guide, /文档职责与单一事实来源/);
  assert.doesNotMatch(guide, /node_modules\/\.bin\/project-map/);
  assert.doesNotMatch(guide, /npx project-map/);
  assert.doesNotMatch(guide, /mkdir -p ~\/\.codex\/skills/);
  assert.doesNotMatch(guide, /test ! -e ~\/\.codex\/skills\/project-map/);

  // README 只保留一键入口；容易漂移的精确手工命令集中到完整指南。
  assert.match(readme, /\.\/install\.sh/);
  assert.match(readme, /\$project-map 初始化新项目/);
  assert.doesNotMatch(readme, /install-skill-from-github\.py/);
  assert.doesNotMatch(readme, /@opengsd\/gsd-core@/);
  assert.doesNotMatch(readme, /gsd-tools\.cjs/);
  assert.doesNotMatch(readme, /\/absolute\/path\/to\/target-project/);

  // 历史设计与实施计划保留为证据，但必须明确阻止读者当作现行手册。
  assert.match(design, /历史设计文档/);
  assert.match(historicalPlan, /历史实施计划/);
  assert.match(historicalPlan, /当前 GSD 1\.11\.0 不应照抄执行/);
});

test('一键卸载脚本移除运行组件并为数据与 surface 创建可恢复备份', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'project-map-uninstaller-'));
  const fakeBin = join(sandbox, 'bin');
  const home = join(sandbox, 'home');
  const project = join(sandbox, 'target-project');
  const skill = join(home, '.agents/skills/project-map');
  const gsdSkill = join(home, '.agents/skills/gsd-new-project');
  const gsdCore = join(home, '.codex/gsd-core');
  const projectData = join(project, '.planning/project-map');
  await mkdir(fakeBin, { recursive: true });
  await mkdir(skill, { recursive: true });
  await mkdir(gsdSkill, { recursive: true });
  await mkdir(gsdCore, { recursive: true });
  await mkdir(projectData, { recursive: true });
  await mkdir(join(home, '.local/bin'), { recursive: true });
  await mkdir(join(home, '.local/lib/node_modules/project-map-capability'), { recursive: true });
  await writeFile(join(project, 'package.json'), '{"name":"target","private":true}\n');
  await writeFile(join(skill, 'SKILL.md'), 'project-map\n');
  await writeFile(join(gsdSkill, 'SKILL.md'), 'gsd\n');
  await writeFile(join(gsdCore, 'VERSION'), '1.11.0\n');
  await writeFile(join(home, '.codex/.gsd-surface.json'), '{"baseProfile":"full"}\n');
  await writeFile(join(projectData, 'index.json'), '{}\n');
  await writeFile(join(home, '.local/bin/project-map'), '#!/bin/sh\nexit 0\n');
  await chmod(join(home, '.local/bin/project-map'), 0o755);

  const fakeNpx = join(fakeBin, 'npx');
  await writeFile(fakeNpx, `#!/bin/sh
set -eu
printf '%s\\n' "$*" > "$HOME/gsd-uninstall-args.txt"
rm -f "$HOME/.codex/gsd-core/VERSION"
rm -rf "$HOME/.agents/skills/gsd-new-project"
`);
  await chmod(fakeNpx, 0o755);

  const fakeNpm = join(fakeBin, 'npm');
  await writeFile(fakeNpm, `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$HOME/npm-uninstall-args.txt"
case "$*" in
  *"--global --prefix $HOME/.local"*)
    rm -f "$HOME/.local/bin/project-map"
    rm -rf "$HOME/.local/lib/node_modules/project-map-capability"
    ;;
esac
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
      'uninstall.sh', '--project', project, '--reset-data', '--reset-surface'
    ], { cwd: process.cwd(), env, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  }

  await assert.rejects(readFile(join(skill, 'SKILL.md'), 'utf8'));
  await assert.rejects(readFile(join(gsdCore, 'VERSION'), 'utf8'));
  await assert.rejects(readFile(join(home, '.codex/.gsd-surface.json'), 'utf8'));
  await assert.rejects(readFile(join(projectData, 'index.json'), 'utf8'));
  await assert.rejects(readFile(join(home, '.local/bin/project-map'), 'utf8'));

  const backupIds = await readdir(join(home, '.project-map-uninstall-backups'));
  assert.equal(backupIds.length, 1);
  await readFile(join(
    home,
    '.project-map-uninstall-backups',
    backupIds[0],
    'project-map-skill',
    'SKILL.md'
  ), 'utf8');
  await readFile(join(
    home,
    '.project-map-uninstall-backups',
    backupIds[0],
    'gsd-surface.json'
  ), 'utf8');

  const planningEntries = await readdir(join(project, '.planning'));
  const dataBackup = planningEntries.find((name) => name.startsWith('project-map.uninstalled.'));
  assert.ok(dataBackup);
  await readFile(join(project, '.planning', dataBackup, 'index.json'), 'utf8');
  assert.match(await readFile(join(home, 'gsd-uninstall-args.txt'), 'utf8'), /--uninstall/);
  assert.match(
    await readFile(join(home, 'npm-uninstall-args.txt'), 'utf8'),
    /uninstall --global --prefix .*\.local project-map-capability/
  );
});

test('package 与 capability 清单版本保持一致', async () => {
  const [packageManifest, capabilityManifest] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('capability/capability.json', 'utf8').then(JSON.parse)
  ]);

  assert.equal(packageManifest.version, capabilityManifest.version);
});

test('一键安装脚本在隔离环境部署并重复验证设备级组件', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'project-map-installer-'));
  const fakeBin = join(sandbox, 'bin');
  const home = join(sandbox, 'home');
  const project = join(sandbox, 'target-project');
  await mkdir(fakeBin, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });

  const fakeNode = join(fakeBin, 'node');
  await writeFile(fakeNode, `#!/bin/sh
set -eu
if [ "\${1:-}" = "-p" ]; then
  printf '24\n'
  exit 0
fi
exec "${process.execPath}" "$@"
`);
  await chmod(fakeNode, 0o755);

  const fakeNpx = join(fakeBin, 'npx');
  await writeFile(fakeNpx, `#!/bin/sh
set -eu
mkdir -p "$HOME/.codex/gsd-core"
mkdir -p "$HOME/.agents/skills/gsd-new-project"
mkdir -p "$HOME/.agents/skills/gsd-surface"
printf '1.11.0\\n' > "$HOME/.codex/gsd-core/VERSION"
: > "$HOME/.agents/skills/gsd-new-project/SKILL.md"
: > "$HOME/.agents/skills/gsd-surface/SKILL.md"
case "$*" in
  *--profile=full*)
    mkdir -p "$HOME/.agents/skills/gsd-debug"
    : > "$HOME/.agents/skills/gsd-debug/SKILL.md"
    ;;
esac
printf '%s\\n' "$*" > "$HOME/gsd-install-args.txt"
`);
  await chmod(fakeNpx, 0o755);

const fakeNpm = join(fakeBin, 'npm');
  await writeFile(fakeNpm, `#!/bin/sh
set -eu
if [ "$1" = "pack" ] && [ "$3" = "--pack-destination" ]; then
  mkdir -p "$4"
  : > "$4/project-map-capability-test.tgz"
  printf 'project-map-capability-test.tgz\\n'
  exit 0
fi
if [ "$1" != "install" ] || [ "$2" != "--global" ] || [ "$3" != "--prefix" ]; then
  exit 2
fi
cli_prefix="$4"
mkdir -p "$cli_prefix/bin"
cat > "$cli_prefix/bin/project-map" <<'SCRIPT'
#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$HOME/cli-invocations.txt"
if [ "\${1:-}" = "init" ]; then
  mkdir -p .planning/project-map
  printf '{}\\n' > .planning/project-map/index.json
fi
exit 0
SCRIPT
chmod +x "$cli_prefix/bin/project-map"
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
  await readFile(join(home, '.agents/skills/gsd-surface/SKILL.md'), 'utf8');
  assert.match(await readFile(join(home, 'gsd-install-args.txt'), 'utf8'), /--profile=core/);
  await readFile(join(home, '.local/bin/project-map'), 'utf8');

  const deviceOnlyResult = spawnSync('bash', [
    'install.sh', '--allow-dirty'
  ], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(
    deviceOnlyResult.status,
    0,
    `${deviceOnlyResult.stdout}\n${deviceOnlyResult.stderr}`
  );

  const newProject = join(sandbox, 'blank-project');
  await mkdir(newProject);
  const initResult = spawnSync('bash', [
    'install.sh', '--project', newProject, '--allow-dirty',
    '--init-title', '新项目', '--init-text', '未经改写的原始想法'
  ], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(initResult.status, 0, `${initResult.stdout}\n${initResult.stderr}`);
  await readFile(join(newProject, '.planning/project-map/index.json'), 'utf8');
  assert.match(await readFile(join(home, 'cli-invocations.txt'), 'utf8'), /add project --title 新项目 --source SRC-001/);

  const fullResult = spawnSync('bash', [
    'install.sh', '--project', project, '--allow-dirty', '--gsd-profile', 'full'
  ], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(fullResult.status, 0, `${fullResult.stdout}\n${fullResult.stderr}`);
  await readFile(join(home, '.agents/skills/gsd-debug/SKILL.md'), 'utf8');
  assert.match(await readFile(join(home, 'gsd-install-args.txt'), 'utf8'), /--profile=full/);
});

test('一键安装脚本在占位目标路径上先失败且不产生半安装状态', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'project-map-preflight-'));
  const home = join(sandbox, 'home');
  await mkdir(home, { recursive: true });

  const env = { ...process.env, HOME: home };
  delete env.CODEX_HOME;
  const result = spawnSync('bash', [
    'install.sh', '--project', '/absolute/path/to/target-project', '--allow-dirty'
  ], { cwd: process.cwd(), env, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /文档占位符/);
  assert.equal(spawnSync('test', ['-e', join(home, '.agents')]).status, 1);
});

test('完整安装在 Node.js 版本不满足 GSD 要求时先失败', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'project-map-node-preflight-'));
  const fakeBin = join(sandbox, 'bin');
  const home = join(sandbox, 'home');
  const project = join(sandbox, 'target-project');
  await mkdir(fakeBin, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), '{"name":"target","private":true}\n');

  const fakeNode = join(fakeBin, 'node');
  await writeFile(fakeNode, `#!/bin/sh
set -eu
if [ "\${1:-}" = "-p" ]; then
  printf '22\n'
else
  printf 'v22.23.2\n'
fi
`);
  await chmod(fakeNode, 0o755);

  const env = {
    ...process.env,
    HOME: home,
    PATH: `${fakeBin}:${process.env.PATH}`
  };
  delete env.CODEX_HOME;
  const result = spawnSync('bash', [
    'install.sh', '--project', project, '--allow-dirty'
  ], { cwd: process.cwd(), env, encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /GSD 1\.11\.0 要求 Node\.js 24/);
  assert.equal(spawnSync('test', ['-e', join(home, '.agents')]).status, 1);
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
  assert.match(skill, /初始化新项目/);
  assert.match(skill, /\$HOME\/\.local\/bin\/project-map/);
  assert.match(skill, /\$gsd-new-project/);
  assert.match(skill, /add project.*SRC-001/);
  assert.match(skill, /不得改走 `gsd-new-milestone`/);
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
