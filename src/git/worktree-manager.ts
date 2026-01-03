import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { generateCommitMessage } from '../utils/claude-commit.js';

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

    // Resolve to absolute path (required for Docker volumes)
    const absoluteWorktreePath = path.resolve(worktreePath);

    // Extract the final directory name for the branch
    const dirName = path.basename(absoluteWorktreePath);

    // Create a unique branch name using the directory name
    const sandboxBranch = `branch-${dirName}`;

    // Create worktree with a new branch
    logger.info(`Creating git worktree at ${absoluteWorktreePath}`);
    try {
      // Create worktree with a new branch based on current HEAD
      execSync(`git worktree add -b ${sandboxBranch} ${absoluteWorktreePath} HEAD`, {
        cwd: this.projectPath,
        stdio: 'inherit'
      });
      logger.success(`Created worktree at ${absoluteWorktreePath} (branch: ${sandboxBranch})`);
    } catch (error) {
      throw new Error(`Failed to create git worktree: ${(error as Error).message}`);
    }

    return absoluteWorktreePath;
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

      // Let Claude handle git add, git commit, and message generation
      const { success, message: commitMessage, fallbackUsed } = await generateCommitMessage({
        worktreePath,
        timeout: 30000
      });

      if (success) {
        // Claude successfully created the commit
        logger.success(`Committed changes: ${commitMessage.split('\n')[0]}`);
      } else {
        // Fallback: use traditional method with timestamp message
        logger.debug('Using fallback commit method');

        execSync('git add -A', {
          cwd: worktreePath,
          stdio: 'inherit'
        });

        execSync(`git commit -m "${commitMessage}"`, {
          cwd: worktreePath,
          stdio: 'pipe'
        });

        logger.success(`Committed changes: ${commitMessage}`);
      }
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
