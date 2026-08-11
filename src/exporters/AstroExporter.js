import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
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
      const filePath = join(
        this.workspaceRoot,
        'src/content',
        post.collection,
        `${post.slug}.md`
      );

      // Publishing rewrites the whole file, so anything already in its
      // frontmatter that this CMS does not model -- heroImage, gallery,
      // featured, tech, links -- would be dropped. Those keys are typically
      // optional in an Astro schema, so the site would still build and simply
      // render without them. Carry them through instead.
      const existing = this._readExistingFrontmatter(filePath);
      const frontmatter = this._generateFrontmatter(post, tags, existing);
      const content = `---\n${frontmatter}---\n\n${post.body}\n`;

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

  /**
   * Frontmatter of the file this post would overwrite, or {} if there is none.
   *
   * A file whose frontmatter cannot be parsed throws rather than returning {}:
   * treating it as empty would silently discard every key it holds, which is
   * exactly the data loss this is here to prevent.
   */
  _readExistingFrontmatter(filePath) {
    if (!existsSync(filePath)) return {};

    const raw = readFileSync(filePath, 'utf-8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    let parsed;
    try {
      parsed = yaml.load(match[1]);
    } catch (error) {
      throw new Error(
        `Refusing to overwrite ${filePath}: existing frontmatter is not valid YAML (${error.message})`
      );
    }

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  _generateFrontmatter(post, tags, existing = {}) {
    // The keys this CMS owns and will always rewrite. Everything else in
    // `existing` is passed through untouched.
    const owned = {
      title: post.title,
      date: post.published_at || post.publishedAt || post.created_at || post.createdAt,
      // Written as `summary`, matching the field on the post model. It used to
      // be written as `description`, which meant a site reading `summary`
      // rendered nothing. An existing `description` is left alone rather than
      // overwritten -- it is not a field this CMS models.
      summary: post.summary || '',
      tags: tags.map(t => typeof t === 'string' ? t : t.name),
      published: post.status === 'published'
    };

    // Spread order matters: keys already in the file keep their original
    // position, and only owned keys are replaced. New owned keys are appended.
    const data = { ...existing, ...owned };

    const preserved = Object.keys(existing).filter(k => !(k in owned));
    if (preserved.length > 0) {
      logger.info(`Preserved frontmatter keys: ${preserved.join(', ')}`);
    }

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
