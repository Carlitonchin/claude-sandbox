#!/bin/bash
set -e

# Ensure Claude Code is in PATH
export PATH="$HOME/.local/bin:$PATH"

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
