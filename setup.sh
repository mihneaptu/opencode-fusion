#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.config/opencode"
CONFIG_PATH="$CONFIG_DIR/opencode.json"
AGENT_DIR="$CONFIG_DIR/agent"

echo ""
echo "  opencode-fusion setup"
echo "  ========================"
echo ""

echo "  Choose a configuration:"
echo "    1) Default      - GLM 5.2 main + Grok Composer sidekick + Grok 4.3 vision"
echo "    2) Opus + GLM   - Claude Opus main + GLM 5.2 sidekick"
echo "    3) Sonnet + C.  - Claude Sonnet main + Grok Composer sidekick"
echo ""
read -rp "  Select 1-3 [1]: " choice
choice="${choice:-1}"

case "$choice" in
  1) preset="default" ;;
  2) preset="opus-glm" ;;
  3) preset="sonnet-composer" ;;
  *) echo "  Invalid choice. Please run again."; exit 1 ;;
esac

# --- write config ---

mkdir -p "$CONFIG_DIR" "$AGENT_DIR"

if [ -f "$CONFIG_PATH" ]; then
  bak="$CONFIG_PATH.backup.$(date +%Y%m%d-%H%M%S)"
  cp "$CONFIG_PATH" "$bak"
  echo "  Backed up existing config to: $bak"
fi

cp "$REPO_ROOT/configs/$preset.json" "$CONFIG_PATH"
echo "  Config written:  $CONFIG_PATH (preset: $preset)"

# --- copy agents ---

for f in build.md sidekick.md vision.md; do
  if [ -f "$REPO_ROOT/agents/$f" ]; then
    cp "$REPO_ROOT/agents/$f" "$AGENT_DIR/$f"
  fi
done
echo "  Agents copied:   $AGENT_DIR"

# --- next steps ---

echo ""
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Restart opencode"

if [ "$preset" != "default" ] && [ "$preset" != "opus-glm" ]; then
  echo "    2. Run /connect and connect: anthropic"
fi

if [ "$preset" != "opus-glm" ]; then
  echo "    3. Make sure progrok proxy is running at http://127.0.0.1:18645/v1"
fi

if [ "$preset" = "opus-glm" ]; then
  echo "    2. Run /connect and connect: anthropic"
fi

echo ""
echo "  Change models later: edit $CONFIG_PATH"
echo ""