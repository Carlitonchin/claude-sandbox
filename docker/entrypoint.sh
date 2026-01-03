#!/bin/bash
set -e

# Set environment for claude user
export PATH="/home/claude/.local/bin:$PATH"
export HOME="/home/claude"

# Display welcome message
echo "=========================================="
echo "  Claude Code Sandbox Environment"
echo "=========================================="
echo "Project: $(basename $WORKSPACE_PATH)"
echo "Claude: $(claude --version 2>/dev/null || echo 'Not installed')"
echo "=========================================="
echo ""

# Execute the requested command (container already runs as claude user)
exec "$@"
