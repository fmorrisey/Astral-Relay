import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import logger from '../utils/logger.js';

const THUMB_WIDTH = 400;
const THUMB_QUALITY = 72;

/**
 * Derivative images for the media grid.
 *
 * Thumbnails live in the CMS's own data directory, NOT in the Astro workspace.
 * The workspace is the user's site: anything written there is published, and a
 * grid thumbnail is an artifact of this application, not content. Keeping them
 * separate also means they can be deleted and regenerated without touching the
 * site.
 *
 * Generated on demand rather than at upload. That covers images uploaded before
 * thumbnails existed with no migration or backfill, and self-heals if the
 * directory is cleared.
 */
export class ThumbnailService {
  constructor({ workspacePath, thumbnailDir }) {
    this.workspacePath = workspacePath;
    this.thumbnailDir = thumbnailDir;
  }

  pathFor(mediaId) {
    return join(this.thumbnailDir, `${mediaId}.webp`);
  }

  sourcePathFor(storagePath) {
    return join(this.workspacePath, 'public', storagePath);
  }

  /**
   * Path to the thumbnail, generating it if absent.
   *
   * @returns {Promise<string|null>} null when the source image is missing, which
   *   happens if the workspace is unmounted or the file was removed by hand.
   */
  async ensure({ id, storagePath }) {
    const thumbPath = this.pathFor(id);
    if (existsSync(thumbPath)) return thumbPath;

    const source = this.sourcePathFor(storagePath);
    if (!existsSync(source)) {
      logger.warn(`Cannot build thumbnail, source missing: ${source}`);
      return null;
    }

    await mkdir(dirname(thumbPath), { recursive: true });

    // withoutEnlargement so a small source is not upscaled into a bigger file
    // than the original. rotate() for the same reason the main pipeline does it:
    // the source may carry EXIF orientation.
    await sharp(source)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toFile(thumbPath);

    logger.info(`Generated thumbnail: ${id}`);
    return thumbPath;
  }
}
