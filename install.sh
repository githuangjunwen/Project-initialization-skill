#!/usr/bin/env bash

set -euo pipefail

GSD_VERSION="1.11.0"
GSD_PROFILE="full"
GSD_SURFACE="core"
PROJECT_DIR=""
INIT_TITLE=""
INIT_TEXT=""
SKIP_GSD=0
SKIP_CLI=0
FORCE_SKILL=0
ALLOW_DIRTY=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

log() {
  printf '[project-map] %s\n' "$*"
}

warn() {
  printf '[project-map] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[project-map] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：
  ./install.sh [options]
  ./install.sh --project /真实/项目路径 [options]

一键安装设备级 GSD、project-map Codex Skill 和 project-map CLI。提供真实的
--project 路径时，还会验证已有项目数据，或配合初始化参数创建数据。

选项：
  --project PATH          安装后验证或初始化此项目（可选）
  --init-title TITLE      用此项目名称初始化新的 project-map 数据
  --init-text TEXT        与 --init-title 一起使用的原始需求
  --gsd-version VERSION   GSD 版本（默认：1.11.0）
  --gsd-profile PROFILE   GSD 安装完整度；本安装器要求 full（默认：full）
  --gsd-surface PROFILE   Desktop Skill 展示：core 或 full（默认：core）
  --skip-gsd              不安装或验证 GSD
  --skip-cli              不安装设备级 project-map CLI
  --force-skill           备份并替换内容不同的既有 project-map Skill
  --allow-dirty           允许从包含未提交改动的源码克隆安装
  -h, --help              显示帮助

示例：
  ./install.sh
  ./install.sh --project /opt/ceshi/ds-wechat-api-ubuntu
  ./install.sh --project /opt/ceshi/ds-wechat-api-ubuntu \
    --init-title "项目名称" --init-text "项目的原始想法"
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      [ "$#" -ge 2 ] || die "--project 缺少路径"
      PROJECT_DIR="$2"
      shift 2
      ;;
    --init-title)
      [ "$#" -ge 2 ] || die "--init-title 缺少值"
      INIT_TITLE="$2"
      shift 2
      ;;
    --init-text)
      [ "$#" -ge 2 ] || die "--init-text 缺少值"
      INIT_TEXT="$2"
      shift 2
      ;;
    --gsd-version)
      [ "$#" -ge 2 ] || die "--gsd-version 缺少值"
      GSD_VERSION="$2"
      shift 2
      ;;
    --gsd-profile)
      [ "$#" -ge 2 ] || die "--gsd-profile 缺少值"
      GSD_PROFILE="$2"
      shift 2
      ;;
    --gsd-surface)
      [ "$#" -ge 2 ] || die "--gsd-surface 缺少值"
      GSD_SURFACE="$2"
      shift 2
      ;;
    --skip-gsd)
      SKIP_GSD=1
      shift
      ;;
    --skip-cli)
      SKIP_CLI=1
      shift
      ;;
    --force-skill)
      FORCE_SKILL=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知选项：$1（运行 ./install.sh --help 查看帮助）"
      ;;
  esac
done

if { [ -n "$INIT_TITLE" ] && [ -z "$INIT_TEXT" ]; } ||
   { [ -z "$INIT_TITLE" ] && [ -n "$INIT_TEXT" ]; }; then
  die "--init-title 与 --init-text 必须同时提供"
fi

if [ -n "$INIT_TITLE" ] && [ -z "$PROJECT_DIR" ]; then
  die "使用初始化参数时必须同时提供真实的 --project 路径"
fi

if [ "$SKIP_CLI" -eq 1 ] && { [ -n "$PROJECT_DIR" ] || [ -n "$INIT_TITLE" ]; }; then
  die "--skip-cli 不能与 --project 或项目数据初始化参数同时使用"
fi

if [ "$SKIP_GSD" -eq 0 ]; then
  case "$GSD_PROFILE" in
    full) ;;
    core|standard)
      die "本安装器要求 GSD full profile，以保证子 Agent、Hooks 和工作流完整；界面精简请使用 --gsd-surface core"
      ;;
    *) die "不支持的 GSD profile：${GSD_PROFILE}；本安装器仅支持 full" ;;
  esac
  case "$GSD_SURFACE" in
    core|full) ;;
    *) die "不支持的 GSD surface：${GSD_SURFACE}；可选值为 core、full" ;;
  esac
fi

# Validate every user-controlled target before installing GSD or copying Skills.
# This prevents an invalid project path from leaving a misleading partial install.
if [ -n "$PROJECT_DIR" ]; then
  case "$PROJECT_DIR" in
    /absolute/path/to/target-project|/path/to/target-project)
      SOURCE_PARENT="$(dirname "$SCRIPT_DIR")"
      if [ -f "$SOURCE_PARENT/package.json" ]; then
        die "--project 收到的是文档占位符：${PROJECT_DIR}；按当前目录结构可尝试：./install.sh --project '${SOURCE_PARENT}'"
      fi
      die "--project 收到的是文档占位符：${PROJECT_DIR}；请替换为真实存在的项目目录"
      ;;
  esac
  [ -d "$PROJECT_DIR" ] || die "目标项目不存在：$PROJECT_DIR"
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
  [ "$PROJECT_DIR" != "$SCRIPT_DIR" ] || die "目标项目不能是安装器源码仓库本身"
fi

for command_name in git node npm npx; do
  command -v "$command_name" >/dev/null 2>&1 || die "缺少必要命令：$command_name"
done

command -v codex >/dev/null 2>&1 ||
  warn "PATH 中未找到 codex；如果已经安装 Codex Desktop，可以继续"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
case "$NODE_MAJOR" in
  ''|*[!0-9]*) die "无法确定 Node.js 版本" ;;
esac
[ "$NODE_MAJOR" -ge 18 ] || die "需要 Node.js 18 或更高版本"

if [ "$SKIP_GSD" -eq 0 ] && [ "$GSD_VERSION" = "1.11.0" ] && [ "$NODE_MAJOR" -lt 24 ]; then
  die "GSD 1.11.0 要求 Node.js 24 或更高版本；当前为 $(node --version)。升级 Node.js，或仅安装 Project Map 时使用 --skip-gsd"
fi

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) die "当前一键安装脚本只支持 macOS 与 Linux" ;;
esac

SKILL_SOURCE="$SCRIPT_DIR/capability/skills/project-map"
[ -f "$SKILL_SOURCE/SKILL.md" ] || die "缺少 project-map Skill 源码：$SKILL_SOURCE"

if [ "$ALLOW_DIRTY" -eq 0 ] &&
   [ -n "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=normal)" ]; then
  die "源码克隆包含未提交改动；请先提交，或显式使用 --allow-dirty"
fi

SOURCE_COMMIT="$(git -C "$SCRIPT_DIR" rev-parse HEAD)"
SOURCE_LABEL="$SOURCE_COMMIT"
if [ -n "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=normal)" ]; then
  SOURCE_LABEL="${SOURCE_COMMIT}+working-tree"
fi
CLI_PREFIX="${PROJECT_MAP_CLI_PREFIX:-$HOME/.local}"
CLI_BIN="$CLI_PREFIX/bin/project-map"

if [ "$SKIP_GSD" -eq 0 ]; then
  log "正在完整安装 GSD ${GSD_VERSION}（profile：${GSD_PROFILE}，Skill 展示：${GSD_SURFACE}）"
  npx -y "@opengsd/gsd-core@$GSD_VERSION" --codex --global "--profile=$GSD_PROFILE"
fi

SKILLS_ROOT="$HOME/.agents/skills"
SKILL_TARGET="$SKILLS_ROOT/project-map"
mkdir -p "$SKILLS_ROOT"

if [ -e "$SKILL_TARGET" ] || [ -L "$SKILL_TARGET" ]; then
  if diff -qr "$SKILL_SOURCE" "$SKILL_TARGET" >/dev/null 2>&1; then
    log "project-map Skill 已是当前版本"
  elif [ "$FORCE_SKILL" -eq 1 ]; then
    BACKUP_TARGET="$SKILLS_ROOT/project-map.backup.$(date +%Y%m%d%H%M%S).$$"
    mv "$SKILL_TARGET" "$BACKUP_TARGET"
    log "旧 Skill 已备份到 $BACKUP_TARGET"
  else
    die "$SKILL_TARGET 已存在且内容不同；请先检查，或使用 --force-skill 备份后替换"
  fi
fi

if [ ! -e "$SKILL_TARGET" ] && [ ! -L "$SKILL_TARGET" ]; then
  INSTALL_STAGE="$(mktemp -d "$SKILLS_ROOT/.project-map-install.XXXXXX")"
  trap 'rm -rf "$INSTALL_STAGE"' EXIT
  mkdir -p "$INSTALL_STAGE/project-map"
  cp -R "$SKILL_SOURCE/." "$INSTALL_STAGE/project-map/"
  mv "$INSTALL_STAGE/project-map" "$SKILL_TARGET"
  rmdir "$INSTALL_STAGE"
  trap - EXIT
  log "project-map Skill 已安装到 $SKILL_TARGET"
fi

[ -f "$SKILL_TARGET/SKILL.md" ] || die "Skill 验证失败：$SKILL_TARGET/SKILL.md"

if [ "$SKIP_CLI" -eq 0 ]; then
  CLI_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/project-map-cli-install.XXXXXX")"
  trap 'rm -rf "$CLI_STAGE"' EXIT
  CLI_TARBALL_NAME="$(npm pack "$SCRIPT_DIR" --pack-destination "$CLI_STAGE" --silent)"
  CLI_TARBALL="$CLI_STAGE/$CLI_TARBALL_NAME"
  [ -f "$CLI_TARBALL" ] || die "CLI 打包失败：$CLI_TARBALL"
  log "正在安装设备级 project-map CLI（来源：${SOURCE_LABEL}）"
  npm install --global --prefix "$CLI_PREFIX" "$CLI_TARBALL"
  rm -rf "$CLI_STAGE"
  trap - EXIT
  [ -x "$CLI_BIN" ] || die "CLI 验证失败：$CLI_BIN"
  case ":$PATH:" in
    *":$CLI_PREFIX/bin:"*) ;;
    *) warn "$CLI_PREFIX/bin 不在 PATH 中；Skill 会直接使用 ${CLI_BIN}，命令行用户可将该目录加入 PATH" ;;
  esac
fi

if [ "$SKIP_GSD" -eq 0 ]; then
  GSD_HOME="${CODEX_HOME:-$HOME/.codex}"
  GSD_VERSION_FILE="$GSD_HOME/gsd-core/VERSION"
  [ -f "$GSD_VERSION_FILE" ] || die "GSD runtime 验证失败，缺少：$GSD_VERSION_FILE"
  [ "$(tr -d '[:space:]' < "$GSD_VERSION_FILE")" = "$GSD_VERSION" ] ||
    die "已安装 GSD 版本与 $GSD_VERSION 不一致"
  [ -f "$SKILLS_ROOT/gsd-new-project/SKILL.md" ] ||
    die "GSD Skill 验证失败：缺少 gsd-new-project"
  [ -f "$SKILLS_ROOT/gsd-surface/SKILL.md" ] ||
    die "GSD Skill 验证失败：缺少 gsd-surface"
  for agent_name in gsd-phase-researcher gsd-planner gsd-plan-checker gsd-executor; do
    [ -f "$GSD_HOME/agents/$agent_name.toml" ] ||
      die "GSD 子 Agent 验证失败：缺少 $GSD_HOME/agents/$agent_name.toml"
  done
  case ",${GSD_PROFILE}," in
    *,full,*)
      [ -f "$SKILLS_ROOT/gsd-debug/SKILL.md" ] ||
        die "GSD full profile 验证失败：缺少 gsd-debug"
      ;;
  esac

  if [ "$GSD_PROFILE" = "full" ]; then
    AGENT_COUNT="$(find "$GSD_HOME/agents" -maxdepth 1 -name 'gsd-*.toml' -type f | wc -l | tr -d '[:space:]')"
    [ "$AGENT_COUNT" -ge 34 ] || die "GSD full 安装不完整：仅发现 ${AGENT_COUNT} 个 Agent TOML，预期至少 34 个"
  fi

  GSD_HIDDEN_SKILLS="$GSD_HOME/project-map-hidden-gsd-skills"
  GSD_HIDDEN_MARKER="$GSD_HIDDEN_SKILLS/.project-map-managed"
  if [ "$GSD_SURFACE" = "core" ]; then
    SURFACE_STAGE="$(mktemp -d "$GSD_HOME/.project-map-surface.XXXXXX")"
    trap 'rm -rf "$SURFACE_STAGE"' EXIT
    mkdir -p "$SURFACE_STAGE/full"
    FULL_SKILL_COUNT=0
    for gsd_skill_dir in "$SKILLS_ROOT"/gsd-*; do
      [ -d "$gsd_skill_dir" ] || continue
      cp -R "$gsd_skill_dir" "$SURFACE_STAGE/full/"
      FULL_SKILL_COUNT=$((FULL_SKILL_COUNT + 1))
    done
    [ "$FULL_SKILL_COUNT" -gt 8 ] || die "GSD full Skill 验证失败：仅发现 ${FULL_SKILL_COUNT} 个 Skills"

    if [ -e "$GSD_HIDDEN_SKILLS" ] || [ -L "$GSD_HIDDEN_SKILLS" ]; then
      [ -f "$GSD_HIDDEN_MARKER" ] ||
        die "拒绝覆盖非本安装器管理的目录：$GSD_HIDDEN_SKILLS"
      OLD_HIDDEN_SKILLS="${GSD_HIDDEN_SKILLS}.old.$$"
      mv "$GSD_HIDDEN_SKILLS" "$OLD_HIDDEN_SKILLS"
    else
      OLD_HIDDEN_SKILLS=""
    fi
    mv "$SURFACE_STAGE/full" "$GSD_HIDDEN_SKILLS"
    printf 'managed-by=project-map-install.sh\n' > "$GSD_HIDDEN_MARKER"
    rmdir "$SURFACE_STAGE"
    trap - EXIT
    if [ -n "$OLD_HIDDEN_SKILLS" ]; then
      rm -rf "$OLD_HIDDEN_SKILLS"
    fi

    for gsd_skill_dir in "$SKILLS_ROOT"/gsd-*; do
      [ -d "$gsd_skill_dir" ] || continue
      case "$(basename "$gsd_skill_dir")" in
        gsd-new-project|gsd-discuss-phase|gsd-plan-phase|gsd-execute-phase|gsd-phase|gsd-help|gsd-update|gsd-surface) ;;
        *) rm -rf "$gsd_skill_dir" ;;
      esac
    done
    printf '{\n  "baseProfile": "core",\n  "disabledClusters": [],\n  "explicitAdds": [],\n  "explicitRemoves": []\n}\n' > "$GSD_HOME/.gsd-surface.json"
  else
    if [ -e "$GSD_HIDDEN_SKILLS" ] || [ -L "$GSD_HIDDEN_SKILLS" ]; then
      if [ -f "$GSD_HIDDEN_MARKER" ]; then
        rm -rf "$GSD_HIDDEN_SKILLS"
      else
        warn "已保留非本安装器管理的目录：$GSD_HIDDEN_SKILLS"
      fi
    fi
    printf '{\n  "baseProfile": "full",\n  "disabledClusters": [],\n  "explicitAdds": [],\n  "explicitRemoves": []\n}\n' > "$GSD_HOME/.gsd-surface.json"
  fi

  ACTIVE_SKILL_COUNT="$(find "$SKILLS_ROOT" -mindepth 2 -maxdepth 2 -path '*/gsd-*/SKILL.md' -type f | wc -l | tr -d '[:space:]')"
  if [ "$GSD_SURFACE" = "core" ]; then
    [ "$ACTIVE_SKILL_COUNT" -eq 8 ] || die "GSD core 展示验证失败：发现 ${ACTIVE_SKILL_COUNT} 个可见 GSD Skills，预期 8 个"
    [ -f "$GSD_HIDDEN_SKILLS/gsd-debug/SKILL.md" ] || die "GSD 隐藏 Skill 存储验证失败：缺少 gsd-debug"
  fi
  log "GSD 验收完成：${AGENT_COUNT:-核心} 个 Agent TOML，${ACTIVE_SKILL_COUNT} 个可见 GSD Skills"
fi

if [ -n "$PROJECT_DIR" ]; then
  [ -x "$CLI_BIN" ] || die "使用 --project 时需要设备级 CLI；请移除 --skip-cli"
  if [ -f "$PROJECT_DIR/.planning/project-map/index.json" ]; then
    log "正在验证既有 project-map 数据"
    (cd "$PROJECT_DIR" && "$CLI_BIN" check --json)
  elif [ -n "$INIT_TITLE" ]; then
    log "正在初始化 project-map 数据"
    (cd "$PROJECT_DIR" && "$CLI_BIN" init \
      --project-title "$INIT_TITLE" \
      --text "$INIT_TEXT")
    (cd "$PROJECT_DIR" && "$CLI_BIN" add project \
      --title "$INIT_TITLE" \
      --source SRC-001)
    (cd "$PROJECT_DIR" && "$CLI_BIN" check --json)
  else
    warn "设备组件已安装，但此项目尚未初始化；在项目中启动 Codex 并输入：\$project-map 初始化新项目"
  fi
fi

log "安装完成"
if [ "$SKIP_CLI" -eq 0 ]; then
  log "下一步：重启 Codex，在新项目目录输入：\$project-map 初始化新项目"
fi

log "已完成所请求组件的安装与验收"
log "如果新 Skills 尚未出现，请重启 Codex，然后使用 /skills 或输入 \$project-map 验证"
