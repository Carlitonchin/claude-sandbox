#!/usr/bin/env bun
import { Command } from 'commander';
import { createSandbox } from './cli.js';
import { promptForMissingOptions } from './utils/prompts.js';
import { logger } from './utils/logger.js';

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

    // TODO: Fix type error - finalOptions has optional properties but SandboxOptions requires required properties
    // error TS2345: Argument of type 'PromptOptions' is not assignable to parameter of type 'SandboxOptions'.
    // Types of property 'name' are incompatible.
    // Type 'string | undefined' is not assignable to type 'string'.
    await createSandbox(resolvedProjectPath, finalOptions);
  });

program.parse();
