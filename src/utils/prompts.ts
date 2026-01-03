import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { logger } from './logger.js';

export interface PromptOptions {
  projectPath?: string;
  name?: string;
  worktreePath?: string;
  worktree?: boolean;
  preserveContainer?: boolean;
  verbose?: boolean;
}

// Default values when prompts can't be shown
function getDefaults(): PromptOptions {
  return {
    projectPath: process.cwd(),
    name: `claude-sandbox-${Date.now()}`,
    worktreePath: undefined,
    worktree: true,
    preserveContainer: false,
    verbose: false
  };
}

export async function promptForMissingOptions(options: PromptOptions): Promise<PromptOptions> {
  const answers: any = { ...options };

  // Skip prompts in verbose mode
  if (options.verbose) {
    // Apply defaults only for missing values
    return {
      projectPath: options.projectPath ?? getDefaults().projectPath,
      name: options.name ?? getDefaults().name,
      worktreePath: options.worktreePath ?? getDefaults().worktreePath,
      worktree: options.worktree ?? getDefaults().worktree,
      preserveContainer: options.preserveContainer ?? getDefaults().preserveContainer,
      verbose: true
    };
  }

  const questions: any[] = [];

  // Project path
  if (!options.projectPath) {
    questions.push({
      type: 'input',
      name: 'projectPath',
      message: 'Project path:',
      default: process.cwd(),
      validate: (input: string) => {
        const resolved = path.resolve(input);
        if (fs.pathExistsSync(resolved)) {
          return true;
        }
        return `Path does not exist: ${input}`;
      }
    });
  }

  // Container name
  if (!options.name) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Container name:',
      default: `claude-sandbox-${Date.now()}`
    });
  }

  // Worktree option
  if (options.worktree === undefined) {
    questions.push({
      type: 'confirm',
      name: 'worktree',
      message: 'Create git worktree for isolated changes?',
      default: true
    });
  }

  // Worktree path (only if worktree is enabled and not custom path provided)
  const worktreeEnabled = options.worktree === true;
  if (worktreeEnabled && !options.worktreePath) {
    questions.push({
      type: 'input',
      name: 'worktreePath',
      message: 'Custom worktree path (leave empty for auto-generated):',
      default: ''
    });
  }

  // Preserve container
  if (options.preserveContainer === undefined) {
    questions.push({
      type: 'confirm',
      name: 'preserveContainer',
      message: 'Keep container after exit?',
      default: false
    });
  }

  if (questions.length === 0) {
    // All options provided, return as-is
    return options;
  }

  try {
    logger.info('Please provide the following options:');
    const promptedAnswers = await inquirer.prompt(questions);

    // Merge answers with proper defaults
    const result: PromptOptions = {
      projectPath: promptedAnswers.projectPath || options.projectPath || getDefaults().projectPath,
      name: promptedAnswers.name || options.name || getDefaults().name,
      worktreePath: promptedAnswers.worktreePath || options.worktreePath,
      worktree: promptedAnswers.worktree !== undefined ? promptedAnswers.worktree : (options.worktree ?? getDefaults().worktree),
      preserveContainer: promptedAnswers.preserveContainer !== undefined ? promptedAnswers.preserveContainer : (options.preserveContainer ?? getDefaults().preserveContainer),
      verbose: options.verbose
    };

    return result;
  } catch (error) {
    // If prompts fail (no TTY), use defaults
    logger.warn('Could not show prompts, using default values');
    return {
      projectPath: options.projectPath || getDefaults().projectPath,
      name: options.name || getDefaults().name,
      worktreePath: options.worktreePath,
      worktree: options.worktree !== undefined ? options.worktree : getDefaults().worktree,
      preserveContainer: options.preserveContainer !== undefined ? options.preserveContainer : getDefaults().preserveContainer,
      verbose: options.verbose
    };
  }
}
