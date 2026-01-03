import path from 'path';
import fs from 'fs-extra';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

// Schema de validacion del archivo de configuracion
const SandboxConfigSchema = z.object({
  commands: z.array(z.string()).min(1).optional()
});

export interface SandboxConfig {
  commands?: string[];
}

export class SandboxConfigManager {
  private configPath: string;

  constructor(projectPath: string) {
    this.configPath = path.join(projectPath, '.claude-sandbox', 'settings.json');
  }

  async loadConfig(): Promise<SandboxConfig | null> {
    // Verificar si el archivo existe
    if (!await fs.pathExists(this.configPath)) {
      logger.debug(`No .claude-sandbox/settings.json found at ${this.configPath}, skipping pre-commands`);
      return null;
    }

    try {
      // Leer el archivo
      const content = await fs.readFile(this.configPath, 'utf-8');
      const data = JSON.parse(content);

      // Validar la estructura
      const validatedConfig = SandboxConfigSchema.safeParse(data);

      if (!validatedConfig.success) {
        logger.warn(`Invalid .claude-sandbox/settings.json structure: ${validatedConfig.error.message}`);
        logger.warn('Skipping pre-commands');
        return null;
      }

      const config = validatedConfig.data;

      if (config.commands && config.commands.length > 0) {
        logger.info(`Found ${config.commands.length} pre-configuration command(s) in .claude-sandbox/settings.json`);
      }

      return config;
    } catch (error) {
      if ((error as Error).name === 'SyntaxError') {
        logger.warn(`Invalid JSON in .claude-sandbox/settings.json: ${(error as Error).message}`);
        logger.warn('Skipping pre-commands');
      } else {
        logger.warn(`Error reading .claude-sandbox/settings.json: ${(error as Error).message}`);
        logger.warn('Skipping pre-commands');
      }
      return null;
    }
  }
}
