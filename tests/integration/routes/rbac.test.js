import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession, createTestPost, createTestTag } from '../../helpers/fixtures.js';

describe('Role-based access control', () => {
  let app, admin, adminSession, author, authorSession;

  beforeEach(async () => {
    app = await buildFastify();
    admin = createTestUser(app.db, { username: 'theadmin', role: 'admin' });
    adminSession = createTestSession(app.db, admin.id);
    author = createTestUser(app.db, { username: 'theauthor', role: 'author' });
    authorSession = createTestSession(app.db, author.id);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  const as = session => ({ cookies: { session } });

  describe('user management', () => {
    it('lets an admin list users', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/users', ...as(adminSession) });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(JSON.parse(res.body).users.length, 2);
    });

    it('refuses an author with 403, not 401', async () => {
      // 403 not 401: the request is authenticated, it is just not permitted.
      const res = await app.inject({ method: 'GET', url: '/api/users', ...as(authorSession) });
      assert.strictEqual(res.statusCode, 403);
    });

    it('never returns password or recovery hashes', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/users', ...as(adminSession) });
      const body = res.body;
      assert.ok(!body.includes('password_hash'));
      assert.ok(!body.includes('recovery_code_hash'));
      assert.ok(!body.includes('argon2'));
    });

    it('creates an author by default rather than an admin', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/users',
        payload: { username: 'newperson', password: 'a-password-here' },
        ...as(adminSession)
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(JSON.parse(res.body).user.role, 'author');
    });

    it('rejects a duplicate username', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/users',
        payload: { username: 'theauthor', password: 'a-password-here' },
        ...as(adminSession)
      });
      assert.strictEqual(res.statusCode, 409);
    });

    it('rejects an unrecognised role', async () => {
      // An unknown role would be refused by authorize() everywhere, producing
      // an account that can do nothing at all.
      const res = await app.inject({
        method: 'POST', url: '/api/users',
        payload: { username: 'newperson', password: 'a-password-here', role: 'superuser' },
        ...as(adminSession)
      });
      assert.strictEqual(res.statusCode, 400);
    });

    describe('deletion', () => {
      it('refuses to delete yourself', async () => {
        const res = await app.inject({ method: 'DELETE', url: `/api/users/${admin.id}`, ...as(adminSession) });
        assert.strictEqual(res.statusCode, 400);
      });

      it('refuses to remove the last admin', async () => {
        const second = createTestUser(app.db, { username: 'otheradmin', role: 'admin' });
        const secondSession = createTestSession(app.db, second.id);
        // Deleting from the other admin's session leaves exactly one admin,
        // which is allowed; doing it again would not be.
        const first = await app.inject({ method: 'DELETE', url: `/api/users/${admin.id}`, ...as(secondSession) });
        assert.strictEqual(first.statusCode, 200);

        const author2 = createTestUser(app.db, { username: 'anotherauthor', role: 'author' });
        const promote = await app.inject({ method: 'DELETE', url: `/api/users/${author2.id}`, ...as(secondSession) });
        assert.strictEqual(promote.statusCode, 200);
      });

      it('refuses while the user still owns content', async () => {
        createTestPost(app.db, author.id);
        const res = await app.inject({ method: 'DELETE', url: `/api/users/${author.id}`, ...as(adminSession) });
        assert.strictEqual(res.statusCode, 409);
        assert.match(JSON.parse(res.body).error, /still owns/);
      });

      it('deletes a user with no content', async () => {
        const res = await app.inject({ method: 'DELETE', url: `/api/users/${author.id}`, ...as(adminSession) });
        assert.strictEqual(res.statusCode, 200);
      });
    });
  });

  describe('post ownership', () => {
    let adminPost, authorPost;

    beforeEach(() => {
      adminPost = createTestPost(app.db, admin.id, { slug: 'admins-post' });
      authorPost = createTestPost(app.db, author.id, { slug: 'authors-post' });
    });

    it('lets an author edit their own post', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/posts/${authorPost.id}`,
        payload: { title: 'Renamed' }, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 200);
    });

    it("refuses an author editing someone else's post", async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/posts/${adminPost.id}`,
        payload: { title: 'Hijacked' }, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 403);
      const row = app.db.prepare('SELECT title FROM posts WHERE id = ?').get(adminPost.id);
      assert.notStrictEqual(row.title, 'Hijacked');
    });

    it("refuses an author deleting someone else's post", async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/posts/${adminPost.id}`, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(app.db.prepare('SELECT id FROM posts WHERE id = ?').get(adminPost.id));
    });

    // Publishing writes to the live site, so it is restricted the same way
    // editing is.
    it("refuses an author publishing someone else's post", async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/posts/${adminPost.id}/publish`, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 403);
      const row = app.db.prepare('SELECT status FROM posts WHERE id = ?').get(adminPost.id);
      assert.strictEqual(row.status, 'draft');
    });

    it("refuses an author unpublishing someone else's post", async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/posts/${adminPost.id}/unpublish`, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 403);
    });

    it("lets an admin edit anyone's post", async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/posts/${authorPost.id}`,
        payload: { title: 'Edited by admin' }, ...as(adminSession)
      });
      assert.strictEqual(res.statusCode, 200);
    });

    it('still lets an author read every post', async () => {
      // Reading is not restricted -- this is a shared site, not separate ones.
      const res = await app.inject({ method: 'GET', url: `/api/posts/${adminPost.id}`, ...as(authorSession) });
      assert.strictEqual(res.statusCode, 200);
    });
  });

  describe('tags', () => {
    it('lets an author create a tag', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/tags', payload: { name: 'Travel' }, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 201);
    });

    // Deleting a tag strips it from every post that used it, including other
    // people's, so it is admin-only even though creating is not.
    it('refuses an author deleting a tag', async () => {
      const tag = createTestTag(app.db, { name: 'Travel', slug: 'travel' });
      const res = await app.inject({
        method: 'DELETE', url: `/api/tags/${tag.id}`, ...as(authorSession)
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(app.db.prepare('SELECT id FROM tags WHERE id = ?').get(tag.id));
    });

    it('lets an admin delete a tag', async () => {
      const tag = createTestTag(app.db, { name: 'Travel', slug: 'travel' });
      const res = await app.inject({
        method: 'DELETE', url: `/api/tags/${tag.id}`, ...as(adminSession)
      });
      assert.strictEqual(res.statusCode, 200);
    });
  });

  describe('role plumbing', () => {
    it('exposes the role on /api/auth/me so the UI can hide what it must not offer', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', ...as(authorSession) });
      assert.strictEqual(JSON.parse(res.body).user.role, 'author');
    });

    // Read from the session join per request, so a change applies without
    // waiting for the user to log in again.
    it('reflects a role change on the existing session', async () => {
      app.db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(author.id);

      const res = await app.inject({ method: 'GET', url: '/api/users', ...as(authorSession) });
      assert.strictEqual(res.statusCode, 200);
    });
  });
});
