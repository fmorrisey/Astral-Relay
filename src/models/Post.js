import { v4 as uuid } from 'uuid';
import { slugify } from '../utils/slugify.js';

export class Post {
  constructor(db) {
    this.db = db;
  }

  create({ collection, title, body, summary, tags, userId }) {
    const id = uuid();
    const slug = slugify(title);

    const insertPost = this.db.prepare(`
      INSERT INTO posts (id, collection, slug, title, body, summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const createVersion = this.db.prepare(`
      INSERT INTO post_versions (post_id, title, body, summary, version_number, created_by)
      VALUES (?, ?, ?, ?, 1, ?)
    `);

    const transaction = this.db.transaction((data) => {
      insertPost.run(
        data.id, data.collection, data.slug,
        data.title, data.body, data.summary || null,
        data.userId
      );

      createVersion.run(
        data.id, data.title, data.body,
        data.summary || null, data.userId
      );

      if (data.tags && data.tags.length > 0) {
        this._attachTags(data.id, data.tags);
      }
    });

    transaction({ id, collection, slug, title, body, summary, userId, tags });

    return this.findById(id);
  }

  findById(id) {
    const post = this.db.prepare(`
      SELECT
        p.*,
        u.username as author_username,
        u.display_name as author_name
      FROM posts p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(id);

    if (!post) return null;

    const tags = this._getPostTags(id);
    return this._formatPost({ ...post, tags });
  }

  list({ status, collection, limit = 20, offset = 0, sort = 'created_at', order = 'desc' } = {}) {
    const allowedSorts = ['created_at', 'updated_at', 'published_at', 'title'];
    const allowedOrders = ['asc', 'desc'];

    if (!allowedSorts.includes(sort)) sort = 'created_at';
    if (!allowedOrders.includes(order)) order = 'desc';

    let query = `
      SELECT
        p.id, p.collection, p.slug, p.title, p.summary, p.status,
        p.created_at, p.updated_at, p.published_at,
        u.display_name as author_name
      FROM posts p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ` AND p.status = ?`;
      params.push(status);
    }

    if (collection) {
      query += ` AND p.collection = ?`;
      params.push(collection);
    }

    // Count total
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const { total } = this.db.prepare(countQuery).get(...params);

    query += ` ORDER BY p.${sort} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const posts = this.db.prepare(query).all(...params);

    const postsWithTags = posts.map(post => this._formatPost({
      ...post,
      tags: this._getPostTags(post.id)
    }));

    return { posts: postsWithTags, total, limit, offset };
  }

  update(id, { title, body, summary, slug, tags }) {
    const current = this.findById(id);
    if (!current) {
      const err = new Error('Post not found');
      err.statusCode = 404;
      throw err;
    }

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (body !== undefined) { updates.push('body = ?'); params.push(body); }
    if (summary !== undefined) { updates.push('summary = ?'); params.push(summary); }
    if (slug !== undefined) { updates.push('slug = ?'); params.push(slug); }

    updates.push("updated_at = datetime('now')");

    this.db.prepare(`
      UPDATE posts SET ${updates.join(', ')} WHERE id = ?
    `).run(...params, id);

    // Create new version
    const versionNumber = this._getNextVersionNumber(id);
    const raw = this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    this.db.prepare(`
      INSERT INTO post_versions (post_id, title, body, summary, version_number, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, raw.title, raw.body, raw.summary, versionNumber, raw.created_by);

    if (tags !== undefined) {
      this._replaceTags(id, tags);
    }

    return this.findById(id);
  }

  publish(id, publishedAt = null) {
    const timestamp = publishedAt || new Date().toISOString();
    this.db.prepare(`
      UPDATE posts
      SET status = 'published', published_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(timestamp, id);

    return this.findById(id);
  }

  unpublish(id) {
    this.db.prepare(`
      UPDATE posts
      SET status = 'draft', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return this.findById(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  }

  getVersions(postId) {
    return this.db.prepare(`
      SELECT
        v.*,
        u.display_name as author_name
      FROM post_versions v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.post_id = ?
      ORDER BY v.version_number DESC
    `).all(postId);
  }

  // Private helpers

  _getPostTags(postId) {
    return this.db.prepare(`
      SELECT t.id, t.name, t.slug
      FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `).all(postId);
  }

  _attachTags(postId, tagNames) {
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)');
    const getTagId = this.db.prepare('SELECT id FROM tags WHERE slug = ?');
    const linkTag = this.db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)');

    for (const name of tagNames) {
      const tagSlug = slugify(name);
      insertTag.run(name, tagSlug);
      const tag = getTagId.get(tagSlug);
      linkTag.run(postId, tag.id);
    }
  }

  _replaceTags(postId, tagNames) {
    this.db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
    if (tagNames.length > 0) {
      this._attachTags(postId, tagNames);
    }
  }

  _getNextVersionNumber(postId) {
    const result = this.db.prepare(
      'SELECT MAX(version_number) as max_version FROM post_versions WHERE post_id = ?'
    ).get(postId);
    return (result.max_version || 0) + 1;
  }

  _formatPost(post) {
    if (!post) return null;
    return {
      id: post.id,
      collection: post.collection,
      slug: post.slug,
      title: post.title,
      body: post.body,
      summary: post.summary,
      status: post.status,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      publishedAt: post.published_at,
      createdBy: post.created_by,
      authorName: post.author_name,
      tags: (post.tags || []).map(t => t.name)
    };
  }
}
