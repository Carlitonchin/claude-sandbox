#!/bin/bash
set -e

# Set environment for claude user
export PATH="/home/claude/.local/bin:$PATH"
export HOME="/home/claude"

# Source sandbox environment if it exists (from pre-commands)
if [ -f "/home/claude/.sandbox-env" ]; then
    echo "[ENTRYPOINT] Loading sandbox environment..."
    set -a  # Automatically export all variables
    source /home/claude/.sandbox-env
    set +a
    echo "[ENTRYPOINT] Sandbox environment loaded"
fi

# Ensure shell configuration files source the sandbox env
# This makes the environment available in all shell types
BASHRC="/home/claude/.bashrc"
PROFILE="/home/claude/.profile"
SANDBOX_ENV_LINE='test -f "$HOME/.sandbox-env" && source "$HOME/.sandbox-env"'

# Create .bashrc if it doesn't exist
if [ ! -f "$BASHRC" ]; then
    touch "$BASHRC"
fi

# Add sourcing of sandbox env to .bashrc if not already present
if ! grep -q ".sandbox-env" "$BASHRC" 2>/dev/null; then
    echo "" >> "$BASHRC"
    echo "# Source claude-sandbox environment" >> "$BASHRC"
    echo "$SANDBOX_ENV_LINE" >> "$BASHRC"
    echo "[ENTRYPOINT] Added sandbox env sourcing to ~/.bashrc"
fi

# Create .profile if it doesn't exist
if [ ! -f "$PROFILE" ]; then
    touch "$PROFILE"
fi

# Add sourcing of sandbox env to .profile if not already present
if ! grep -q ".sandbox-env" "$PROFILE" 2>/dev/null; then
    echo "" >> "$PROFILE"
    echo "# Source claude-sandbox environment" >> "$PROFILE"
    echo "$SANDBOX_ENV_LINE" >> "$PROFILE"
    echo "[ENTRYPOINT] Added sandbox env sourcing to ~/.profile"
fi

# Display welcome message
echo "=========================================="
echo "  Claude Code Sandbox Environment"
echo "=========================================="
echo "Project: $(basename $WORKSPACE_PATH)"
echo "Claude: $(claude --version 2>/dev/null || echo 'Not installed')"
echo "=========================================="
echo ""

# Execute pre-configuration commands if INIT_SCRIPT is set
if [ -n "$INIT_SCRIPT" ]; then
    echo "[ENTRYPOINT] Starting pre-configuration commands..."
    if [ -f "$INIT_SCRIPT" ]; then
        echo "[ENTRYPOINT] Executing init script: $INIT_SCRIPT"
        bash "$INIT_SCRIPT"
        echo "[ENTRYPOINT] All pre-configuration commands completed successfully"
        # Create completion marker file
        touch /home/claude/.init-complete
        echo "[ENTRYPOINT] Created completion marker"
        echo ""
    else
        echo "[ENTRYPOINT] Warning: INIT_SCRIPT set but file not found: $INIT_SCRIPT"
    fi
else
    echo "[ENTRYPOINT] No pre-configuration commands to run"
    # Create completion marker for cases with no init script
    touch /home/claude/.init-complete
    echo ""
fi

# Execute the requested command (container already runs as claude user)
exec "$@"
