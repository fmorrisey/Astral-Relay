import argon2 from 'argon2';
import { randomBytes } from 'crypto';

export class AuthService {
  constructor(db) {
    this.db = db;
  }

  async hashPassword(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });
  }

  async verifyPassword(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  generateRecoveryCode() {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      parts.push(randomBytes(2).toString('hex').toUpperCase());
    }
    return `RELAY-${parts.join('-')}`;
  }

  createSession(userId, userAgent = null, ipAddress = null) {
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, expiresAt.toISOString(), userAgent, ipAddress);

    return { sessionId, expiresAt };
  }

  validateSession(sessionId) {
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

  deleteSession(sessionId) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  cleanExpiredSessions() {
    const result = this.db.prepare(
      "DELETE FROM sessions WHERE expires_at < datetime('now')"
    ).run();
    return result.changes;
  }
}
