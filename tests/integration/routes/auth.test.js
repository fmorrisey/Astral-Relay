import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession } from '../../helpers/fixtures.js';

describe('POST /api/auth/setup', () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('completes initial setup', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin',
        password: 'password123',
        displayName: 'Administrator'
      }
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.ok(body.user);
    assert.strictEqual(body.user.username, 'admin');
    assert.ok(body.recoveryCode);
    assert.match(body.recoveryCode, /^RELAY-/);
  });

  it('sets session cookie on setup', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin',
        password: 'password123'
      }
    });

    const cookies = response.cookies;
    assert.ok(cookies.find(c => c.name === 'session'));
  });

  it('rejects setup when already completed', async () => {
    app = await buildFastify();

    // Mark setup as complete
    app.db.prepare(`
      INSERT OR REPLACE INTO config (key, value)
      VALUES ('setup_complete', 'true')
    `).run();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin',
        password: 'password123'
      }
    });

    assert.strictEqual(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /already completed/i);
  });

  it('accepts optional collections', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin',
        password: 'password123',
        collections: ['blog', 'docs']
      }
    });

    assert.strictEqual(response.statusCode, 200);
  });
});

describe('POST /api/auth/login', () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('logs in with valid credentials', async () => {
    app = await buildFastify();

    // Hash a password
    const passwordHash = await app.authService.hashPassword('password123');
    createTestUser(app.db, { username: 'testuser', passwordHash });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'testuser',
        password: 'password123'
      }
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.user.username, 'testuser');
  });

  it('sets session cookie on login', async () => {
    app = await buildFastify();

    const passwordHash = await app.authService.hashPassword('password123');
    createTestUser(app.db, { username: 'testuser', passwordHash });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'testuser',
        password: 'password123'
      }
    });

    const cookies = response.cookies;
    assert.ok(cookies.find(c => c.name === 'session'));
  });

  it('rejects invalid username', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'nonexistent',
        password: 'password123'
      }
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.match(body.error, /invalid credentials/i);
  });

  it('rejects invalid password', async () => {
    app = await buildFastify();

    const passwordHash = await app.authService.hashPassword('correctpassword');
    createTestUser(app.db, { username: 'testuser', passwordHash });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'testuser',
        password: 'wrongpassword'
      }
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.match(body.error, /invalid credentials/i);
  });

  it('validates request body', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'ab', // Too short
        password: 'short' // Too short
      }
    });

    assert.strictEqual(response.statusCode, 400);
  });
});

describe('GET /api/auth/me', () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns authenticated user', async () => {
    app = await buildFastify();

    const user = createTestUser(app.db, { username: 'testuser' });
    const sessionId = createTestSession(app.db, user.id);

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { session: sessionId }
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.user.username, 'testuser');
  });

  it('returns 401 without session cookie', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me'
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.match(body.error, /not authenticated/i);
  });

  it('returns 401 for invalid session', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { session: 'invalid-session-id' }
    });

    assert.strictEqual(response.statusCode, 401);
  });
});

describe('POST /api/auth/logout', () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('logs out successfully', async () => {
    app = await buildFastify();

    const user = createTestUser(app.db, { username: 'testuser' });
    const sessionId = createTestSession(app.db, user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { session: sessionId }
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
  });

  it('clears session cookie', async () => {
    app = await buildFastify();

    const user = createTestUser(app.db, { username: 'testuser' });
    const sessionId = createTestSession(app.db, user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { session: sessionId }
    });

    const cookies = response.cookies;
    const sessionCookie = cookies.find(c => c.name === 'session');
    assert.ok(sessionCookie);
    assert.ok(sessionCookie.value === '' || sessionCookie.expires < new Date());
  });

  it('deletes session from database', async () => {
    app = await buildFastify();

    const user = createTestUser(app.db, { username: 'testuser' });
    const sessionId = createTestSession(app.db, user.id);

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { session: sessionId }
    });

    const session = app.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    assert.strictEqual(session, undefined);
  });

  it('succeeds even without session cookie', async () => {
    app = await buildFastify();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout'
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, true);
  });
});
