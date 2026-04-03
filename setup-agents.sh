#!/usr/bin/env bash
# =============================================================================
# setup-agents.sh — .agents/ Configuration Installer
# =============================================================================
#
# Usage:
#   bash setup-agents.sh                  → Install into current directory
#   bash setup-agents.sh /path/to/project → Install into target project
#   bash setup-agents.sh /path --force    → Overwrite existing files
#
# Vendor-neutral: works with GPT, Gemini, Claude, LLaMA, or custom runtimes.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

FORCE=false
TARGET_DIR="."

for arg in "$@"; do
  case $arg in
    --force|-f) FORCE=true ;;
    --help|-h)
      echo "Usage: bash setup-agents.sh [target-dir] [--force]"
      echo ""
      echo "  target-dir    Project directory where .agents/ will be created (default: .)"
      echo "  --force, -f   Overwrite existing files"
      echo ""
      echo "Installs:"
      echo "  .agents/manifest.json        ← Machine-readable entry point"
      echo "  .agents/AGENT_CONTRACT.md    ← Agent behavioral contract"
      echo "  .agents/settings.json        ← Central configuration"
      echo "  .agents/hooks/               ← Security & lifecycle hooks"
      echo "  .agents/helpers/             ← Compliance check & memory client"
      echo "  .agents/skills/              ← code-analysis, security-audit, refactor"
      exit 0
      ;;
    *) TARGET_DIR="$arg" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Template lives at <repo-root>/template/
TEMPLATE_DIR="$SCRIPT_DIR/template"

echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   .agents/ Multi-Agent Configuration Installer       ║${NC}"
echo -e "${BOLD}║   Vendor-neutral · GPT · Gemini · Claude · Custom    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo -e "${RED}ERROR: Template directory not found: $TEMPLATE_DIR${NC}"
  echo "Make sure this script is run from the agents-runtime repo root."
  exit 1
fi

TARGET_DIR="$(realpath "$TARGET_DIR")"
DEST="$TARGET_DIR/.agents"

echo -e "  ${BLUE}Template :${NC} $TEMPLATE_DIR"
echo -e "  ${BLUE}Target   :${NC} $DEST"
echo -e "  ${BLUE}Force    :${NC} $FORCE"
echo ""

if [ ! -d "$TARGET_DIR" ]; then
  echo -e "${RED}ERROR: Target directory does not exist: $TARGET_DIR${NC}"
  exit 1
fi

FILES_COPIED=0
FILES_SKIPPED=0

copy_file() {
  local src="$1"
  local dest="$2"
  local rel_path="${dest#$DEST/}"

  mkdir -p "$(dirname "$dest")"

  if [ -f "$dest" ] && [ "$FORCE" = false ]; then
    echo -e "  ${YELLOW}SKIPPED${NC}   .agents/$rel_path  (use --force to overwrite)"
    FILES_SKIPPED=$((FILES_SKIPPED + 1))
  else
    cp "$src" "$dest"
    echo -e "  ${GREEN}COPIED${NC}    .agents/$rel_path"
    FILES_COPIED=$((FILES_COPIED + 1))
  fi
}

echo -e "${BOLD}Copying files...${NC}"
echo ""

while IFS= read -r -d '' src_file; do
  relative_path="${src_file#$TEMPLATE_DIR/}"
  dest_file="$DEST/$relative_path"
  copy_file "$src_file" "$dest_file"
done < <(find "$TEMPLATE_DIR" -type f -print0)

# Create logs/ directory
mkdir -p "$DEST/logs"
if [ ! -f "$DEST/logs/.gitkeep" ]; then
  touch "$DEST/logs/.gitkeep"
  echo -e "  ${GREEN}CREATED${NC}   .agents/logs/.gitkeep"
fi

# Update .gitignore
if [ -f "$TARGET_DIR/.gitignore" ]; then
  if ! grep -q ".agents/logs" "$TARGET_DIR/.gitignore" 2>/dev/null; then
    echo "" >> "$TARGET_DIR/.gitignore"
    echo "# Agent logs & memory store" >> "$TARGET_DIR/.gitignore"
    echo ".agents/logs/" >> "$TARGET_DIR/.gitignore"
    echo ".agents/.memory-store" >> "$TARGET_DIR/.gitignore"
    echo -e "  ${GREEN}UPDATED${NC}   .gitignore (added .agents/logs/)"
  fi
fi

echo ""
echo -e "${BOLD}─────────────────────────────────────────────────────${NC}"
echo -e "  ${GREEN}✓ Copied   :${NC} $FILES_COPIED file(s)"
if [ "$FILES_SKIPPED" -gt 0 ]; then
  echo -e "  ${YELLOW}⊘ Skipped  :${NC} $FILES_SKIPPED file(s)  (use --force to overwrite)"
fi
echo ""
echo -e "${BOLD}Installation complete!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Edit ${BLUE}.agents/settings.json${NC} for your project"
echo -e "  2. Create an agent config file (see ${BLUE}examples/observer-agent.yaml${NC})"
echo -e "  3. Run compliance check:"
echo -e "     ${BOLD}node bin/agents.js check --config agent.yaml --project .${NC}"
echo ""
echo -e "Tip: Any agent can discover this setup via:"
echo -e "  ${BOLD}cat .agents/manifest.json${NC}  ← machine-readable entry point"
echo ""
