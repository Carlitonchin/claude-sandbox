import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { logger } from '../utils/logger.js';

interface ConfigCollection {
  [relativePath: string]: Buffer;
}

export class ClaudeConfigManager {
  private claudeHome: string;

  constructor() {
    this.claudeHome = path.join(os.homedir(), '.claude');
  }

  async collectAllConfigs(): Promise<ConfigCollection> {
    const configs: ConfigCollection = {};

    if (!await fs.pathExists(this.claudeHome)) {
      throw new Error(`Claude Code config directory not found: ${this.claudeHome}`);
    }

    logger.debug(`Collecting configs from ${this.claudeHome}`);

    // Collect all files from ~/.claude/
    const entries = await fs.readdir(this.claudeHome, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(this.claudeHome, entry.name);

      if (entry.isFile()) {
        configs[entry.name] = await fs.readFile(fullPath);
        logger.debug(`Collected config: ${entry.name}`);
      } else if (entry.isDirectory()) {
        // Recursively collect subdirectories
        const dirContents = await this.collectDirectory(fullPath, entry.name);
        Object.assign(configs, dirContents);
      }
    }

    // Transform settings.json for Linux if present
    if (configs['settings.json']) {
      configs['settings.json'] = this.transformSettings(configs['settings.json']);
      logger.debug('Transformed settings.json for Linux');
    }

    logger.info(`Collected ${Object.keys(configs).length} configuration files`);

    return configs;
  }

  private async collectDirectory(dirPath: string, prefix: string): Promise<ConfigCollection> {
    const configs: ConfigCollection = {};
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(prefix, entry.name);

      if (entry.isFile()) {
        configs[relativePath] = await fs.readFile(fullPath);
      } else if (entry.isDirectory()) {
        const subContents = await this.collectDirectory(fullPath, relativePath);
        Object.assign(configs, subContents);
      }
    }

    return configs;
  }

  private transformSettings(settingsBuffer: Buffer): Buffer {
    try {
      const settings = JSON.parse(settingsBuffer.toString());

      // Remove macOS-specific hooks that won't work in Linux
      if (settings.hooks) {
        settings.hooks = this.filterHooksForLinux(settings.hooks);
      }

      return Buffer.from(JSON.stringify(settings, null, 2));
    } catch (error) {
      logger.warn(`Failed to transform settings.json: ${(error as Error).message}`);
      return settingsBuffer;
    }
  }

  private filterHooksForLinux(hooks: any): any {
    // Filter out macOS-specific commands (afplay, osascript)
    const filtered = JSON.parse(JSON.stringify(hooks));

    // Recursively filter command hooks
    const filterCommands = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(filterCommands);
      } else if (obj && typeof obj === 'object') {
        if (obj.command) {
          // Remove macOS-specific commands
          if (obj.command.includes('afplay') || obj.command.includes('osascript')) {
            return null;
          }
        }
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          const filtered = filterCommands(value);
          if (filtered !== null) {
            result[key] = filtered;
          }
        }
        return result;
      }
      return obj;
    };

    return filterCommands(filtered);
  }

  getEnvVars(settingsBuffer: Buffer): string[] {
    try {
      const settings = JSON.parse(settingsBuffer.toString());
      return Object.entries(settings.env || {}).map(([key, value]) => `${key}=${value}`);
    } catch {
      return [];
    }
  }
}
