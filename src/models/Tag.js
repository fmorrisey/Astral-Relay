import { slugify } from '../utils/slugify.js';

export class Tag {
  constructor(db) {
    this.db = db;
  }

  create({ name }) {
    const slug = slugify(name);

    const existing = this.db.prepare('SELECT * FROM tags WHERE slug = ?').get(slug);
    if (existing) {
      const err = new Error('Tag already exists');
      err.statusCode = 409;
      throw err;
    }

    this.db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').run(name, slug);
    return this.findBySlug(slug);
  }

  findById(id) {
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
    return tag ? this._format(tag) : null;
  }

  findBySlug(slug) {
    const tag = this.db.prepare('SELECT * FROM tags WHERE slug = ?').get(slug);
    return tag ? this._format(tag) : null;
  }

  list() {
    const tags = this.db.prepare(`
      SELECT t.*, COUNT(pt.post_id) as post_count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      GROUP BY t.id
      ORDER BY t.name ASC
    `).all();

    return tags.map(t => this._format(t));
  }

  delete(id) {
    this.db.prepare('DELETE FROM post_tags WHERE tag_id = ?').run(id);
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  _format(tag) {
    return {
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      postCount: tag.post_count || 0,
      createdAt: tag.created_at
    };
  }
}
