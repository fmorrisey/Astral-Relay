import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import logger from '../utils/logger.js';

export class StorageService {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.mediaRoot = join(workspacePath, 'public', 'media');
  }

  async saveMedia(buffer, storagePath) {
    const fullPath = join(this.workspacePath, 'public', storagePath);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(fullPath, buffer);
    logger.info(`Saved media: ${fullPath}`);
    return fullPath;
  }

  async deleteMedia(storagePath) {
    const fullPath = join(this.workspacePath, 'public', storagePath);
    if (existsSync(fullPath)) {
      await unlink(fullPath);
      logger.info(`Deleted media: ${fullPath}`);
    }
  }

  getMediaStoragePath(filename) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `media/${year}/${month}/${filename}`;
  }
}
