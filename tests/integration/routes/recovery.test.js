import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession } from '../../helpers/fixtures.js';

describe('Recovery codes', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function setup() {
    app = await buildFastify();
    return createTestUser(app.db, { username: 'owner' });
  }

  async function issueFor(user) {
    return app.authService.issueRecoveryCode(user.id);
  }

  function recover(payload) {
    return app.inject({ method: 'POST', url: '/api/auth/recover', payload });
  }

  it('stores only a hash, never the code itself', async () => {
    const user = await setup();
    const code = await issueFor(user);

    const row = app.db.prepare('SELECT recovery_code_hash FROM users WHERE id = ?').get(user.id);
    assert.ok(row.recovery_code_hash);
    assert.ok(!row.recovery_code_hash.includes(code));
    assert.ok(row.recovery_code_hash.startsWith('$argon2id$'));
  });

  it('accepts a valid code and sets the new password', async () => {
    const user = await setup();
    const code = await issueFor(user);

    const response = await recover({
      username: 'owner',
      recoveryCode: code,
      newPassword: 'a-brand-new-password'
    });

    assert.strictEqual(response.statusCode, 200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'owner', password: 'a-brand-new-password' }
    });
    assert.strictEqual(login.statusCode, 200);
  });

  it('is single use', async () => {
    const user = await setup();
    const code = await issueFor(user);

    await recover({ username: 'owner', recoveryCode: code, newPassword: 'first-new-password' });
    const second = await recover({ username: 'owner', recoveryCode: code, newPassword: 'second-attempt-pw' });

    assert.strictEqual(second.statusCode, 401);
    // The first password must still be the live one.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'owner', password: 'first-new-password' }
    });
    assert.strictEqual(login.statusCode, 200);
  });

  // Whoever redeems the code owns the account; sessions belong to whoever had
  // it before, including an attacker who knew the old password.
  it('invalidates every existing session', async () => {
    const user = await setup();
    const sessionId = createTestSession(app.db, user.id);
    const code = await issueFor(user);

    await recover({ username: 'owner', recoveryCode: code, newPassword: 'a-brand-new-password' });

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { session: sessionId }
    });
    assert.strictEqual(me.statusCode, 401);
  });

  it('issuing a new code invalidates the previous one', async () => {
    const user = await setup();
    const first = await issueFor(user);
    await issueFor(user);

    const response = await recover({
      username: 'owner',
      recoveryCode: first,
      newPassword: 'a-brand-new-password'
    });

    assert.strictEqual(response.statusCode, 401);
  });

  describe('rejections', () => {
    // Every failure must look identical, or the response tells an attacker
    // which usernames exist and which accounts have recovery configured.
    it('gives the same response for a wrong code, unknown user, and no code set', async () => {
      const user = await setup();
      await issueFor(user);

      const wrongCode = await recover({
        username: 'owner', recoveryCode: 'RELAY-0000-0000-0000', newPassword: 'a-new-password-x'
      });
      const unknownUser = await recover({
        username: 'nobody', recoveryCode: 'RELAY-0000-0000-0000', newPassword: 'a-new-password-x'
      });

      createTestUser(app.db, { username: 'nocode' });
      const noCodeSet = await recover({
        username: 'nocode', recoveryCode: 'RELAY-0000-0000-0000', newPassword: 'a-new-password-x'
      });

      assert.strictEqual(wrongCode.statusCode, 401);
      assert.strictEqual(unknownUser.statusCode, 401);
      assert.strictEqual(noCodeSet.statusCode, 401);
      assert.strictEqual(wrongCode.body, unknownUser.body);
      assert.strictEqual(wrongCode.body, noCodeSet.body);
    });

    it('leaves the password untouched when the code is wrong', async () => {
      const user = await setup();
      await issueFor(user);

      await recover({
        username: 'owner', recoveryCode: 'RELAY-DEAD-BEEF-0000', newPassword: 'attacker-chosen-pw'
      });

      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'owner', password: 'attacker-chosen-pw' }
      });
      assert.strictEqual(login.statusCode, 401);
    });

    it('enforces the password minimum', async () => {
      const user = await setup();
      const code = await issueFor(user);

      const response = await recover({ username: 'owner', recoveryCode: code, newPassword: 'short' });

      assert.strictEqual(response.statusCode, 400);
      // A rejected request must not burn the code.
      const row = app.db.prepare('SELECT recovery_code_hash FROM users WHERE id = ?').get(user.id);
      assert.ok(row.recovery_code_hash);
    });
  });

  describe('POST /api/auth/recovery-code', () => {
    it('requires a session', async () => {
      await setup();
      const response = await app.inject({ method: 'POST', url: '/api/auth/recovery-code' });
      assert.strictEqual(response.statusCode, 401);
    });

    // Accounts created before codes were stored have none; this is how they get one.
    it('issues a working code to a logged-in user', async () => {
      const user = await setup();
      const sessionId = createTestSession(app.db, user.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/recovery-code',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const { recoveryCode } = JSON.parse(response.body);
      assert.match(recoveryCode, /^RELAY-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

      const redeemed = await recover({
        username: 'owner', recoveryCode, newPassword: 'a-brand-new-password'
      });
      assert.strictEqual(redeemed.statusCode, 200);
    });
  });
});
