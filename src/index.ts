#!/usr/bin/env bun
import { Command } from 'commander';
import { createSandbox } from './cli.js';
import { promptForMissingOptions } from './utils/prompts.js';

const program = new Command();

program
  .name('claude-sandbox')
  .description('Create an isolated Docker sandbox with Claude Code')
  .version('1.0.0')
  .argument('[project-path]', 'Path to project directory')
  .option('-n, --name <name>', 'Container name')
  .option('-w, --worktree-path <path>', 'Custom worktree location')
  .option('--no-worktree', 'Skip git worktree creation')
  .option('--preserve-container', 'Keep container after exit')
  .option('-v, --verbose', 'Verbose output (skips interactive prompts)')
  .action(async (projectPath: string | undefined, options) => {
    if (options.verbose) {
      process.env.DEBUG = '1';
    }

    // Prompt for missing options (unless in verbose mode)
    const finalOptions = await promptForMissingOptions({
      projectPath,
      name: options.name,
      worktreePath: options.worktreePath,
      worktree: options.worktree,
      preserveContainer: options.preserveContainer,
      verbose: options.verbose
    });

    // Use resolved project path or default to cwd
    const resolvedProjectPath = finalOptions.projectPath || process.cwd();

    await createSandbox(resolvedProjectPath, {
      name: finalOptions.name || 'claude-sandbox',
      worktreePath: finalOptions.worktreePath,
      worktree: finalOptions.worktree || true,
      preserveContainer: finalOptions.preserveContainer || false,
      verbose: finalOptions.verbose || false
    });
  });

program.parse();
