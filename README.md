# claude-sandbox

Create isolated Docker sandboxes with Claude Code installed and configured.

## Features

- **Isolated Environment**: Debian Linux container with Claude Code
- **Configuration Sync**: Automatically copies all Claude Code configurations from your host
- **Git Worktree Support**: Creates isolated worktrees for safe experimentation
- **Auto-commit**: Automatically commits changes when exiting the sandbox
- **Interactive Mode**: Prompts for missing options when run from a terminal

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd sandbox-ai

# Install dependencies
bun install

# Build the project
bun run build
```

## Usage

### Interactive Mode (Recommended)

When run from a terminal without options, `claude-sandbox` will prompt you for the required values:

```bash
bun run src/index.ts
```

You'll be asked for:
- Project path (default: current directory)
- Container name (default: auto-generated)
- Whether to create a git worktree (default: yes)
- Custom worktree path (optional)
- Whether to keep the container after exit (default: no)

### Command Line Options

```bash
bun run src/index.ts [project-path] [options]
```

**Options:**
- `-n, --name <name>` - Container name
- `-w, --worktree-path <path>` - Custom worktree location
- `--no-worktree` - Skip git worktree creation
- `--preserve-container` - Keep container after exit
- `-v, --verbose` - Verbose output (shows debug logs)

### Examples

```bash
# Use current directory (will prompt for missing options)
bun run src/index.ts

# Specify project path
bun run src/index.ts ./my-project

# Skip git worktree
bun run src/index.ts . --no-worktree

# Custom container name
bun run src/index.ts . --name my-sandbox

# Keep container for later inspection
bun run src/index.ts . --preserve-container

# Verbose mode (shows debug logs, still prompts for missing options)
bun run src/index.ts . -v
```

## How It Works

1. **Environment Validation**: Checks Docker, Git, and Claude Code installation
2. **Git Worktree**: Creates an isolated worktree for your changes
3. **Config Collection**: Copies all Claude Code configs from `~/.claude/`
4. **Container Creation**: Starts a Debian container with your project mounted
5. **Claude Installation**: Installs Claude Code inside the container
6. **Interactive Session**: Attaches your terminal to the container
7. **Auto-commit**: Commits changes when you exit
8. **Cleanup**: Removes the container (unless `--preserve-container` is used)

## Inside the Sandbox

Once inside the container, you can:

```bash
# Run Claude Code
claude

# Check your files
ls -la /workspace

# Git operations work normally
git status
git log
```

## Manually Attaching to a Container

If you used `--preserve-container` or want to reattach:

```bash
docker exec -it <container-name> bash
```

## Requirements

- Docker (running)
- Git
- Claude Code installed on host
- Bun (for running this tool)

## Project Structure

```
sandbox-ai/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── cli.ts                # Main orchestration logic
│   ├── docker/
│   │   └── container-manager.ts
│   ├── config/
│   │   ├── claude-config.ts
│   │   └── paths.ts
│   ├── git/
│   │   └── worktree-manager.ts
│   └── utils/
│       ├── logger.ts
│       └── prompts.ts
├── docker/
│   ├── Dockerfile
│   └── entrypoint.sh
└── templates/
    └── entrypoint.sh
```

## License

MIT
