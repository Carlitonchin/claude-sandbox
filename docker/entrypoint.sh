#!/bin/bash
set -e

# Ensure Claude Code is in PATH
export PATH="$HOME/.local/bin:$PATH"

# Verify Claude Code installation
if ! command -v claude &> /dev/null; then
    echo "Claude Code not found. Installing..."
    curl -fsSL https://claude.ai/install.sh | bash
fi

# Display welcome message
echo "=========================================="
echo "  Claude Code Sandbox Environment"
echo "=========================================="
echo "Project: $(basename $WORKSPACE_PATH)"
echo "Claude: $(claude --version 2>/dev/null || echo 'Not installed')"
echo "=========================================="
echo ""

# Execute the requested command
exec "$@"
