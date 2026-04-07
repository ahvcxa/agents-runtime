#!/usr/bin/env bash
# =============================================================================
# setup-agents.sh — .agents/ Configuration Installer
# =============================================================================
#
# Usage:
#   bash setup-agents.sh                  → Install into current directory
#   bash setup-agents.sh /path/to/project → Install into target project
#   bash setup-agents.sh /path --force    → Overwrite existing files
#   bash setup-agents.sh --agent fullstack → Install with 'fullstack' agent config
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
AGENT_TEMPLATE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --force|-f)
      FORCE=true
      shift
      ;;
    --help|-h)
      echo "Usage: bash setup-agents.sh [target-dir] [options]"
      echo ""
      echo "  target-dir    Project directory where .agents/ will be created (default: .)"
      echo "  --force, -f   Overwrite existing files"
      echo "  --agent, -a   Copy a pre-built agent template to agent.yaml (observer, executor, fullstack, orchestrator, security-only)"
      echo ""
      echo "Installs:"
      echo "  .agents/manifest.json        ← Machine-readable entry point"
      echo "  .agents/AGENT_CONTRACT.md    ← Agent behavioral contract"
      echo "  .agents/settings.json        ← Central configuration"
      echo "  .agents/hooks/               ← Security & lifecycle hooks"
      echo "  .agents/helpers/             ← Compliance check & memory client"
      echo "  .agents/skills/              ← code-analysis, security-audit, refactor"
      shift
      exit 0
      ;;
    --agent|-a)
      AGENT_TEMPLATE="$2"
      shift 2
      ;;
    *)
      TARGET_DIR="$1"
      shift
      ;;
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
if [ -n "$AGENT_TEMPLATE" ]; then
  echo -e "  ${BLUE}Agent    :${NC} $AGENT_TEMPLATE"
fi
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

copy_symlink_content() {
  local src_link="$1"
  local dest="$2"
  local rel_path="${dest#$DEST/}"

  # Resolve symlink to actual file by computing absolute path
  # For relative symlinks, must resolve from the symlink's directory
  local target
  local symlink_dir="$(dirname "$src_link")"
  local symlink_target="$(readlink "$src_link")"
  
  # If symlink target is relative, make it absolute using symlink's directory
  if [[ "$symlink_target" == /* ]]; then
    target="$symlink_target"
  else
    # Relative symlink - resolve from its directory
    # Use a subshell to handle relative paths correctly
    # Use || true to prevent set -e from breaking when symlink target doesn't exist
    target="$( (cd "$symlink_dir" && [ -e "$symlink_target" ] && echo "$(pwd)/$symlink_target") || true )"
  fi

  # Only proceed if we have a valid target that exists
  if [ -n "$target" ] && [ -f "$target" ]; then
    mkdir -p "$(dirname "$dest")"
    
    if [ -f "$dest" ] && [ "$FORCE" = false ]; then
      echo -e "  ${YELLOW}SKIPPED${NC}   .agents/$rel_path  (symlink, use --force to overwrite)"
      FILES_SKIPPED=$((FILES_SKIPPED + 1))
    else
      cp "$target" "$dest"
      echo -e "  ${GREEN}COPIED${NC}    .agents/$rel_path (symlink → resolved)"
      FILES_COPIED=$((FILES_COPIED + 1))
    fi
  fi
}

echo -e "${BOLD}Copying files...${NC}"
echo ""

while IFS= read -r -d '' src_file; do
  relative_path="${src_file#$TEMPLATE_DIR/}"
  # If file is in .agents/, strip the .agents/ prefix since $DEST is already .agents/
  if [[ $relative_path == .agents/* ]]; then
    relative_path="${relative_path#.agents/}"
  fi
  dest_file="$DEST/$relative_path"
  copy_file "$src_file" "$dest_file"
done < <(find "$TEMPLATE_DIR" -type f -print0)

# Handle symlinks: dereference them and copy actual content
# This ensures CI/CD environments and target projects get real files instead of symlinks
while IFS= read -r -d '' src_link; do
  relative_path="${src_link#$TEMPLATE_DIR/}"
  # If symlink is in .agents/, strip the .agents/ prefix since $DEST is already .agents/
  if [[ $relative_path == .agents/* ]]; then
    relative_path="${relative_path#.agents/}"
  fi
  dest_file="$DEST/$relative_path"
  copy_symlink_content "$src_link" "$dest_file"
done < <(find "$TEMPLATE_DIR" -type l -print0)

# Create logs/ directory
mkdir -p "$DEST/logs"
if [ ! -f "$DEST/logs/.gitkeep" ]; then
  touch "$DEST/logs/.gitkeep"
  echo -e "  ${GREEN}CREATED${NC}   .agents/logs/.gitkeep"
fi

# Copy memory-system from template/ directory
MEMORY_SYSTEM_SRC="$SCRIPT_DIR/template/memory-system"
if [ -d "$MEMORY_SYSTEM_SRC" ]; then
  echo -e "  ${BLUE}COPYING${NC}    memory-system from template/"
  cp -r "$MEMORY_SYSTEM_SRC" "$DEST/memory-system"
  echo -e "  ${GREEN}COPIED${NC}    .agents/memory-system/"
fi

# For ESM projects, create .cjs copies of all CommonJS files
# This allows them to run in projects with "type": "module" in package.json
if [ -f "$TARGET_DIR/package.json" ] && grep -q '"type":\s*"module"' "$TARGET_DIR/package.json" 2>/dev/null; then
  # Enable nullglob to handle empty glob patterns properly
  shopt -s nullglob
  
    # Copy helpers as .cjs
   for js_file in "$DEST"/helpers/*.js; do
     if [ -f "$js_file" ]; then
       cjs_file="${js_file%.js}.cjs"
       cp "$js_file" "$cjs_file"
     fi
   done
   echo -e "  ${GREEN}COPIED${NC}    .agents/helpers/*.cjs (ESM support)"
   
   # Copy hooks as .cjs
   for js_file in "$DEST"/hooks/*.js; do
     if [ -f "$js_file" ]; then
       cjs_file="${js_file%.js}.cjs"
       cp "$js_file" "$cjs_file"
     fi
   done
   echo -e "  ${GREEN}COPIED${NC}    .agents/hooks/*.cjs (ESM support)"
   
    # Copy skill handlers as .cjs
    for js_file in "$DEST"/skills/*/*.js; do
      if [ -f "$js_file" ] && [[ "$js_file" == */handler.js ]]; then
        cjs_file="${js_file%.js}.cjs"
        cp "$js_file" "$cjs_file"
      fi
    done
    echo -e "  ${GREEN}COPIED${NC}    .agents/skills/*/handler.cjs (ESM support)"
   
    # Copy skill lib files as .cjs (for nested requires in handlers)
    for js_file in "$DEST"/skills/*/lib/*.js; do
      if [ -f "$js_file" ]; then
        cjs_file="${js_file%.js}.cjs"
        cp "$js_file" "$cjs_file"
      fi
    done
    echo -e "  ${GREEN}COPIED${NC}    .agents/skills/*/lib/*.cjs (ESM support)"
    
    # Remove original .js files from lib/ to force require() to use .cjs versions
    for js_file in "$DEST"/skills/*/lib/*.js; do
      if [ -f "$js_file" ]; then
        rm "$js_file"
      fi
    done
    echo -e "  ${GREEN}REMOVED${NC}   .agents/skills/*/lib/*.js (use .cjs instead)"
    
    # Update handler.cjs files to require lib files as .cjs
    if command -v node &> /dev/null; then
      for handler_cjs in "$DEST"/skills/*/handler.cjs; do
        if [ -f "$handler_cjs" ]; then
          node "$SCRIPT_DIR/bin/fix-handler-requires.js" "$handler_cjs" 2>/dev/null || true
        fi
      done
      
      # Also update lib/*.cjs files to require sibling modules as .cjs
      for lib_cjs in "$DEST"/skills/*/lib/*.cjs; do
        if [ -f "$lib_cjs" ]; then
          node "$SCRIPT_DIR/bin/fix-handler-requires.js" "$lib_cjs" 2>/dev/null || true
        fi
      done
      
      echo -e "  ${GREEN}UPDATED${NC}    .agents/skills/**/*.cjs (requires → .cjs)"
    fi
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

if [ -n "$AGENT_TEMPLATE" ]; then
  TEMPLATE_FILE="$SCRIPT_DIR/examples/${AGENT_TEMPLATE}-agent.yaml"
  if [ -f "$TEMPLATE_FILE" ]; then
    if [ -f "$TARGET_DIR/agent.yaml" ] && [ "$FORCE" = false ]; then
      echo -e "  ${YELLOW}SKIPPED${NC}   agent.yaml (already exists, use --force to overwrite)"
    else
      cp "$TEMPLATE_FILE" "$TARGET_DIR/agent.yaml"
      echo -e "  ${GREEN}CREATED${NC}   agent.yaml (from ${AGENT_TEMPLATE} template)"
      
      # Auto-detect project structure and inject real paths
      if command -v node &> /dev/null; then
        echo -e "  ${BLUE}DETECTING${NC}  project structure..."
        node "$SCRIPT_DIR/bin/auto-configure-agent.js" "$TARGET_DIR/agent.yaml" "$TARGET_DIR" 2>/dev/null || true
      fi
    fi
  else
    echo -e "  ${RED}ERROR${NC}   Agent template '${AGENT_TEMPLATE}' not found in examples/ directory."
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
if [ -z "$AGENT_TEMPLATE" ]; then
  echo -e "  2. Create an agent config file (or re-run with --agent observer)"
else
  echo -e "  2. Review your new ${BLUE}agent.yaml${NC} configuration"
fi
echo -e "  3. Run compliance check:"
echo -e "     ${BOLD}node bin/agents.js check --config agent.yaml --project .${NC}"
echo ""
echo -e "Tip: Any agent can discover this setup via:"
echo -e "  ${BOLD}cat .agents/manifest.json${NC}  ← machine-readable entry point"
echo ""

# ─── Install Git Hooks for Memory System ──────────────────────────────────────
if command -v node &> /dev/null; then
  if [ -f "$DEST/memory-system/setup-hooks.js" ]; then
    echo -e "${BOLD}Setting up Git Hooks for Memory System...${NC}"
    
    # Call the setup-hooks.js module to install hooks
    # Note: Using proper variable expansion with ${VAR} and ANSI color codes in JavaScript
    node -e "
      const { installGitHooks } = require('${DEST}/memory-system/setup-hooks.js');
      const result = installGitHooks('${TARGET_DIR}', { verbose: true });
      
      // Define ANSI color codes in Node.js context
      const GREEN = '\\033[0;32m';
      const YELLOW = '\\033[1;33m';
      const NC = '\\033[0m';
      
      if (result.success) {
        console.log('  ' + GREEN + '✓ Git hooks installed successfully' + NC);
        console.log('  ' + GREEN + '✓ Post-commit hook: updates change-log' + NC);
        console.log('  ' + GREEN + '✓ Post-merge hook: syncs memory' + NC);
      } else {
        console.log('  ' + YELLOW + '⚠ Warning: Could not install git hooks' + NC);
        result.errors.forEach(err => console.log('    ' + err));
      }
      
      if (result.warnings.length > 0) {
        result.warnings.forEach(warn => console.log('  ' + YELLOW + '⚠ ' + warn + NC));
      }
    " 2>/dev/null || true
    
    echo ""
  fi
fi

echo -e "${BOLD}Memory System Setup:${NC}"
echo -e "  1. Build initial memory index:"
echo -e "     ${BOLD}npm run agents learn${NC}"
echo -e "  2. View memory statistics:"
echo -e "     ${BOLD}npm run agents memory:stats${NC}"
echo -e "  3. Search project memory:"
echo -e "     ${BOLD}npm run agents memory:search 'query'${NC}"
echo ""
echo -e "Hooks are now active:"
echo -e "  • ${BLUE}post-commit${NC} — Updates change-log after commits"
echo -e "  • ${BLUE}post-merge${NC} — Syncs memory after pulls/merges"
echo ""
