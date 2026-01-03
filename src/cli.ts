import path from 'path';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { DockerContainerManager } from './docker/container-manager.js';
import { ClaudeConfigManager } from './config/claude-config.js';
import { SandboxConfigManager } from './config/sandbox-config.js';
import { GitWorktreeManager } from './git/worktree-manager.js';
import { logger } from './utils/logger.js';

interface SandboxOptions {
  name: string;
  worktreePath?: string;
  worktree: boolean;
  preserveContainer: boolean;
  verbose: boolean;
}

export async function createSandbox(projectPath: string, options: SandboxOptions): Promise<void> {
  const resolvedPath = path.resolve(projectPath);

  try {
    // Step 1: Validate environment
    await validateEnvironment(resolvedPath);

    // Step 2: Create git worktree if requested
    let worktreeDir: string | undefined;
    if (options.worktree) {
      const worktreeManager = new GitWorktreeManager(resolvedPath);
      worktreeDir = await worktreeManager.create(options.worktreePath);
    }

    // Step 3: Gather Claude Code configurations
    const configManager = new ClaudeConfigManager();
    const { configs, claudeJson } = await configManager.collectAllConfigs();

    // Get environment variables from settings
    const envVars = configs['settings.json']
      ? configManager.getEnvVars(configs['settings.json'])
      : [];

    // Step 4: Create and start Docker container
    const containerManager = new DockerContainerManager();
    const container = await containerManager.createSandboxContainer({
      name: options.name,
      projectPath: worktreeDir || resolvedPath,
      configs,
      claudeJson,
      envVars,
      verbose: options.verbose
    });

    // Step 4.5: Execute pre-configuration commands from .claude-sandbox/settings.json
    const sandboxConfigManager = new SandboxConfigManager(worktreeDir || resolvedPath);
    const sandboxConfig = await sandboxConfigManager.loadConfig();

    if (sandboxConfig?.commands && sandboxConfig.commands.length > 0) {
      await containerManager.executeCommands(container.id, sandboxConfig.commands);
    }

    // Step 5: Attach interactive terminal
    await containerManager.attachTerminal(container.id);

    // Step 6: Commit changes if worktree was created
    if (worktreeDir && options.worktree) {
      const worktreeManager = new GitWorktreeManager(resolvedPath);
      await worktreeManager.commitChanges(worktreeDir);
    }

    // Step 7: Cleanup (if not preserving container)
    if (!options.preserveContainer) {
      await containerManager.stopContainer(container.id);
      await containerManager.removeContainer(container.id);
    }

    logger.success('Sandbox session completed');
  } catch (error) {
    logger.error(`Failed to create sandbox: ${(error as Error).message}`);
    process.exit(1);
  }
}

async function validateEnvironment(projectPath: string): Promise<void> {
  const errors: string[] = [];

  // Check Docker availability
  const containerManager = new DockerContainerManager();
  if (!(await containerManager.ping())) {
    errors.push('Docker is not running or not installed');
  }

  // Check Claude Code installation
  const claudeConfigPath = path.join(process.env.HOME || '', '.claude', 'settings.json');
  if (!await fs.pathExists(claudeConfigPath)) {
    errors.push('Claude Code settings not found. Please install and configure Claude Code first.');
  }

  // Check git availability
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch {
    errors.push('Git is not installed');
  }

  // Create project directory if it doesn't exist
  if (!await fs.pathExists(projectPath)) {
    logger.info(`Creating project directory: ${projectPath}`);
    await fs.ensureDir(projectPath);
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  logger.success('Environment validation passed');
}
