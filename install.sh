#!/usr/bin/env bash

set -euo pipefail

GSD_VERSION="1.11.0"
GSD_PROFILE="full"
PROJECT_DIR=""
INIT_TITLE=""
INIT_TEXT=""
SKIP_GSD=0
SKIP_CLI=0
FORCE_SKILL=0
ALLOW_DIRTY=0

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
  ./install.sh --project /path/to/target-project [options]
  ./install.sh --skip-cli [options]

安装 GSD、project-map Codex Skill；提供 --project 时，还会安装项目本地
project-map CLI。目标项目已有 project-map 数据时会自动验证。

选项：
  --project PATH          安装 CLI 的目标项目
  --init-title TITLE      用此项目名称初始化新的 project-map 数据
  --init-text TEXT        与 --init-title 一起使用的原始需求
  --gsd-version VERSION   GSD 版本（默认：1.11.0）
  --gsd-profile PROFILE   GSD profile（默认：full）
  --skip-gsd              不安装或验证 GSD
  --skip-cli              不向目标项目安装 CLI
  --force-skill           备份并替换内容不同的既有 project-map Skill
  --allow-dirty           允许从包含未提交改动的源码克隆安装
  -h, --help              显示帮助

示例：
  ./install.sh --project /opt/my-project
  ./install.sh --project /opt/my-project \
    --init-title "项目名称" --init-text "项目的原始想法"
  ./install.sh --skip-cli
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

if [ "$SKIP_CLI" -eq 1 ] && [ -n "$INIT_TITLE" ]; then
  die "--skip-cli 与项目数据初始化参数不能同时使用"
fi

if [ "$SKIP_CLI" -eq 0 ] && [ -z "$PROJECT_DIR" ]; then
  die "除非使用 --skip-cli，否则必须提供 --project"
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

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) die "当前一键安装脚本只支持 macOS 与 Linux" ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SKILL_SOURCE="$SCRIPT_DIR/capability/skills/project-map"
[ -f "$SKILL_SOURCE/SKILL.md" ] || die "缺少 project-map Skill 源码：$SKILL_SOURCE"

if [ "$ALLOW_DIRTY" -eq 0 ] &&
   [ -n "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=normal)" ]; then
  die "源码克隆包含未提交改动；请先提交，或显式使用 --allow-dirty"
fi

SOURCE_COMMIT="$(git -C "$SCRIPT_DIR" rev-parse HEAD)"
SOURCE_REPOSITORY_URL="https://github.com/githuangjunwen/Project-initialization-skill.git"

if [ "$SKIP_GSD" -eq 0 ]; then
  log "正在安装 GSD ${GSD_VERSION}（profile：${GSD_PROFILE}）"
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

if [ "$SKIP_GSD" -eq 0 ]; then
  GSD_HOME="${CODEX_HOME:-$HOME/.codex}"
  GSD_VERSION_FILE="$GSD_HOME/gsd-core/VERSION"
  [ -f "$GSD_VERSION_FILE" ] || die "GSD runtime 验证失败，缺少：$GSD_VERSION_FILE"
  [ "$(tr -d '[:space:]' < "$GSD_VERSION_FILE")" = "$GSD_VERSION" ] ||
    die "已安装 GSD 版本与 $GSD_VERSION 不一致"
  [ -f "$SKILLS_ROOT/gsd-new-project/SKILL.md" ] ||
    die "GSD Skill 验证失败：缺少 gsd-new-project"
  [ -f "$SKILLS_ROOT/gsd-debug/SKILL.md" ] ||
    die "GSD 已安装但未暴露 gsd-debug；请在 Codex 中运行 \$gsd-surface profile full，然后重跑安装脚本"
fi

if [ "$SKIP_CLI" -eq 0 ]; then
  [ -d "$PROJECT_DIR" ] || die "目标项目不存在：$PROJECT_DIR"
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
  [ "$PROJECT_DIR" != "$SCRIPT_DIR" ] || die "目标项目不能是安装器源码仓库本身"
  [ -f "$PROJECT_DIR/package.json" ] || die "目标项目缺少 package.json：$PROJECT_DIR"
  CLI_SPEC="git+$SOURCE_REPOSITORY_URL#$SOURCE_COMMIT"

  log "正在向 $PROJECT_DIR 安装 commit $SOURCE_COMMIT 对应的 project-map CLI"
  npm --prefix "$PROJECT_DIR" install --save-dev "$CLI_SPEC"
  [ -x "$PROJECT_DIR/node_modules/.bin/project-map" ] ||
    die "CLI 验证失败：$PROJECT_DIR/node_modules/.bin/project-map"

  if [ -f "$PROJECT_DIR/.planning/project-map/index.json" ]; then
    log "正在验证既有 project-map 数据"
    npm --prefix "$PROJECT_DIR" exec -- project-map check --json
  elif [ -n "$INIT_TITLE" ]; then
    log "正在初始化 project-map 数据"
    npm --prefix "$PROJECT_DIR" exec -- project-map init \
      --project-title "$INIT_TITLE" \
      --text "$INIT_TEXT"
    npm --prefix "$PROJECT_DIR" exec -- project-map check --json
  else
    warn "CLI 已安装，但项目数据尚未初始化；准备好原始需求后，请使用 --init-title 与 --init-text 重跑"
  fi
fi

log "已完成所请求组件的安装与验收"
log "如果新 Skills 尚未出现，请重启 Codex，然后使用 /skills 或输入 \$project-map 验证"
