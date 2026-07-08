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
echo "    1) Default       - GLM 5.2 main + Grok Composer sidekick + Grok 4.3 vision"
echo "    2) GPT-5.5+Mini  - GPT-5.5 main + GPT-5.4 mini sidekick"
echo "    3) Free          - Big Pickle main + MiMo sidekick + DeepSeek explore (all free on Zen)"
echo "    4) Trial         - Kiro Opus 4.8 main + Kiro Sonnet 5 sidekick + Grok explore (needs Kiro + SuperGrok trials)"
echo ""
read -rp "  Select 1-4 [1]: " choice
choice="${choice:-1}"

case "$choice" in
  1) preset="default" ;;
  2) preset="gpt55-mini" ;;
  3) preset="free" ;;
  4) preset="trial" ;;
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

# --- copy agents to project (for project-level opencode.json) ---
PROJECT_AGENT_DIR="$REPO_ROOT/agent"
mkdir -p "$PROJECT_AGENT_DIR"
for f in build.md sidekick.md vision.md; do
  if [ -f "$REPO_ROOT/agents/$f" ]; then
    cp "$REPO_ROOT/agents/$f" "$PROJECT_AGENT_DIR/$f"
  fi
done
echo "  Project agents:  $PROJECT_AGENT_DIR"

# --- next steps ---

echo ""
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Restart opencode"

# Tell user which providers to connect
case "$preset" in
  gpt55-mini)
    echo "    2. Run /connect and connect: openai"
    ;;
  free)
    echo "    2. Run /connect and connect: opencode (Zen) - for free DeepSeek sidekick"
    ;;
esac

# Tell user if progrok is needed
case "$preset" in
  default)
    echo "    3. Make sure progrok proxy is running at http://127.0.0.1:18645/v1"
    ;;
  trial)
    echo "    2. Make sure the Kiro gateway is running at http://127.0.0.1:9000/v1"
    echo "    3. Make sure progrok proxy is running at http://127.0.0.1:18645/v1"
    ;;
esac

echo ""
echo "  Change models later: edit $CONFIG_PATH"
echo ""