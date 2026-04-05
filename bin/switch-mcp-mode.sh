#!/usr/bin/env bash
set -euo pipefail

# switch-mcp-mode.sh
# Quickly switch Claude Desktop MCP config between safe/full/off.

MODE="${1:-}"
TARGET_CONFIG="${HOME}/.config/Claude/claude_desktop_config.json"
SAFE_TEMPLATE="$(dirname "$0")/../docs/examples/claude_desktop_config.safe.json"
FULL_TEMPLATE="$(dirname "$0")/../docs/examples/claude_desktop_config.full.json"
OFF_TEMPLATE="$(dirname "$0")/../docs/examples/claude_desktop_config.off.json"

if [[ -z "${MODE}" ]]; then
  echo "Usage: $0 <off|safe|full>"
  exit 1
fi

mkdir -p "$(dirname "${TARGET_CONFIG}")"

if [[ -f "${TARGET_CONFIG}" ]]; then
  cp "${TARGET_CONFIG}" "${TARGET_CONFIG}.bak"
fi

case "${MODE}" in
  safe)
    cp "${SAFE_TEMPLATE}" "${TARGET_CONFIG}"
    ;;
  full)
    cp "${FULL_TEMPLATE}" "${TARGET_CONFIG}"
    ;;
  off)
    cp "${OFF_TEMPLATE}" "${TARGET_CONFIG}"
    ;;
  *)
    echo "Invalid mode: ${MODE}. Use off|safe|full"
    exit 1
    ;;
esac

echo "✅ Updated Claude MCP config: ${TARGET_CONFIG}"
echo "🔁 Restart Claude Desktop to apply changes."
