import { v4 as uuid } from 'uuid';

export class Media {
  constructor(db) {
    this.db = db;
  }

  create({ filename, originalFilename, mimeType, sizeBytes, width, height, storagePath, altText, userId }) {
    const id = uuid();

    this.db.prepare(`
      INSERT INTO media (id, filename, original_filename, mime_type, size_bytes, width, height, storage_path, alt_text, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, filename, originalFilename, mimeType, sizeBytes, width || null, height || null, storagePath, altText || null, userId);

    return this.findById(id);
  }

  findById(id) {
    const media = this.db.prepare('SELECT * FROM media WHERE id = ?').get(id);
    return media ? this._format(media) : null;
  }

  list({ limit = 50, offset = 0 } = {}) {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM media').get().count;
    const items = this.db.prepare(
      'SELECT * FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);

    return {
      media: items.map(m => this._format(m)),
      total,
      limit,
      offset
    };
  }

  delete(id) {
    const media = this.db.prepare('SELECT * FROM media WHERE id = ?').get(id);
    this.db.prepare('DELETE FROM media WHERE id = ?').run(id);
    return media;
  }

  getByPostId(postId) {
    return this.db.prepare(`
      SELECT m.* FROM media m
      JOIN post_media pm ON m.id = pm.media_id
      WHERE pm.post_id = ?
    `).all(postId).map(m => this._format(m));
  }

  _format(media) {
    return {
      id: media.id,
      filename: media.filename,
      originalFilename: media.original_filename,
      mimeType: media.mime_type,
      sizeBytes: media.size_bytes,
      width: media.width,
      height: media.height,
      storagePath: media.storage_path,
      url: `/${media.storage_path}`,
      altText: media.alt_text,
      createdAt: media.created_at
    };
  }
}
