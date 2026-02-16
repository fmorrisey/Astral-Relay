import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TestDB } from '../../helpers/db.js';
import { AuthService } from '../../../src/services/auth.js';
import { User } from '../../../src/models/User.js';

describe('AuthService', () => {
  let db, authService, userModel, testUser;

  beforeEach(async () => {
    db = new TestDB();
    authService = new AuthService(db);
    userModel = new User(db);

    // Create a test user
    testUser = userModel.create({
      username: 'testuser',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'
    });
  });

  describe('hashPassword', () => {
    it('hashes a password', async () => {
      const hash = await authService.hashPassword('password123');

      assert.ok(hash);
      assert.ok(hash.startsWith('$argon2'));
      assert.notStrictEqual(hash, 'password123');
    });

    it('generates different hashes for same password', async () => {
      const hash1 = await authService.hashPassword('password123');
      const hash2 = await authService.hashPassword('password123');

      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('verifyPassword', () => {
    it('verifies correct password', async () => {
      const hash = await authService.hashPassword('correctpassword');
      const isValid = await authService.verifyPassword(hash, 'correctpassword');

      assert.strictEqual(isValid, true);
    });

    it('rejects incorrect password', async () => {
      const hash = await authService.hashPassword('correctpassword');
      const isValid = await authService.verifyPassword(hash, 'wrongpassword');

      assert.strictEqual(isValid, false);
    });

    it('handles invalid hash gracefully', async () => {
      const isValid = await authService.verifyPassword('invalid-hash', 'password');

      assert.strictEqual(isValid, false);
    });
  });

  describe('generateRecoveryCode', () => {
    it('generates recovery code with correct format', () => {
      const code = authService.generateRecoveryCode();

      assert.ok(code.startsWith('RELAY-'));
      assert.match(code, /^RELAY-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    });

    it('generates unique codes', () => {
      const code1 = authService.generateRecoveryCode();
      const code2 = authService.generateRecoveryCode();

      assert.notStrictEqual(code1, code2);
    });
  });

  describe('createSession', () => {
    it('creates a new session', () => {
      const { sessionId, expiresAt } = authService.createSession(testUser.id);

      assert.ok(sessionId);
      assert.ok(expiresAt instanceof Date);
      assert.strictEqual(sessionId.length, 64); // 32 bytes hex = 64 chars
    });

    it('stores user agent and IP address', () => {
      const { sessionId } = authService.createSession(
        testUser.id,
        'Mozilla/5.0',
        '127.0.0.1'
      );

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      assert.strictEqual(session.user_agent, 'Mozilla/5.0');
      assert.strictEqual(session.ip_address, '127.0.0.1');
    });

    it('sets expiration to 7 days in future', () => {
      const { expiresAt } = authService.createSession(testUser.id);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const expectedExpiry = Date.now() + sevenDays;

      // Allow 1 second tolerance for test execution time
      assert.ok(Math.abs(expiresAt.getTime() - expectedExpiry) < 1000);
    });
  });

  describe('validateSession', () => {
    it('validates active session', () => {
      const { sessionId } = authService.createSession(testUser.id);
      const session = authService.validateSession(sessionId);

      assert.ok(session);
      assert.strictEqual(session.user_id, testUser.id);
      assert.strictEqual(session.username, 'testuser');
    });

    it('returns null for non-existent session', () => {
      const session = authService.validateSession('non-existent-session-id');
      assert.strictEqual(session, undefined);
    });

    it('returns null for expired session', () => {
      const { sessionId } = authService.createSession(testUser.id);

      // Manually expire the session
      db.prepare(`
        UPDATE sessions
        SET expires_at = datetime('now', '-1 day')
        WHERE id = ?
      `).run(sessionId);

      const session = authService.validateSession(sessionId);
      assert.strictEqual(session, undefined);
    });

    it('updates last activity timestamp', () => {
      const { sessionId } = authService.createSession(testUser.id);

      const before = db.prepare('SELECT last_activity FROM sessions WHERE id = ?').get(sessionId);
      authService.validateSession(sessionId);
      const after = db.prepare('SELECT last_activity FROM sessions WHERE id = ?').get(sessionId);

      // Verify last_activity was set/updated (allow same value due to second precision)
      assert.ok(after.last_activity);
      assert.ok(after.last_activity >= before.last_activity);
    });
  });

  describe('deleteSession', () => {
    it('deletes a session', () => {
      const { sessionId } = authService.createSession(testUser.id);

      authService.deleteSession(sessionId);

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      assert.strictEqual(session, undefined);
    });

    it('does not throw for non-existent session', () => {
      assert.doesNotThrow(() => {
        authService.deleteSession('non-existent');
      });
    });
  });

  describe('cleanExpiredSessions', () => {
    it('removes expired sessions', () => {
      const { sessionId } = authService.createSession(testUser.id);

      // Expire the session
      db.prepare(`
        UPDATE sessions
        SET expires_at = datetime('now', '-1 day')
        WHERE id = ?
      `).run(sessionId);

      const cleaned = authService.cleanExpiredSessions();
      assert.strictEqual(cleaned, 1);

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      assert.strictEqual(session, undefined);
    });

    it('keeps active sessions', () => {
      const { sessionId } = authService.createSession(testUser.id);

      const cleaned = authService.cleanExpiredSessions();
      assert.strictEqual(cleaned, 0);

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      assert.ok(session);
    });

    it('returns count of cleaned sessions', () => {
      authService.createSession(testUser.id);
      authService.createSession(testUser.id);

      // Expire all sessions
      db.prepare(`
        UPDATE sessions
        SET expires_at = datetime('now', '-1 day')
      `).run();

      const cleaned = authService.cleanExpiredSessions();
      assert.strictEqual(cleaned, 2);
    });
  });
});
