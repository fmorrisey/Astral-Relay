import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import config from '../config.js';

const execAsync = promisify(exec);

export class GitExporter {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
  }

  async commitAndPush(message) {
    if (!config.gitSyncEnabled) return;

    try {
      await execAsync('git add src/content/ public/media/', {
        cwd: this.workspacePath
      });

      await execAsync(`git commit -m ${JSON.stringify(message)}`, {
        cwd: this.workspacePath
      });

      await execAsync(`git push origin ${config.gitBranch}`, {
        cwd: this.workspacePath
      });

      logger.info({ message }, 'Git commit and push successful');
    } catch (error) {
      logger.error({ error: error.message }, 'Git operation failed');
      throw error;
    }
  }
}
