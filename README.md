# claude-sandbox

A CLI tool that creates isolated Docker containers with Claude Code pre-installed and configured. Perfect for safe experimentation without affecting your host environment or main git branch.

## Why use claude-sandbox?

- **Safe Experimentation**: Work in isolated Docker containers with git worktrees—your main branch stays clean
- **Parallel Sessions**: Run multiple sandboxes simultaneously without worrying about Claude Code permissions prompts
- **Worktree Preservation**: Worktrees persist after exit for review, testing, and merging into your main branch
- **Configuration Sync**: Automatically syncs all your Claude Code settings from `~/.claude/` into the container
- **Pre-configured Environment**: Run project-specific setup commands automatically via `.claude-sandbox/settings.json`
- **Auto-commit**: Changes are automatically committed with AI-generated messages when you exit
- **Zero Configuration**: Works out of the box if you have Claude Code installed

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd claude-sandbox
bun install
bun run build

# Run in interactive mode (prompts for missing options)
bun run dev
```

## Global Installation

To run `claude-sandbox` from any directory on your system:

```bash
# From the project directory, link globally
bun run build
bun link

# Now you can run from anywhere
claude-sandbox
```
```

## Usage

### Interactive Mode (Recommended)

```bash
bun run dev
```

You'll be prompted for:
- **Project path** (default: current directory)
- **Container name** (default: auto-generated with timestamp)
- **Create git worktree?** (default: yes)
- **Custom worktree path** (optional)
- **Keep container after exit?** (default: no)

### Command Line Options

```bash
# After global installation
claude-sandbox [project-path] [options]

# Or from the project directory
bun run dev [project-path] [options]
```

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Custom container name |
| `-w, --worktree-path <path>` | Custom worktree location |
| `--no-worktree` | Skip git worktree creation (mounts project directly) |
| `--preserve-container` | Keep container running after exit |
| `-v, --verbose` | Enable debug output |

### Examples

```bash
# Current directory with prompts
claude-sandbox

# Specific project with custom name
claude-sandbox ./my-project --name experiment-1

# Skip worktree (useful for read-only exploration)
claude-sandbox . --no-worktree

# Keep container for inspection after exit
claude-sandbox . --preserve-container

# Verbose mode
claude-sandbox . -v
```

## How It Works

```
Host Machine                              Docker Container
─────────────                            ─────────────────
┌─────────────────┐                      ┌──────────────────────┐
│  ~/project/     │                      │  /workspace/         │
│  └── main branch│───worktree create───▶│  └── isolated branch │
└─────────────────┘                      └──────────────────────┘
       │                                         │
       │  ~/project-sandbox-1234567890/          │
       │  └── persists after exit                │
       ▼                                         │
┌─────────────────┐                             │
│  ~/.claude/     │───copy─────────────────────▶│  ~/.claude/       │
│  settings.json  │                             │  settings.json    │
└─────────────────┘                             └───────────────────┘
```

**Workflow:**
1. Create worktree → Container mounts it → Work inside → Auto-commit on exit → **Worktree stays for merge**

1. **Validation**: Checks Docker, Git, and Claude Code installation
2. **Worktree Creation**: Creates an isolated git worktree with a unique branch (`branch-<name-timestamp>`)
3. **Config Collection**: Copies all Claude Code configs from `~/.claude/` and extracts environment variables from `settings.json`
4. **Container Build**: Builds a Debian image with Claude Code (cached, only rebuilds when entrypoint changes)
5. **Pre-commands**: Runs project-specific setup commands from `.claude-sandbox/settings.json` if present
6. **Session Start**: Attaches your terminal to the container
7. **Auto-commit**: On exit, commits changes with AI-generated message
8. **Container Cleanup**: Removes the container (unless `--preserve-container` is set)
9. **Worktree Preservation**: The worktree and branch are kept for review, testing, and merging

## Pre-configuration Commands

You can define project-specific setup commands that run automatically when the container starts. Create a `.claude-sandbox/settings.json` file in your project:

```json
{
  "commands": [
    "curl -fsSL https://bun.sh/install | bash",
    "export BUN_INSTALL=\"$HOME/.bun\"",
    "export PATH=\"$BUN_INSTALL/bin:$PATH\"",
    "source ~/.bashrc"
  ]
}
```

**How it works:**
- Commands are written to a temporary script inside the container
- The script runs on every container start via the entrypoint
- Environment variables set via `export` are sourced into shell sessions
- A completion marker (`.init-complete`) is created after successful execution

## Inside the Sandbox

The container runs as the `claude` user (UID 1000) with sudo privileges:

```bash
# Start Claude Code
claude

# Check your files
ls -la /workspace

# Git operations work normally
git status
git log
git branch  # Shows the isolated worktree branch
```

**Available tools:**
- `git`, `vim`, `curl`, `node`, `npm`, `python3`, `pip`
- Build tools: `build-essential`
- Claude Code pre-installed

## Configuration Sync

The tool syncs three types of configurations:

| Source | Destination | Description |
|--------|-------------|-------------|
| `~/.claude/*` | `/home/claude/.claude/` | All Claude Code config files (recursively) |
| `~/.claude.json` | `/home/claude/.claude.json` | Global Claude settings |
| `settings.json` → `env` | Container environment | Environment variables extracted from settings |

**Environment variables**: Any keys under the `env` object in your Claude `settings.json` are passed to the container and made available in all shell sessions.

## Requirements

- **Docker** (running daemon)
- **Git** (for worktree support)
- **Claude Code** installed on host (configs are copied to container)
- **Bun** (runtime for this CLI tool)

### Installing Claude Code

If you don't have Claude Code installed:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

## Architecture

```
src/
├── index.ts              # CLI entry point (Commander.js)
├── cli.ts                # Main orchestration: validation, workflow, cleanup
├── docker/
│   └── container-manager.ts  # Docker operations: build, create, attach
├── config/
│   ├── claude-config.ts       # Collects ~/.claude/ configs
│   ├── sandbox-config.ts      # Loads .claude-sandbox/settings.json
│   └── paths.ts               # Centralized path constants
├── git/
│   └── worktree-manager.ts    # Git worktree creation, commit, cleanup
└── utils/
    ├── logger.ts              # Colored console output
    ├── prompts.ts             # Interactive prompts (Inquirer)
    └── claude-commit.ts       # AI-powered commit messages

docker/
├── Dockerfile              # Debian image with Claude Code
└── entrypoint.sh           # Sources env vars, runs pre-commands
```

## Workflow Diagram

```
┌─────────────┐
│   Run CLI   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Validate env    │──▶ Docker running?
│ (Docker, Git,   │──▶ Claude installed?
│  Claude Code)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create worktree │──▶ Skip if --no-worktree
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Collect configs │──▶ ~/.claude/* → container
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Build/create    │──▶ Cached image rebuild
│ container       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Attach terminal │
└────────┬────────┘
         │
         ▼ (user exits)
┌─────────────────┐
│ Auto-commit     │──▶ AI-generated message
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cleanup         │──▶ Remove container only
└─────────────────┘     (worktree & branch preserved for merge)
```

## Reattaching to a Container

If you used `--preserve-container`, you can reattach later:

```bash
# List running containers
docker ps

# Reattach to the container
docker exec -it <container-name> bash

# Or start a stopped container
docker start <container-name>
docker exec -it <container-name> bash
```

## License

MIT