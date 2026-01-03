import path from 'path';
import os from 'os';

export const PATHS = {
  claudeHome: path.join(os.homedir(), '.claude'),
  claudeSettings: path.join(os.homedir(), '.claude', 'settings.json'),
} as const;
