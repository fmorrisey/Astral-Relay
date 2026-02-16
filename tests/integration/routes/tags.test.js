import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession, createTestTag } from '../../helpers/fixtures.js';

describe('Tag routes', () => {
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

  describe('GET /api/tags', () => {
    it('lists all tags', async () => {
      await setupAuth();
      createTestTag(app.db, { name: 'JavaScript', slug: 'javascript' });
      createTestTag(app.db, { name: 'Node.js', slug: 'nodejs' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body.tags));
      assert.strictEqual(body.tags.length, 2);
    });

    it('returns empty array when no tags exist', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
        cookies: { session: sessionId }
      });

      const body = JSON.parse(response.body);
      assert.strictEqual(body.tags.length, 0);
    });

    it('requires authentication', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags'
      });

      assert.strictEqual(response.statusCode, 401);
    });

    it('includes post count for each tag', async () => {
      await setupAuth();
      createTestTag(app.db, { name: 'Test', slug: 'test' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
        cookies: { session: sessionId }
      });

      const body = JSON.parse(response.body);
      assert.ok('postCount' in body.tags[0]);
    });
  });

  describe('POST /api/tags', () => {
    it('creates a new tag', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        cookies: { session: sessionId },
        payload: {
          name: 'TypeScript'
        }
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.tag.name, 'TypeScript');
      assert.strictEqual(body.tag.slug, 'typescript');
    });

    it('slugifies tag name', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        cookies: { session: sessionId },
        payload: {
          name: 'Node.js Framework'
        }
      });

      const body = JSON.parse(response.body);
      assert.strictEqual(body.tag.slug, 'nodejs-framework');
    });

    it('rejects duplicate tags', async () => {
      await setupAuth();
      createTestTag(app.db, { name: 'JavaScript', slug: 'javascript' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        cookies: { session: sessionId },
        payload: {
          name: 'javascript' // Different case but same slug
        }
      });

      assert.strictEqual(response.statusCode, 409);
      const body = JSON.parse(response.body);
      // Check that we got some error response
      assert.ok(body.error || body.message, 'Should have an error message');
    });

    it('validates request body', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        cookies: { session: sessionId },
        payload: {
          name: '' // Empty name
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    it('requires authentication', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        payload: {
          name: 'Test'
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('DELETE /api/tags/:id', () => {
    it('deletes a tag', async () => {
      await setupAuth();
      const tag = createTestTag(app.db, { name: 'ToDelete', slug: 'todelete' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${tag.id}`,
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);

      // Verify tag is deleted
      const deleted = app.tagModel.findById(tag.id);
      assert.strictEqual(deleted, null);
    });

    it('returns 404 for non-existent tag', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tags/99999',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 404);
      const body = JSON.parse(response.body);
      assert.match(body.error, /not found/i);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const tag = createTestTag(app.db, { name: 'Test', slug: 'test' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${tag.id}`
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });
});
