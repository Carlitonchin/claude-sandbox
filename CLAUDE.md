# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`claude-sandbox` is a CLI tool that creates isolated Docker containers with Claude Code pre-installed and configured. It enables safe experimentation by creating Git worktrees and synchronizing all Claude Code configurations from the host machine into the sandbox.

## Common Commands

```bash
# Run the CLI in development mode (interactive prompts)
bun run dev

# Build the project
bun run build

# Run tests
bun test

# Install dependencies
bun install
```

## Usage

```bash
# Interactive mode (prompts for missing options)
bun run dev

# With options
bun run dev <project-path> [options]
```

**Options:**
- `-n, --name <name>` - Container name
- `-w, --worktree-path <path>` - Custom worktree location
- `--no-worktree` - Skip git worktree creation
- `--preserve-container` - Keep container after exit
- `-v, --verbose` - Verbose output

## Architecture

The application follows a layered orchestration pattern:

1. **Entry Point** (`src/index.ts`): Uses Commander.js for CLI parsing and interactive prompting via Inquirer. Handles option defaults and delegates to `createSandbox()`.

2. **Orchestrator** (`src/cli.ts`): The `createSandbox()` function manages the entire workflow:
   - Environment validation (Docker, Git, Claude Code)
   - Git worktree creation
   - Claude config collection
   - Docker container creation and attachment
   - Auto-commit on exit
   - Container cleanup

3. **Docker Management** (`src/docker/container-manager.ts`): Wraps Dockerode for:
   - Building images from `docker/Dockerfile`
   - Creating containers with volume mounts
   - Copying configurations into containers
   - Terminal attachment with stdin/stdout passthrough

4. **Config Collection** (`src/config/`):
   - `claude-config.ts`: Recursively collects all files from `~/.claude/` and `~/.claude.json`, extracts environment variables from `settings.json`.
   - `sandbox-config.ts`: Loads project-specific pre-commands from `.claude-sandbox/settings.json`.
   - `paths.ts`: Centralized path constants.

5. **Git Worktree** (`src/git/worktree-manager.ts`): Creates isolated worktrees with unique branch names, handles auto-commit on exit.

6. **Utilities** (`src/utils/`):
   - `logger.ts`: Colored logging with Chalk.
   - `prompts.ts`: Inquirer-based interactive prompts with TTY detection.
   - `claude-commit.ts`: Intelligent commit message generation using Claude Code.

## Docker Container Layout

The container (`docker/Dockerfile`) is based on Debian Bookworm with:
- Non-root user `claude` (UID 1000) with sudo privileges
- Claude Code installed via official installer script
- Workspace mounted at `/workspace`
- Configs copied to `/home/claude/.claude/`
- Entrypoint script (`docker/entrypoint.sh`) sources environment variables and executes pre-commands

## Important Patterns

- **File extensions in imports**: All imports use `.js` extensions (TypeScript compiles to ESM)
- **Async/await**: All I/O operations use promises via `fs-extra`
- **Error handling**: Validation throws with descriptive messages; top-level catch in `createSandbox()` exits with code 1
- **Interactive fallback**: When TTY is unavailable, prompts fall back to defaults
- **Container naming**: Names use `sandbox-` prefix with timestamp when not specified
- **Worktree branches**: Format `branch-<timestamp>` for uniqueness
- **Image rebuild caching**: Container manager tracks entrypoint checksum to rebuild images only when needed

## Configuration Sync

The tool synchronizes three types of configurations:
1. **Host Claude Config**: All files from `~/.claude/` recursively copied to container
2. **Global Config**: `~/.claude.json` mounted separately
3. **Project Config**: Pre-commands from `.claude-sandbox/settings.json` (optional)

Environment variables are extracted from `settings.json` under the `env` key and passed to the container. The entrypoint script sources these from `/etc/sandbox-environment` to make them available in all shell sessions.
