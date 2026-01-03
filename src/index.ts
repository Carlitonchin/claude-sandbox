#!/usr/bin/env bun
import { Command } from 'commander';
import { createSandbox } from './cli.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('claude-sandbox')
  .description('Create an isolated Docker sandbox with Claude Code')
  .version('1.0.0')
  .argument('[project-path]', 'Path to project directory', process.cwd())
  .option('-n, --name <name>', 'Container name', `claude-sandbox-${Date.now()}`)
  .option('-w, --worktree-path <path>', 'Custom worktree location')
  .option('--no-worktree', 'Skip git worktree creation')
  .option('--preserve-container', 'Keep container after exit')
  .option('-v, --verbose', 'Verbose output')
  .action(async (projectPath: string, options) => {
    if (options.verbose) {
      process.env.DEBUG = '1';
    }
    await createSandbox(projectPath, options);
  });

program.parse();
