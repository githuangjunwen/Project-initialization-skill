#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR=""
KEEP_GSD=0
KEEP_SKILL=0
KEEP_CLI=0
RESET_DATA=0
RESET_SURFACE=0
RUNTIME=""
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
  ./uninstall.sh --runtime claude|codex [options]
  ./uninstall.sh --runtime claude|codex --project /真实/项目路径 [options]

一键卸载指定运行时的设备级 GSD、project-map Skill 和共享 CLI。必须显式指定
--runtime claude 或 --runtime codex。提供
--project 时会清理旧版项目本地 CLI；项目数据默认保留。

选项：
  --project PATH     清理旧版项目本地 CLI，或配合 --reset-data 使用
  --reset-data       将 .planning/project-map 移到带时间戳的备份后重置
  --reset-surface    备份并清除 GSD surface 选择，供干净重装测试
  --runtime RUNTIME  必填：claude 或 codex
  --keep-gsd         保留设备级 GSD runtime 和 gsd-* Skills
  --keep-skill       保留用户级 project-map Skill
  --keep-cli         保留设备级 project-map CLI
  -h, --help         显示帮助

示例：
  ./uninstall.sh --runtime claude
  ./uninstall.sh --runtime codex
  ./uninstall.sh --runtime codex --project /opt/ceshi/ds-wechat-api-ubuntu
  ./uninstall.sh --runtime codex --project /opt/ceshi/ds-wechat-api-ubuntu \
    --reset-data --reset-surface
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      [ "$#" -ge 2 ] || die "--project 缺少路径"
      PROJECT_DIR="$2"
      shift 2
      ;;
    --reset-data)
      RESET_DATA=1
      shift
      ;;
    --reset-surface)
      RESET_SURFACE=1
      shift
      ;;
    --runtime)
      [ "$#" -ge 2 ] || die "--runtime 缺少值"
      RUNTIME="$2"
      shift 2
      ;;
    --keep-gsd)
      KEEP_GSD=1
      shift
      ;;
    --keep-skill)
      KEEP_SKILL=1
      shift
      ;;
    --keep-cli)
      KEEP_CLI=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知选项：$1（运行 ./uninstall.sh --help 查看帮助）"
      ;;
  esac
done

case "$RUNTIME" in
  claude|codex) ;;
  '') die "必须显式提供 --runtime claude 或 --runtime codex" ;;
  *) die "不支持的 runtime：${RUNTIME}；可选值为 claude、codex" ;;
esac

if [ "$RESET_DATA" -eq 1 ] && [ -z "$PROJECT_DIR" ]; then
  die "--reset-data 必须与 --project 一起使用"
fi

if [ -n "$PROJECT_DIR" ]; then
  [ -d "$PROJECT_DIR" ] || die "目标项目不存在：$PROJECT_DIR"
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
  [ "$PROJECT_DIR" != "$SCRIPT_DIR" ] || die "目标项目不能是卸载器源码仓库本身"
fi

GSD_HOME="${CODEX_HOME:-$HOME/.codex}"
SKILLS_ROOT="$HOME/.agents/skills"
SKILL_TARGET="$SKILLS_ROOT/project-map"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CLAUDE_SKILL_TARGET="$CLAUDE_HOME/skills/project-map"
BACKUP_ROOT="$HOME/.project-map-uninstall-backups"
BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ).$$"
BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
CLI_PREFIX="${PROJECT_MAP_CLI_PREFIX:-$HOME/.local}"
CLI_BIN="$CLI_PREFIX/bin/project-map"

backup_move() {
  local source_path="$1"
  local backup_name="$2"
  mkdir -p "$BACKUP_DIR"
  mv "$source_path" "$BACKUP_DIR/$backup_name"
  log "已备份 $source_path → $BACKUP_DIR/$backup_name"
}

# CLI 为两端共享；另一端仍安装时，不因单端卸载而移除它。
if [ "$RUNTIME" = "codex" ] && { [ -e "$CLAUDE_SKILL_TARGET" ] || [ -L "$CLAUDE_SKILL_TARGET" ]; }; then
  KEEP_CLI=1
  warn "检测到 Claude Code project-map Skill；已保留共享 CLI"
elif [ "$RUNTIME" = "claude" ] && { [ -e "$SKILL_TARGET" ] || [ -L "$SKILL_TARGET" ]; }; then
  KEEP_CLI=1
  warn "检测到 Codex project-map Skill；已保留共享 CLI"
fi

if [ -n "$PROJECT_DIR" ]; then
  if [ -f "$PROJECT_DIR/package.json" ]; then
    command -v npm >/dev/null 2>&1 || die "缺少必要命令：npm"
    log "正在清理 $PROJECT_DIR 中的旧版项目本地 CLI 依赖"
    npm --prefix "$PROJECT_DIR" uninstall project-map-capability
  fi

  if [ "$RESET_DATA" -eq 1 ]; then
    DATA_DIR="$PROJECT_DIR/.planning/project-map"
    if [ -e "$DATA_DIR" ] || [ -L "$DATA_DIR" ]; then
      DATA_BACKUP="$PROJECT_DIR/.planning/project-map.uninstalled.$BACKUP_ID"
      mv "$DATA_DIR" "$DATA_BACKUP"
      log "项目数据已移到可恢复备份：$DATA_BACKUP"
    else
      log "项目没有 .planning/project-map 数据，无需重置"
    fi
  else
    log "已保留项目数据：$PROJECT_DIR/.planning/project-map"
  fi
fi

if [ "$KEEP_CLI" -eq 0 ]; then
  if [ -e "$CLI_BIN" ] || [ -L "$CLI_BIN" ] || [ -d "$CLI_PREFIX/lib/node_modules/project-map-capability" ]; then
    command -v npm >/dev/null 2>&1 || die "缺少必要命令：npm"
    log "正在卸载设备级 project-map CLI"
    npm uninstall --global --prefix "$CLI_PREFIX" project-map-capability
    [ ! -e "$CLI_BIN" ] && [ ! -L "$CLI_BIN" ] || die "CLI 卸载验证失败：$CLI_BIN 仍存在"
  else
    log "设备级 project-map CLI 未安装，无需卸载"
  fi
else
  log "已按 --keep-cli 保留设备级 project-map CLI"
fi

if [ "$KEEP_SKILL" -eq 0 ] && [ "$RUNTIME" = "codex" ]; then
  if [ -e "$SKILL_TARGET" ] || [ -L "$SKILL_TARGET" ]; then
    backup_move "$SKILL_TARGET" "project-map-skill"
  else
    log "project-map Skill 未安装，无需卸载"
  fi
else
  log "已保留 Codex project-map Skill"
fi

if [ "$KEEP_SKILL" -eq 0 ] && [ "$RUNTIME" = "claude" ]; then
  if [ -e "$CLAUDE_SKILL_TARGET" ] || [ -L "$CLAUDE_SKILL_TARGET" ]; then
    backup_move "$CLAUDE_SKILL_TARGET" "project-map-claude-skill"
  else
    log "Claude Code project-map Skill 未安装，无需卸载"
  fi
else
  log "已保留 Claude Code project-map Skill"
fi

if [ "$KEEP_GSD" -eq 0 ] && [ "$RUNTIME" = "codex" ]; then
  GSD_VERSION_FILE="$GSD_HOME/gsd-core/VERSION"
  if [ -f "$GSD_VERSION_FILE" ]; then
    GSD_VERSION="$(tr -d '[:space:]' < "$GSD_VERSION_FILE")"
    case "$GSD_VERSION" in
      ''|*[!0-9A-Za-z.+-]*) die "无法安全解析已安装的 GSD 版本：$GSD_VERSION" ;;
    esac
    command -v npx >/dev/null 2>&1 || die "缺少必要命令：npx"
    log "正在使用官方卸载器移除 GSD $GSD_VERSION"
    npx -y "@opengsd/gsd-core@$GSD_VERSION" --codex --global --uninstall
    [ ! -f "$GSD_VERSION_FILE" ] || die "GSD 卸载验证失败：VERSION 仍存在"
  else
    log "GSD runtime 未安装，无需卸载"
  fi
  GSD_HIDDEN_SKILLS="$GSD_HOME/project-map-hidden-gsd-skills"
  if [ -e "$GSD_HIDDEN_SKILLS" ] || [ -L "$GSD_HIDDEN_SKILLS" ]; then
    if [ -f "$GSD_HIDDEN_SKILLS/.project-map-managed" ]; then
      rm -rf "$GSD_HIDDEN_SKILLS"
      log "已移除 Project Map 管理的 GSD 隐藏 Skill 副本"
    else
      warn "已保留非本卸载器管理的目录：$GSD_HIDDEN_SKILLS"
    fi
  fi
else
  log "已保留 Codex GSD"
fi

if [ "$KEEP_GSD" -eq 0 ] && [ "$RUNTIME" = "claude" ]; then
  CLAUDE_GSD_VERSION_FILE="$CLAUDE_HOME/gsd-core/VERSION"
  if [ -f "$CLAUDE_GSD_VERSION_FILE" ]; then
    CLAUDE_GSD_VERSION="$(tr -d '[:space:]' < "$CLAUDE_GSD_VERSION_FILE")"
    case "$CLAUDE_GSD_VERSION" in
      ''|*[!0-9A-Za-z.+-]*) die "无法安全解析 Claude Code 已安装的 GSD 版本：$CLAUDE_GSD_VERSION" ;;
    esac
    command -v npx >/dev/null 2>&1 || die "缺少必要命令：npx"
    log "正在使用官方卸载器移除 Claude Code GSD $CLAUDE_GSD_VERSION"
    npx -y "@opengsd/gsd-core@$CLAUDE_GSD_VERSION" --claude --global --uninstall
    [ ! -f "$CLAUDE_GSD_VERSION_FILE" ] || die "Claude Code GSD 卸载验证失败：VERSION 仍存在"
  else
    log "Claude Code GSD runtime 未安装，无需卸载"
  fi
else
  log "已保留 Claude Code GSD"
fi

if [ "$RUNTIME" = "codex" ] && { [ "$RESET_SURFACE" -eq 1 ] || [ "$KEEP_GSD" -eq 0 ]; }; then
  SURFACE_FILE="$GSD_HOME/.gsd-surface.json"
  if [ -e "$SURFACE_FILE" ] || [ -L "$SURFACE_FILE" ]; then
    backup_move "$SURFACE_FILE" "gsd-surface.json"
  else
    log "没有 GSD surface 状态，无需重置"
  fi
fi

log "卸载完成"
if [ -d "$BACKUP_DIR" ]; then
  log "可恢复备份位于：$BACKUP_DIR"
fi
log "源码仓库和默认项目数据未被删除"
