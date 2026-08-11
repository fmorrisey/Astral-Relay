import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession } from '../../helpers/fixtures.js';

describe('Setup routes', () => {
  let app, user, sessionId;

  async function setupAuth() {
    app = await buildFastify();
    user = createTestUser(app.db, { username: 'testuser' });
    sessionId = createTestSession(app.db, user.id);
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/setup/status', () => {
    // Deliberately public. If this ever starts returning 401 the frontend can no
    // longer tell a fresh install from a configured one, and the setup wizard
    // becomes unreachable -- so this test is guarding the exemption, not an oversight.
    it('is reachable without a session', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/status'
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok('setupComplete' in body);
    });
  });

  describe('GET /api/setup/collections', () => {
    it('requires authentication', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/collections'
      });

      assert.strictEqual(response.statusCode, 401);
    });

    it('returns collections when authenticated', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/collections',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.deepStrictEqual(body.collections, ['blog']);
    });
  });

  describe('POST /api/setup/validate', () => {
    it('requires authentication', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/setup/validate',
        payload: { workspacePath: '/tmp' }
      });

      assert.strictEqual(response.statusCode, 401);
    });

    // Asserts the 401 above is the auth gate rejecting the request, not the
    // handler happening to reject that payload for its own reasons.
    it('does not disclose whether a path exists when unauthenticated', async () => {
      await setupAuth();

      const missing = await app.inject({
        method: 'POST',
        url: '/api/setup/validate',
        payload: { workspacePath: '/definitely/not/a/real/path' }
      });
      const existing = await app.inject({
        method: 'POST',
        url: '/api/setup/validate',
        payload: { workspacePath: '/tmp' }
      });

      assert.strictEqual(missing.statusCode, 401);
      assert.strictEqual(existing.statusCode, 401);
      assert.strictEqual(missing.body, existing.body);
    });

    it('runs the workspace checks when authenticated', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/setup/validate',
        payload: { workspacePath: '/definitely/not/a/real/path' },
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 400);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.valid, false);
      assert.ok(body.errors.includes('Workspace path does not exist'));
    });
  });
});
