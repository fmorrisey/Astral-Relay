import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession } from '../../helpers/fixtures.js';

describe('POST /api/auth/change-password', () => {
  let app, user, sessionId;

  afterEach(async () => {
    if (app) await app.close();
  });

  // createTestUser hashes a known password; set one explicitly so the current
  // password can be proven rather than assumed.
  async function setup(password = 'the-old-password') {
    app = await buildFastify();
    user = createTestUser(app.db, { username: 'owner' });
    const hash = await app.authService.hashPassword(password);
    app.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    sessionId = createTestSession(app.db, user.id);
  }

  function change(payload, cookie = sessionId) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload,
      ...(cookie ? { cookies: { session: cookie } } : {})
    });
  }

  function login(password) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'owner', password }
    });
  }

  it('rejects unauthenticated requests', async () => {
    await setup();

    const response = await change(
      { currentPassword: 'the-old-password', newPassword: 'a-new-password' },
      null
    );

    assert.strictEqual(response.statusCode, 401);
    assert.strictEqual((await login('the-old-password')).statusCode, 200);
  });

  it('changes the password when the current one is correct', async () => {
    await setup();

    const response = await change({
      currentPassword: 'the-old-password',
      newPassword: 'a-brand-new-password'
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual((await login('a-brand-new-password')).statusCode, 200);
    assert.strictEqual((await login('the-old-password')).statusCode, 401);
  });

  it('rejects a wrong current password and changes nothing', async () => {
    await setup();

    const response = await change({
      currentPassword: 'not-the-password',
      newPassword: 'attacker-chosen-pw'
    });

    assert.strictEqual(response.statusCode, 401);
    assert.match(JSON.parse(response.body).error, /Current password/);
    assert.strictEqual((await login('the-old-password')).statusCode, 200);
    assert.strictEqual((await login('attacker-chosen-pw')).statusCode, 401);
  });

  it('enforces the new-password minimum', async () => {
    await setup();

    const response = await change({ currentPassword: 'the-old-password', newPassword: 'short' });

    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual((await login('the-old-password')).statusCode, 200);
  });

  describe('session handling', () => {
    // The point of changing a password is revoking access from a device you no
    // longer control; leaving its session alive would defeat that.
    it('signs out other sessions', async () => {
      await setup();
      const otherDevice = createTestSession(app.db, user.id);

      const response = await change({
        currentPassword: 'the-old-password',
        newPassword: 'a-brand-new-password'
      });

      assert.strictEqual(JSON.parse(response.body).sessionsRevoked, 1);
      const me = await app.inject({
        method: 'GET', url: '/api/auth/me', cookies: { session: otherDevice }
      });
      assert.strictEqual(me.statusCode, 401);
    });

    // Signing out the tab that just changed the password reads as a failure.
    it('keeps the session that made the request', async () => {
      await setup();

      await change({ currentPassword: 'the-old-password', newPassword: 'a-brand-new-password' });

      const me = await app.inject({
        method: 'GET', url: '/api/auth/me', cookies: { session: sessionId }
      });
      assert.strictEqual(me.statusCode, 200);
    });

    it('leaves other users\' sessions alone', async () => {
      await setup();
      const other = createTestUser(app.db, { username: 'someoneelse' });
      const otherSession = createTestSession(app.db, other.id);

      await change({ currentPassword: 'the-old-password', newPassword: 'a-brand-new-password' });

      const me = await app.inject({
        method: 'GET', url: '/api/auth/me', cookies: { session: otherSession }
      });
      assert.strictEqual(me.statusCode, 200);
    });
  });
});
