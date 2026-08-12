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

  list({ limit = 50, offset = 0, search = '' } = {}) {
    // LIKE with escaped wildcards: a filename containing % or _ should match
    // itself, not everything.
    const term = String(search).trim();
    const where = term ? "WHERE original_filename LIKE ? ESCAPE '\\'" : '';
    const params = term ? [`%${term.replace(/[\\%_]/g, c => '\\' + c)}%`] : [];

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM media ${where}`).get(...params).count;
    const items = this.db.prepare(
      `SELECT * FROM media ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return {
      media: items.map(m => this._format(m)),
      total,
      limit,
      offset
    };
  }

  updateAltText(id, altText) {
    this.db.prepare('UPDATE media SET alt_text = ? WHERE id = ?').run(altText || null, id);
    return this.findById(id);
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
      // Served by the CMS, not from the site: thumbnails are an artifact of this
      // application and do not belong in the published output.
      thumbnailUrl: `/api/media/${media.id}/thumbnail`,
      // The original, served by this app. Distinct from `url`, which is the
      // path on the published site and does not resolve here.
      fileUrl: `/api/media/${media.id}/file`,
      altText: media.alt_text,
      // Ownership checks compare against this. Omitting it made
      // ownsOrAdmin(user, undefined) false for every non-admin, so authors were
      // refused on their own media.
      createdBy: media.created_by,
      createdAt: media.created_at
    };
  }
}
