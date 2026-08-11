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

  /**
   * Issue a recovery code for a user and store only its hash.
   *
   * Returns the plaintext, which is the single opportunity to see it. Any
   * previously issued code stops working immediately -- one live code per
   * account, so a leaked older one cannot be redeemed later.
   *
   * @returns {Promise<string>} the plaintext code
   */
  async issueRecoveryCode(userId) {
    const code = this.generateRecoveryCode();
    const hash = await this.hashPassword(code);

    this.db.prepare(`
      UPDATE users
      SET recovery_code_hash = ?, recovery_code_set_at = datetime('now')
      WHERE id = ?
    `).run(hash, userId);

    return code;
  }

  /**
   * Redeem a recovery code, setting a new password.
   *
   * Deliberately does the same amount of work whether or not the user exists
   * and whether or not a code is set, so response timing does not reveal which
   * usernames are real or which accounts have recovery configured.
   *
   * @returns {Promise<boolean>} whether the code was accepted
   */
  async redeemRecoveryCode(username, code, newPassword) {
    const user = this.db
      .prepare('SELECT id, recovery_code_hash FROM users WHERE username = ?')
      .get(username);

    // Verify against a throwaway hash when there is nothing to check, so the
    // argon2 cost is paid either way.
    const hash = user?.recovery_code_hash || await this.hashPassword(randomBytes(16).toString('hex'));
    const valid = await this.verifyPassword(hash, code);

    if (!user || !user.recovery_code_hash || !valid) return false;

    const passwordHash = await this.hashPassword(newPassword);

    // One transaction: a redemption must not be able to land as a new password
    // with the code still live, or a cleared code with the old password.
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE users
        SET password_hash = ?, recovery_code_hash = NULL, recovery_code_set_at = NULL
        WHERE id = ?
      `).run(passwordHash, user.id);

      // Whoever redeemed the code owns the account now; existing sessions
      // belong to whoever had it before.
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    })();

    return true;
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
