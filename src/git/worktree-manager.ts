import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';

export class GitWorktreeManager {
  constructor(private projectPath: string) {}

  async create(customPath?: string): Promise<string> {
    // Verify project is a git repository
    if (!await this.isGitRepository()) {
      throw new Error('Project is not a git repository');
    }

    // Determine worktree location
    const worktreeBase = customPath || path.join(
      path.dirname(this.projectPath),
      `${path.basename(this.projectPath)}-sandbox`
    );
    const timestamp = Date.now();
    const worktreePath = `${worktreeBase}-${timestamp}`;

    // Get current branch
    const currentBranch = this.getCurrentBranch();

    // Create worktree
    logger.info(`Creating git worktree at ${worktreePath}`);
    try {
      execSync(`git worktree add ${worktreePath} ${currentBranch}`, {
        cwd: this.projectPath,
        stdio: 'inherit'
      });
      logger.success(`Created worktree at ${worktreePath}`);
    } catch (error) {
      throw new Error(`Failed to create git worktree: ${(error as Error).message}`);
    }

    return worktreePath;
  }

  async commitChanges(worktreePath: string): Promise<void> {
    logger.info('Committing changes in worktree...');

    try {
      // Check if there are any changes
      const status = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8'
      }).trim();

      if (!status) {
        logger.info('No changes to commit');
        return;
      }

      // Stage all changes
      execSync('git add -A', {
        cwd: worktreePath,
        stdio: 'inherit'
      });

      // Commit with automatic message
      const timestamp = new Date().toISOString();
      const commitMessage = `claude-sandbox: automatic commit [${timestamp}]`;
      execSync(`git commit -m "${commitMessage}"`, {
        cwd: worktreePath,
        stdio: 'inherit'
      });

      logger.success(`Committed changes: ${commitMessage}`);
    } catch (error) {
      throw new Error(`Failed to commit changes: ${(error as Error).message}`);
    }
  }

  async cleanup(worktreePath: string): Promise<void> {
    try {
      execSync(`git worktree remove ${worktreePath}`, {
        cwd: this.projectPath,
        stdio: 'inherit'
      });
      logger.info(`Cleaned up worktree at ${worktreePath}`);
    } catch (error) {
      logger.warn(`Failed to cleanup worktree: ${(error as Error).message}`);
    }
  }

  private async isGitRepository(): Promise<boolean> {
    const gitDir = path.join(this.projectPath, '.git');
    return await fs.pathExists(gitDir);
  }

  private getCurrentBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectPath,
        encoding: 'utf-8'
      }).trim();
    } catch (error) {
      throw new Error(`Failed to determine current branch: ${(error as Error).message}`);
    }
  }
}
