import Docker from 'dockerode';
import path from 'path';
import fs from 'fs-extra';
import tar from 'tar-fs';
import { logger } from '../utils/logger.js';

interface SandboxConfig {
  name: string;
  projectPath: string;
  configs: Record<string, Buffer>;
  claudeJson?: Buffer;
  envVars?: string[];
  verbose?: boolean;
  preCommands?: string[];
}

export class DockerContainerManager {
  private docker: Docker;
  private currentEnvPath?: string;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async createSandboxContainer(config: SandboxConfig): Promise<Docker.Container> {
    logger.info(`Creating Docker container with name: ${config.name}...`);

    // Step 1: Build or get the base image
    const imageName = 'claude-sandbox:latest';
    await this.buildBaseImage(imageName);

    // Step 2: Create temp directory for configs
    const tempConfigDir = path.join('/tmp', `claude-sandbox-${config.name}-config`);
    await fs.ensureDir(tempConfigDir);

    // Copy configs to temp directory
    for (const [relativePath, content] of Object.entries(config.configs)) {
      const targetPath = path.join(tempConfigDir, relativePath);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, content);
    }

    // Step 2.5: Create temp file for ~/.claude.json if it exists
    const binds: string[] = [
      `${config.projectPath}:/workspace:rw`,
      `${tempConfigDir}:/home/claude/.claude:rw`,
    ];

    let claudeJsonTempPath: string | undefined;
    if (config.claudeJson) {
      claudeJsonTempPath = path.join('/tmp', `claude-sandbox-${config.name}-claude.json`);
      await fs.writeFile(claudeJsonTempPath, config.claudeJson);
      // Mount to /home/claude/.claude.json (not inside /home/claude/.claude/)
      binds.push(`${claudeJsonTempPath}:/home/claude/.claude.json:rw`);
    }

    // Step 2.6: Create init script for pre-commands if they exist
    let initScriptPath: string | undefined;
    const envVars: string[] = [
      'WORKSPACE_PATH=/workspace',
      'CLAUDE_CONFIG_PATH=/home/claude/.claude',
      ...(config.envVars || [])
    ];

    if (config.preCommands && config.preCommands.length > 0) {
      initScriptPath = path.join('/tmp', `claude-sandbox-${config.name}-init.sh`);

      // Capture environment before pre-commands
      const scriptContent = `#!/bin/bash
set -e

# Capture initial environment
env > /tmp/sandbox-env-before.txt

# Run pre-commands
${config.preCommands.map((cmd, i) =>
        `echo "[INIT SCRIPT] [${i + 1}/${config.preCommands?.length}] Running: ${cmd}"\n${cmd}`
      ).join('\n\n')}

# Capture environment after pre-commands
env > /tmp/sandbox-env-after.txt

# Extract new/modified environment variables
comm -13 <(sort /tmp/sandbox-env-before.txt) <(sort /tmp/sandbox-env-after.txt) > /tmp/sandbox-env-diff.txt || true

# Persist to ~/.sandbox-env for sourcing in all shells
# Filter out common variables that shouldn't be persisted
cat /tmp/sandbox-env-diff.txt | grep -v '^_=' | grep -v '^PWD=' | grep -v '^SHLVL=' | grep -v '^PIPESTATUS=' > /home/claude/.sandbox-env || true

# Ensure the file ends with a newline
echo "" >> /home/claude/.sandbox-env

# Also copy to the mounted directory for host access
cp /home/claude/.sandbox-env /home/claude/.sandbox-env.d/.sandbox-env 2>/dev/null || true

echo "[INIT SCRIPT] Environment captured to ~/.sandbox-env"
echo "[INIT SCRIPT] All commands completed"
`;
      await fs.writeFile(initScriptPath, scriptContent, { mode: 0o755 });
      binds.push(`${initScriptPath}:/home/claude/init.sh:ro`);
      envVars.push('INIT_SCRIPT=/home/claude/init.sh');

      // Create directory for sandbox env file to be accessible from host
      this.currentEnvPath = path.join('/tmp', `claude-sandbox-${config.name}-env`);
      await fs.ensureDir(this.currentEnvPath);
      binds.push(`${this.currentEnvPath}:/home/claude/.sandbox-env.d:rw`);

      logger.info(`Created init script with ${config.preCommands.length} commands at: ${initScriptPath}`);
      logger.debug('Script content preview:');
      logger.debug(scriptContent.split('\n').slice(0, 10).join('\n'));
    }

    // Step 3: Create container with volume mounts
    const container = await this.docker.createContainer({
      name: config.name,
      Image: imageName,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      User: 'claude',
      HostConfig: {
        Binds: binds,
        NetworkMode: 'bridge'
      },
      Env: envVars,
      Cmd: ['/bin/bash'],
      WorkingDir: '/workspace'
    });

    // Step 4: Start container
    await container.start();
    logger.success('Container started');

    return container;
  }

  async attachTerminal(containerId: string, hasPreCommands: boolean = false): Promise<void> {
    // Check if we have a TTY
    const isTTY = process.stdin.isTTY;

    if (!isTTY) {
      logger.warn('No TTY detected. Container is running in background.');
      logger.info(`You can attach manually with: docker exec -it ${containerId} bash`);
      logger.info('Or run this command from a terminal to get interactive session');
      return;
    }

    // Wait for init script to complete if pre-commands were configured
    if (hasPreCommands) {
      await this.waitForInitCompletion(containerId);
    }

    logger.info('Attaching interactive terminal...');

    // Use docker exec to run claude directly
    const { spawn } = await import('child_process');

    // Build docker exec command with environment from pre-commands
    const dockerArgs = ['exec', '-it'];

    // Try to load sandbox environment and pass key variables
    if (this.currentEnvPath) {
      try {
        const envFilePath = path.join(this.currentEnvPath, '.sandbox-env');
        if (await fs.pathExists(envFilePath)) {
          const envContent = await fs.readFile(envFilePath, 'utf-8');
          const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));

          // Parse KEY=VALUE format and add as --env flags
          for (const line of envLines) {
            const eqIndex = line.indexOf('=');
            if (eqIndex > 0) {
              const key = line.substring(0, eqIndex);
              const value = line.substring(eqIndex + 1);
              // Focus on PATH-like variables that are most important
              if (key.includes('PATH') || key.includes('INSTALL') || key.includes('HOME')) {
                dockerArgs.push('--env', `${key}=${value}`);
                logger.debug(`Passing environment variable: ${key}`);
              }
            }
          }
        }
      } catch (error) {
        logger.debug('Could not load sandbox environment, proceeding without it');
      }
    }

    dockerArgs.push(containerId, 'claude', '--dangerously-skip-permissions');

    const child = spawn('docker', dockerArgs, {
      stdio: 'inherit'
    });

    return new Promise((resolve) => {
      child.on('exit', (code) => {
        logger.debug(`Container exited with code ${code}`);
        resolve();
      });
    });
  }

  private async waitForInitCompletion(containerId: string): Promise<void> {
    const { execSync } = await import('child_process');
    const maxWaitTime = 120000; // 2 minutes max
    const startTime = Date.now();

    logger.info('Waiting for pre-configuration commands to complete...');

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Get container logs and check for completion marker
        const logs = execSync(`docker logs ${containerId} 2>&1`, {
          encoding: 'utf-8',
          timeout: 5000
        });

        if (logs.includes('[ENTRYPOINT] Created completion marker') ||
            logs.includes('[ENTRYPOINT] No pre-configuration commands to run')) {
          logger.success('Pre-configuration commands completed');
          return;
        }

        // Check for error patterns
        if (logs.includes('ERROR') || logs.includes('error')) {
          logger.warn('Possible errors detected in container logs');
        }

        // Show a subset of recent logs for debugging
        const recentLogs = logs.split('\n').slice(-5).join('\n');
        if (recentLogs.trim()) {
          logger.debug(`Container logs:\n${recentLogs}`);
        }
      } catch (error) {
        // Logs might not be available yet, continue waiting
      }

      const elapsed = Date.now() - startTime;
      logger.info(`Still waiting... (${Math.round(elapsed / 1000)}s elapsed)`);

      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.warn('Timeout waiting for init script completion. Showing container logs:');
    try {
      const fullLogs = execSync(`docker logs ${containerId} 2>&1`, { encoding: 'utf-8' });
      console.log(fullLogs);
    } catch {}
    logger.warn('Attaching anyway...');
  }

  async executeCommands(containerId: string, commands: string[]): Promise<{ command: string; exitCode: number; output: string } | null> {
    const { execSync } = await import('child_process');

    for (const command of commands) {
      logger.info(`Ejecutando .... ${command}`);

      try {
        execSync(`docker exec ${containerId} /bin/bash -c "${command.replace(/"/g, '\\"')}"`, {
          stdio: process.env.DEBUG ? 'inherit' : 'pipe',
          encoding: 'utf-8'
        });
        logger.success(`Command completed: ${command}`);
      } catch (error: any) {
        const exitCode = error.status || 1;
        const output = error.stdout || error.stderr || '';
        logger.warn(`Command failed with exit code ${exitCode}: ${command}`);
        if (output.trim()) {
          logger.warn(`Output: ${output.trim()}`);
        }
        // Return failure information to caller
        return { command, exitCode, output };
      }
    }
    return null;
  }

  async stopContainer(containerId: string): Promise<void> {
    logger.info('Stopping container...');
    const container = this.docker.getContainer(containerId);
    await container.stop();
    logger.success('Container stopped');
  }

  async removeContainer(containerId: string): Promise<void> {
    logger.info('Removing container...');
    const container = this.docker.getContainer(containerId);
    await container.remove({ force: true, v: true });
    logger.success('Container removed');
  }

  private async buildBaseImage(imageName: string): Promise<void> {
    // Check if image exists and if entrypoint has changed
    const dockerfilePath = path.join(import.meta.dir, '../../docker/Dockerfile');
    const entrypointPath = path.join(import.meta.dir, '../../docker/entrypoint.sh');

    try {
      const image = await this.docker.getImage(imageName).inspect();
      const createdTimestamp = typeof image.Created === 'number'
        ? image.Created
        : parseInt(image.Created as string, 10);
      const imageCreated = new Date(createdTimestamp * 1000);
      const entrypointStat = await fs.stat(entrypointPath);

      // Rebuild if entrypoint is newer than the image
      if (entrypointStat.mtime > imageCreated) {
        logger.info('Entrypoint has changed since last build, rebuilding Docker image...');
        await this.buildImageWithContext(imageName, dockerfilePath);
        logger.success('Docker image rebuilt successfully');
        return;
      }

      logger.debug(`Using existing image ${imageName} (created ${imageCreated.toISOString()})`);
    } catch {
      // Image doesn't exist, build it
      logger.info('Building base Docker image...');
      try {
        await this.buildImageWithContext(imageName, dockerfilePath);
        logger.success('Docker image built successfully');
      } catch (error) {
        logger.error(`Failed to build Docker image: ${(error as Error).message}`);
        throw error;
      }
    }
  }

  private async buildImageWithContext(imageName: string, dockerfilePath: string): Promise<void> {
    const dockerContext = path.dirname(dockerfilePath);

    // Use native docker build command for better compatibility
    const { execSync } = await import('child_process');
    execSync(`docker build -t ${imageName} -f ${dockerfilePath} ${dockerContext}`, {
      stdio: 'inherit'
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}
