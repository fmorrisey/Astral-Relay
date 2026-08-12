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

  async exportPost(post, tags = [], media = null) {
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
      const frontmatter = this._generateFrontmatter(post, tags, existing, media);
      const content = `---\n${frontmatter}---\n\n${post.body}\n`;

      await this._ensureDirectory(dirname(filePath));
      await writeFile(filePath, content, 'utf-8');

      logger.info(`Exported: ${filePath}`);

      return {
        success: true,
        filePath: filePath.replace(this.workspaceRoot, ''),
        images: Object.keys(this._imageFields(media).write).length
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

  /**
   * Image fields, added only when the CMS actually holds a value.
   *
   * Deliberately not written when unset. #17 established that keys the CMS does
   * not model are preserved, and every entry imported from an existing site has
   * a hand-written heroImage or gallery that the CMS does not know about yet.
   * Writing empty values for those would erase them on the first publish --
   * turning a fix for silent data loss into a new source of it.
   *
   * The consequence is that clearing a hero has to be done in the file. That is
   * the safer direction to be wrong in.
   */
  _imageFields(media) {
    if (!media) return { write: {}, remove: [] };

    const write = {};
    if (media.hero) write.heroImage = media.hero.url;
    if (media.cover) write.coverImage = media.cover.url;
    if (media.gallery?.length) {
      write.gallery = media.gallery.map(item => ({ src: item.url, alt: item.alt || '' }));
    }

    // Until the CMS has been asked to manage this post's images, absent means
    // "unknown", and a hand-written value is left alone. Once it manages them,
    // absent means "there is none" -- so a cleared slot, or one emptied by
    // deleting the image behind it, is removed from the file rather than left
    // pointing at something that no longer exists.
    const remove = media.managed
      ? ['heroImage', 'coverImage', 'gallery'].filter(key => !(key in write))
      : [];

    return { write, remove };
  }

  _generateFrontmatter(post, tags, existing = {}, media = null) {
    const images = this._imageFields(media);

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
      published: post.status === 'published',
      // Only present when set; see _imageFields.
      ...images.write
    };

    // Spread order matters: keys already in the file keep their original
    // position, and only owned keys are replaced. New owned keys are appended.
    const data = { ...existing, ...owned };
    for (const key of images.remove) delete data[key];

    const preserved = Object.keys(existing).filter(k => !(k in owned) && !images.remove.includes(k));
    if (preserved.length > 0) {
      logger.info(`Preserved frontmatter keys: ${preserved.join(', ')}`);
    }

    return yaml.dump(data, {
      lineWidth: -1,
      noRefs: true
    });
  }

  async _ensureDirectory(dirPath) {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }
}
