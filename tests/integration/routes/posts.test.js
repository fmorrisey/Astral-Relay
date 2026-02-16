import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession, createTestPost } from '../../helpers/fixtures.js';

describe('Post routes', () => {
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

  describe('GET /api/posts', () => {
    it('lists posts', async () => {
      await setupAuth();
      createTestPost(app.db, user.id, { title: 'Post 1' });
      createTestPost(app.db, user.id, { title: 'Post 2', slug: 'post-2' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.posts.length, 2);
      assert.strictEqual(body.total, 2);
    });

    it('filters by status', async () => {
      await setupAuth();
      createTestPost(app.db, user.id, { status: 'draft', slug: 'draft' });
      createTestPost(app.db, user.id, {
        status: 'published',
        slug: 'published',
        publishedAt: new Date().toISOString()
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts?status=draft',
        cookies: { session: sessionId }
      });

      const body = JSON.parse(response.body);
      assert.strictEqual(body.posts.length, 1);
      assert.strictEqual(body.posts[0].status, 'draft');
    });

    it('filters by collection', async () => {
      await setupAuth();
      createTestPost(app.db, user.id, { collection: 'blog', slug: 'blog' });
      createTestPost(app.db, user.id, { collection: 'docs', slug: 'docs' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts?collection=blog',
        cookies: { session: sessionId }
      });

      const body = JSON.parse(response.body);
      assert.strictEqual(body.posts.length, 1);
      assert.strictEqual(body.posts[0].collection, 'blog');
    });

    it('requires authentication', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts'
      });

      assert.strictEqual(response.statusCode, 401);
    });

    it('supports pagination', async () => {
      await setupAuth();
      for (let i = 0; i < 5; i++) {
        createTestPost(app.db, user.id, { slug: `post-${i}` });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts?limit=2&offset=1',
        cookies: { session: sessionId }
      });

      const body = JSON.parse(response.body);
      assert.strictEqual(body.posts.length, 2);
      assert.strictEqual(body.total, 5);
      assert.strictEqual(body.limit, 2);
      assert.strictEqual(body.offset, 1);
    });
  });

  describe('GET /api/posts/:id', () => {
    it('gets a single post', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id, { title: 'Test Post' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${post.id}`,
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.post.id, post.id);
      assert.strictEqual(body.post.title, 'Test Post');
    });

    it('returns 404 for non-existent post', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts/non-existent-id',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 404);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${post.id}`
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('POST /api/posts', () => {
    it('creates a new post', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        cookies: { session: sessionId },
        payload: {
          collection: 'blog',
          title: 'New Post',
          body: 'This is the body',
          summary: 'A summary'
        }
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.post.title, 'New Post');
      assert.strictEqual(body.post.slug, 'new-post');
      assert.strictEqual(body.post.status, 'draft');
    });

    it('creates post with tags', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        cookies: { session: sessionId },
        payload: {
          collection: 'blog',
          title: 'Tagged Post',
          body: 'Body',
          tags: ['javascript', 'nodejs']
        }
      });

      assert.strictEqual(response.statusCode, 201);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.post.tags.length, 2);
    });

    it('validates request body', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        cookies: { session: sessionId },
        payload: {
          title: 'Missing required fields'
        }
      });

      assert.strictEqual(response.statusCode, 400);
    });

    it('requires authentication', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        payload: {
          collection: 'blog',
          title: 'Test',
          body: 'Body'
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('PUT /api/posts/:id', () => {
    it('updates a post', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id, { title: 'Original' });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/posts/${post.id}`,
        cookies: { session: sessionId },
        payload: {
          title: 'Updated Title',
          body: 'Updated body'
        }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.post.title, 'Updated Title');
      assert.strictEqual(body.post.body, 'Updated body');
    });

    it('returns 404 for non-existent post', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'PUT',
        url: '/api/posts/non-existent',
        cookies: { session: sessionId },
        payload: {
          title: 'Updated'
        }
      });

      assert.strictEqual(response.statusCode, 404);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/posts/${post.id}`,
        payload: {
          title: 'Updated'
        }
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('POST /api/posts/:id/publish', () => {
    it('publishes a post', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${post.id}/publish`,
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.post.status, 'published');
      assert.ok(body.post.publishedAt);
    });

    it('accepts custom publish date', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);
      const customDate = '2024-01-01T00:00:00.000Z';

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${post.id}/publish`,
        cookies: { session: sessionId },
        payload: {
          publishedAt: customDate
        }
      });

      const body = JSON.parse(response.body);
      assert.strictEqual(body.post.publishedAt, customDate);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${post.id}/publish`
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('POST /api/posts/:id/unpublish', () => {
    it('unpublishes a post', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id, {
        status: 'published',
        publishedAt: new Date().toISOString()
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${post.id}/unpublish`,
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.post.status, 'draft');
    });

    it('returns 404 for non-existent post', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts/non-existent/unpublish',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 404);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${post.id}/unpublish`
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    it('deletes a post', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${post.id}`,
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.strictEqual(body.success, true);

      // Verify post is deleted
      const deleted = app.postModel.findById(post.id);
      assert.strictEqual(deleted, null);
    });

    it('returns 404 for non-existent post', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/posts/non-existent',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 404);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${post.id}`
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });

  describe('GET /api/posts/:id/versions', () => {
    it('gets post version history', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${post.id}/versions`,
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body);
      assert.ok(Array.isArray(body.versions));
      assert.strictEqual(body.versions.length, 1); // Initial version
    });

    it('returns 404 for non-existent post', async () => {
      await setupAuth();

      const response = await app.inject({
        method: 'GET',
        url: '/api/posts/non-existent/versions',
        cookies: { session: sessionId }
      });

      assert.strictEqual(response.statusCode, 404);
    });

    it('requires authentication', async () => {
      await setupAuth();
      const post = createTestPost(app.db, user.id);

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${post.id}/versions`
      });

      assert.strictEqual(response.statusCode, 401);
    });
  });
});
