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
}

export class DockerContainerManager {
  private docker: Docker;

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
      `${tempConfigDir}:/root/.claude:rw`,
    ];

    let claudeJsonTempPath: string | undefined;
    if (config.claudeJson) {
      claudeJsonTempPath = path.join('/tmp', `claude-sandbox-${config.name}-claude.json`);
      await fs.writeFile(claudeJsonTempPath, config.claudeJson);
      // Mount to /root/.claude.json (not inside /root/.claude/)
      binds.push(`${claudeJsonTempPath}:/root/.claude.json:rw`);
    }

    // Step 3: Create container with volume mounts
    const container = await this.docker.createContainer({
      name: config.name,
      Image: imageName,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      HostConfig: {
        Binds: binds,
        NetworkMode: 'bridge'
      },
      Env: [
        'WORKSPACE_PATH=/workspace',
        'CLAUDE_CONFIG_PATH=/root/.claude',
        ...(config.envVars || [])
      ],
      Cmd: ['/bin/bash'],
      WorkingDir: '/workspace'
    });

    // Step 4: Start container
    await container.start();
    logger.success('Container started');

    return container;
  }

  async attachTerminal(containerId: string): Promise<void> {
    logger.info('Attaching interactive terminal...');
    const container = this.docker.getContainer(containerId);

    // Check if we have a TTY
    const isTTY = process.stdin.isTTY;

    if (!isTTY) {
      logger.warn('No TTY detected. Container is running in background.');
      logger.info(`You can attach manually with: docker exec -it ${containerId} bash`);
      logger.info('Or run this command from a terminal to get interactive session');
      return;
    }

    // Use docker exec to run bash interactively
    const { spawn } = await import('child_process');

    const child = spawn('docker', ['exec', '-it', containerId, 'bash'], {
      stdio: 'inherit'
    });

    return new Promise((resolve) => {
      child.on('exit', (code) => {
        logger.debug(`Container exited with code ${code}`);
        resolve();
      });
    });
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
    // Check if image exists
    try {
      await this.docker.getImage(imageName).inspect();
      logger.debug(`Using existing image ${imageName}`);
      return;
    } catch {
      // Image doesn't exist, build it
      logger.info('Building base Docker image...');
      const dockerfilePath = path.join(import.meta.dir, '../../docker/Dockerfile');

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

    const docker = this.docker;
    const buildOptions = {
      t: imageName,
      dockerfile: 'Dockerfile'
    };

    // Use native docker build command for better compatibility
    const { execSync } = await import('child_process');
    execSync(`docker build -t ${imageName} -f ${dockerfilePath} ${dockerContext}`, {
      stdio: 'inherit'
    });
  }

  private async installClaudeCode(container: Docker.Container): Promise<void> {
    logger.info('Installing Claude Code in container...');

    const exec = await container.exec({
      Cmd: [
        '/bin/bash', '-c',
        `
        # Install Claude Code via official script
        curl -fsSL https://claude.ai/install.sh | bash

        # Verify installation
        export PATH="$HOME/.local/bin:$PATH"
        claude --version || echo "Claude installation may have failed"
        `
      ],
      AttachStdout: true,
      AttachStderr: true,
      Env: ['PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']
    });

    const stream = await exec.start({ Detach: false });

    // Wait for exec to complete
    await new Promise((resolve, reject) => {
      container.modem.demuxStream(stream, process.stdout, process.stderr);
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    logger.success('Claude Code installed');
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
