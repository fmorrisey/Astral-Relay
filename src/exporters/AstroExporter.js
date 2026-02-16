import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import logger from '../utils/logger.js';

export class AstroExporter {
  constructor({ workspaceRoot, collections }) {
    this.workspaceRoot = workspaceRoot;
    this.collections = collections || [];
  }

  async exportPost(post, tags = [], media = []) {
    try {
      const frontmatter = this._generateFrontmatter(post, tags);
      const content = `---\n${frontmatter}---\n\n${post.body}\n`;

      const filePath = join(
        this.workspaceRoot,
        'src/content',
        post.collection,
        `${post.slug}.md`
      );

      await this._ensureDirectory(dirname(filePath));
      await writeFile(filePath, content, 'utf-8');

      logger.info(`Exported: ${filePath}`);

      let copiedMedia = 0;
      for (const m of media) {
        await this._copyMedia(m);
        copiedMedia++;
      }

      return {
        success: true,
        filePath: filePath.replace(this.workspaceRoot, ''),
        mediaFiles: copiedMedia
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Export failed');
      throw error;
    }
  }

  async deletePost(post) {
    const filePath = join(
      this.workspaceRoot,
      'src/content',
      post.collection,
      `${post.slug}.md`
    );

    if (existsSync(filePath)) {
      await unlink(filePath);
      logger.info(`Deleted exported file: ${filePath}`);
    }
  }

  _generateFrontmatter(post, tags) {
    const data = {
      title: post.title,
      pubDate: post.published_at || post.publishedAt || post.created_at || post.createdAt,
      description: post.summary || '',
      tags: tags.map(t => typeof t === 'string' ? t : t.name),
      draft: post.status !== 'published'
    };

    return yaml.dump(data, {
      lineWidth: -1,
      noRefs: true
    });
  }

  async _copyMedia(media) {
    const sourcePath = join(this.workspaceRoot, 'public', media.storage_path || media.storagePath);
    if (!existsSync(sourcePath)) {
      logger.warn(`Media file not found: ${sourcePath}`);
    }
  }

  async _ensureDirectory(dirPath) {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }
}
