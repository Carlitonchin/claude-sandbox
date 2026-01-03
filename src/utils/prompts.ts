import inquirer from 'inquirer';
import path from 'path';
import { logger } from './logger.js';

export interface PromptOptions {
  projectPath?: string;
  name?: string;
  worktreePath?: string;
  worktree?: boolean;
  preserveContainer?: boolean;
  verbose?: boolean;
}

export async function promptForMissingOptions(options: PromptOptions): Promise<PromptOptions> {
  const answers: any = { ...options };

  // Check if we should prompt (not in verbose mode and not all options provided)
  const shouldPrompt = !options.verbose && process.stdin.isTTY;

  if (!shouldPrompt) {
    return options;
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
        const fs = require('fs-extra');
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

  // Worktree path (only if worktree is enabled)
  if ((options.worktree === true || answers.worktree === true) && !options.worktreePath) {
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

  if (questions.length > 0) {
    logger.info('Please provide the following options:');
    const promptedAnswers = await inquirer.prompt(questions);

    // Merge answers
    answers.projectPath = answers.projectPath || options.projectPath;
    answers.name = answers.name || options.name;
    answers.worktreePath = answers.worktreePath || options.worktreePath;
    if (promptedAnswers.worktree !== undefined) {
      answers.worktree = promptedAnswers.worktree;
    }
    if (promptedAnswers.preserveContainer !== undefined) {
      answers.preserveContainer = promptedAnswers.preserveContainer;
    }
  }

  return answers;
}
