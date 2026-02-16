import { randomBytes } from 'crypto';

export class Session {
  constructor(db) {
    this.db = db;
  }

  create({ userId, userAgent, ipAddress, maxAge = 7 * 24 * 60 * 60 * 1000 }) {
    const id = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + maxAge).toISOString();

    this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, expiresAt, userAgent || null, ipAddress || null);

    return { sessionId: id, expiresAt };
  }

  validate(sessionId) {
    const session = this.db.prepare(`
      SELECT s.*, u.id as uid, u.username, u.display_name, u.email
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).get(sessionId);

    if (session) {
      this.db.prepare(
        "UPDATE sessions SET last_activity = datetime('now') WHERE id = ?"
      ).run(sessionId);
    }

    return session;
  }

  delete(sessionId) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  deleteByUserId(userId) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  cleanExpired() {
    const result = this.db.prepare(
      "DELETE FROM sessions WHERE expires_at < datetime('now')"
    ).run();
    return result.changes;
  }
}
