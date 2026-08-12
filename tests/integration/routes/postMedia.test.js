import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession, createTestPost } from '../../helpers/fixtures.js';

describe('Post media', () => {
  let app, user, session, post;

  function makeMedia(id, storagePath, alt = null) {
    app.db.prepare(`
      INSERT INTO media (id, filename, original_filename, mime_type, size_bytes,
                         width, height, storage_path, alt_text, created_by)
      VALUES (?, ?, ?, 'image/jpeg', 1000, 2400, 1600, ?, ?, ?)
    `).run(id, `${id}.jpg`, `${id}.jpg`, storagePath, alt, user.id);
    return id;
  }

  beforeEach(async () => {
    app = await buildFastify();
    user = createTestUser(app.db, { username: 'owner' });
    session = createTestSession(app.db, user.id);
    post = createTestPost(app.db, user.id);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  const as = { cookies: { session: () => session } };
  const req = (method, url, payload) => app.inject({
    method, url, ...(payload ? { payload } : {}), cookies: { session }
  });

  it('starts with nothing attached', async () => {
    const res = await req('GET', `/api/posts/${post.id}/media`);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(res.body).media,
      { hero: null, cover: null, gallery: [], managed: false });
  });

  // The editor renders these. `url` is the published-site path and resolves to
  // nothing inside the CMS, which is what made every image in the grid broken.
  it('returns CMS-servable urls alongside the published-site path', async () => {
    makeMedia('m1', 'media/2026/08/a.jpg');
    await req('PUT', `/api/posts/${post.id}/media`, { heroMediaId: 'm1', gallery: [{ mediaId: 'm1' }] });

    const { media } = JSON.parse((await req('GET', `/api/posts/${post.id}/media`)).body);

    assert.strictEqual(media.hero.url, '/media/2026/08/a.jpg');
    assert.strictEqual(media.hero.thumbnailUrl, '/api/media/m1/thumbnail');
    assert.strictEqual(media.hero.fileUrl, '/api/media/m1/file');
    assert.strictEqual(media.gallery[0].thumbnailUrl, '/api/media/m1/thumbnail');
  });

  it('sets the hero and cover slots', async () => {
    const a = makeMedia('m-hero', 'media/2026/08/a.jpg');
    const b = makeMedia('m-cover', 'media/2026/08/b.jpg');

    const res = await req('PUT', `/api/posts/${post.id}/media`, { heroMediaId: a, coverMediaId: b });

    assert.strictEqual(res.statusCode, 200);
    const { media } = JSON.parse(res.body);
    assert.strictEqual(media.hero.url, '/media/2026/08/a.jpg');
    assert.strictEqual(media.cover.url, '/media/2026/08/b.jpg');
  });

  it('clears a slot with null but leaves an omitted one alone', async () => {
    const a = makeMedia('m-hero', 'media/2026/08/a.jpg');
    const b = makeMedia('m-cover', 'media/2026/08/b.jpg');
    await req('PUT', `/api/posts/${post.id}/media`, { heroMediaId: a, coverMediaId: b });

    const res = await req('PUT', `/api/posts/${post.id}/media`, { heroMediaId: null });

    const { media } = JSON.parse(res.body);
    assert.strictEqual(media.hero, null);
    assert.ok(media.cover, 'cover was omitted, so it should be untouched');
  });

  describe('gallery', () => {
    it('keeps the order it was given', async () => {
      const ids = ['m1', 'm2', 'm3'].map((id, i) => makeMedia(id, `media/2026/08/${id}.jpg`));

      const res = await req('PUT', `/api/posts/${post.id}/media`, {
        gallery: [{ mediaId: 'm3' }, { mediaId: 'm1' }, { mediaId: 'm2' }]
      });

      const { media } = JSON.parse(res.body);
      assert.deepStrictEqual(media.gallery.map(g => g.id), ['m3', 'm1', 'm2']);
    });

    it('replaces the whole set rather than appending', async () => {
      makeMedia('m1', 'media/2026/08/m1.jpg');
      makeMedia('m2', 'media/2026/08/m2.jpg');
      await req('PUT', `/api/posts/${post.id}/media`, { gallery: [{ mediaId: 'm1' }, { mediaId: 'm2' }] });

      const res = await req('PUT', `/api/posts/${post.id}/media`, { gallery: [{ mediaId: 'm2' }] });

      assert.deepStrictEqual(JSON.parse(res.body).media.gallery.map(g => g.id), ['m2']);
    });

    // Alt belongs to the use, not the image: the same photo captioned for one
    // story reads wrong in another.
    it('stores alt text per use, falling back to the image default', async () => {
      makeMedia('m1', 'media/2026/08/m1.jpg', 'default caption');
      makeMedia('m2', 'media/2026/08/m2.jpg', 'default caption');

      const res = await req('PUT', `/api/posts/${post.id}/media`, {
        gallery: [{ mediaId: 'm1', alt: 'specific to this post' }, { mediaId: 'm2' }]
      });

      const { media } = JSON.parse(res.body);
      assert.strictEqual(media.gallery[0].alt, 'specific to this post');
      assert.strictEqual(media.gallery[1].alt, 'default caption');
    });
  });

  // post_media is keyed (post_id, media_id), so a repeated id was a primary-key
  // violation surfacing as a 500.
  it('deduplicates a repeated image rather than failing', async () => {
    makeMedia('m1', 'media/2026/08/m1.jpg');
    makeMedia('m2', 'media/2026/08/m2.jpg');

    const res = await req('PUT', `/api/posts/${post.id}/media`, {
      gallery: [{ mediaId: 'm1' }, { mediaId: 'm2' }, { mediaId: 'm1' }]
    });

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(res.body).media.gallery.map(g => g.id), ['m1', 'm2']);
  });

  describe('alt text semantics', () => {
    // Three states, not two: inherit, explicit text, and explicitly none.
    it('distinguishes an explicit empty alt from an inherited one', async () => {
      makeMedia('m1', 'media/2026/08/m1.jpg', 'the image default');
      makeMedia('m2', 'media/2026/08/m2.jpg', 'the image default');

      const res = await req('PUT', `/api/posts/${post.id}/media`, {
        gallery: [{ mediaId: 'm1', alt: '' }, { mediaId: 'm2' }]
      });

      const { gallery } = JSON.parse(res.body).media;
      assert.strictEqual(gallery[0].alt, '', 'explicit empty stays empty');
      assert.strictEqual(gallery[0].altIsInherited, false);
      assert.strictEqual(gallery[1].alt, 'the image default');
      assert.strictEqual(gallery[1].altIsInherited, true);
    });

    // The editor reads a resolved alt and writes it back; if inheritance were
    // materialised, later edits to the image's own alt would stop propagating.
    it('keeps inheriting after a save that did not set an override', async () => {
      makeMedia('m1', 'media/2026/08/m1.jpg', 'first caption');
      await req('PUT', `/api/posts/${post.id}/media`, { gallery: [{ mediaId: 'm1' }] });

      app.db.prepare("UPDATE media SET alt_text = 'edited later' WHERE id = 'm1'").run();

      const res = await req('GET', `/api/posts/${post.id}/media`);
      assert.strictEqual(JSON.parse(res.body).media.gallery[0].alt, 'edited later');
    });
  });

  describe('rejections', () => {
    it('refuses an image id that does not exist, changing nothing', async () => {
      makeMedia('m1', 'media/2026/08/m1.jpg');
      await req('PUT', `/api/posts/${post.id}/media`, { gallery: [{ mediaId: 'm1' }] });

      const res = await req('PUT', `/api/posts/${post.id}/media`, {
        gallery: [{ mediaId: 'm1' }, { mediaId: 'does-not-exist' }]
      });

      assert.strictEqual(res.statusCode, 400);
      // A gallery half-applied because one id was stale is worse than a refusal.
      const after = await req('GET', `/api/posts/${post.id}/media`);
      assert.deepStrictEqual(JSON.parse(after.body).media.gallery.map(g => g.id), ['m1']);
    });

    it('answers 400, not 500, when the body is missing', async () => {
      const res = await req('PUT', `/api/posts/${post.id}/media`);
      assert.strictEqual(res.statusCode, 400);
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/posts/${post.id}/media` });
      assert.strictEqual(res.statusCode, 401);
    });

    it("refuses an author editing someone else's post images", async () => {
      const other = createTestUser(app.db, { username: 'someoneelse', role: 'author' });
      const otherSession = createTestSession(app.db, other.id);

      const res = await app.inject({
        method: 'PUT', url: `/api/posts/${post.id}/media`,
        payload: { gallery: [] }, cookies: { session: otherSession }
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('404s for a post that does not exist', async () => {
      const res = await req('GET', '/api/posts/no-such-post/media');
      assert.strictEqual(res.statusCode, 404);
    });
  });
});
