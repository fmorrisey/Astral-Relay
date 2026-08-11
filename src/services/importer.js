import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Reads existing Astro content into the CMS.
 *
 * Read-only against the workspace: this never writes to src/content. Fields the
 * CMS does not model (heroImage, gallery, tech, ...) are deliberately NOT copied
 * into the database -- the file stays their source of truth, and AstroExporter
 * merges them back in on publish.
 */
export class ImportService {
  constructor({ workspacePath, postModel, db }) {
    this.workspacePath = workspacePath;
    this.postModel = postModel;
    this.db = db;
  }

  contentRoot() {
    return join(this.workspacePath, 'src', 'content');
  }

  /** Collection directories present in the workspace. */
  collections() {
    const root = this.contentRoot();
    if (!existsSync(root)) return [];

    return readdirSync(root)
      .filter(name => statSync(join(root, name)).isDirectory())
      .sort();
  }

  parseFile(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const match = raw.match(FRONTMATTER);

    if (!match) {
      return { error: 'no frontmatter' };
    }

    let frontmatter;
    try {
      frontmatter = yaml.load(match[1]);
    } catch (err) {
      return { error: `invalid YAML (${err.message})` };
    }

    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
      return { error: 'frontmatter is not a mapping' };
    }
    if (!frontmatter.title) {
      return { error: 'missing title' };
    }

    return { frontmatter, body: raw.slice(match[0].length).replace(/^\r?\n/, '') };
  }

  /**
   * @returns {{collection,slug,title,action,reason?}[]} one row per file found
   */
  importAll({ userId, dryRun = false, collections = null } = {}) {
    const root = this.contentRoot();
    if (!existsSync(root)) {
      throw new Error(`No content directory at ${root}. Is the workspace mounted?`);
    }

    const targets = collections?.length ? collections : this.collections();
    const results = [];

    for (const collection of targets) {
      const dir = join(root, collection);
      if (!existsSync(dir)) {
        results.push({ collection, slug: null, title: null, action: 'skipped', reason: 'no such collection' });
        continue;
      }

      const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();

      for (const file of files) {
        // The slug is the filename, never derived from the title: it is the
        // page's URL, and 5 of 19 entries in the reference site have titles that
        // slugify to something else (two of them to the same value).
        const slug = file.replace(/\.md$/, '');
        const parsed = this.parseFile(join(dir, file));

        if (parsed.error) {
          results.push({ collection, slug, title: null, action: 'skipped', reason: parsed.error });
          continue;
        }

        const { frontmatter: fm, body } = parsed;
        const tags = Array.isArray(fm.tags) ? fm.tags.filter(t => typeof t === 'string') : [];
        // The site uses `summary`; `description` is accepted as a fallback since
        // older exports wrote the summary under that name.
        const summary = fm.summary || fm.description || null;
        // Astro's schema defaults `published` to true, so a missing key means
        // published rather than draft.
        const published = fm.published !== false;

        const existing = this.db
          .prepare('SELECT id FROM posts WHERE collection = ? AND slug = ?')
          .get(collection, slug);

        const row = {
          collection,
          slug,
          title: fm.title,
          action: existing ? 'updated' : 'created',
          tags: tags.length
        };

        if (!dryRun) {
          const post = existing
            ? this.postModel.update(existing.id, { title: fm.title, body, summary, tags })
            : this.postModel.create({ collection, title: fm.title, body, summary, tags, userId, slug });

          if (published) {
            this.postModel.publish(post.id, this._normaliseDate(fm.date));
          } else {
            this.postModel.unpublish(post.id);
          }
        }

        results.push(row);
      }
    }

    return results;
  }

  /**
   * Frontmatter dates are often bare `2020-09-11`, which js-yaml turns into a
   * Date. Normalise to ISO so published_at is comparable with CMS-created rows.
   */
  _normaliseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
}
