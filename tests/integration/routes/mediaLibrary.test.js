import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { buildFastify } from '../../helpers/fastify.js';
import { createTestUser, createTestSession } from '../../helpers/fixtures.js';
import { ThumbnailService } from '../../../src/services/thumbnails.js';

describe('Media library', () => {
  let app, user, session;

  function insertMedia(id, filename, altText = null, owner = user.id) {
    app.db.prepare(`
      INSERT INTO media (id, filename, original_filename, mime_type, size_bytes,
                         width, height, storage_path, alt_text, created_by)
      VALUES (?, ?, ?, 'image/jpeg', 1000, 2400, 1600, ?, ?, ?)
    `).run(id, `${id}.jpg`, filename, `media/2026/08/${id}.jpg`, altText, owner);
  }

  beforeEach(async () => {
    app = await buildFastify();
    user = createTestUser(app.db, { username: 'owner' });
    session = createTestSession(app.db, user.id);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  const req = (method, url, payload) => app.inject({
    method, url, ...(payload ? { payload } : {}), cookies: { session }
  });

  describe('listing', () => {
    beforeEach(() => {
      insertMedia('m1', 'sunset-over-ridge.jpg');
      insertMedia('m2', 'portrait-of-a-dog.jpg');
      insertMedia('m3', 'sunset-again.png');
    });

    it('reports a total alongside the page', async () => {
      const res = await req('GET', '/api/media?limit=2&offset=0');
      const body = JSON.parse(res.body);

      assert.strictEqual(body.media.length, 2);
      assert.strictEqual(body.total, 3);
    });

    it('pages past the first page', async () => {
      const first = JSON.parse((await req('GET', '/api/media?limit=2&offset=0')).body);
      const second = JSON.parse((await req('GET', '/api/media?limit=2&offset=2')).body);

      assert.strictEqual(second.media.length, 1);
      const ids = [...first.media, ...second.media].map(m => m.id);
      assert.strictEqual(new Set(ids).size, 3, 'pages should not overlap');
    });

    it('searches filenames', async () => {
      const res = await req('GET', '/api/media?search=sunset');
      const body = JSON.parse(res.body);

      assert.strictEqual(body.total, 2);
      assert.ok(body.media.every(m => m.originalFilename.includes('sunset')));
    });

    // A filename containing a wildcard should match itself, not everything.
    it('treats LIKE wildcards in the search term literally', async () => {
      insertMedia('m4', '100%-crop.jpg');

      const all = JSON.parse((await req('GET', '/api/media?search=%')).body);

      assert.strictEqual(all.total, 1);
      assert.strictEqual(all.media[0].originalFilename, '100%-crop.jpg');
    });

    it('exposes a thumbnail url for every item', async () => {
      const res = await req('GET', '/api/media');
      const [item] = JSON.parse(res.body).media;

      assert.strictEqual(item.thumbnailUrl, `/api/media/${item.id}/thumbnail`);
    });
  });

  describe('alt text', () => {
    beforeEach(() => insertMedia('m1', 'photo.jpg'));

    it('can be set after upload', async () => {
      const res = await req('PATCH', '/api/media/m1', { altText: 'A dog on a ridge' });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(JSON.parse(res.body).media.altText, 'A dog on a ridge');
    });

    it('can be cleared', async () => {
      await req('PATCH', '/api/media/m1', { altText: 'something' });
      const res = await req('PATCH', '/api/media/m1', { altText: '' });

      assert.strictEqual(JSON.parse(res.body).media.altText, null);
    });

    it('rejects text over the limit', async () => {
      const res = await req('PATCH', '/api/media/m1', { altText: 'x'.repeat(301) });
      assert.strictEqual(res.statusCode, 400);
    });

    it('requires authentication', async () => {
      const res = await app.inject({ method: 'PATCH', url: '/api/media/m1', payload: { altText: 'x' } });
      assert.strictEqual(res.statusCode, 401);
    });

    // The existing coverage missed this: createTestUser defaults to admin, and
    // admins pass the ownership check regardless of whether it works.
    it('lets an author edit their OWN media', async () => {
      const author = createTestUser(app.db, { username: 'writer', role: 'author' });
      const authorSession = createTestSession(app.db, author.id);
      insertMedia('m2', 'theirs.jpg', null, author.id);

      const res = await app.inject({
        method: 'PATCH', url: '/api/media/m2',
        payload: { altText: 'mine to edit' }, cookies: { session: authorSession }
      });

      assert.strictEqual(res.statusCode, 200);
    });

    it('lets an author delete their OWN media', async () => {
      const author = createTestUser(app.db, { username: 'writer2', role: 'author' });
      const authorSession = createTestSession(app.db, author.id);
      insertMedia('m3', 'theirs.jpg', null, author.id);

      const res = await app.inject({
        method: 'DELETE', url: '/api/media/m3', cookies: { session: authorSession }
      });

      assert.notStrictEqual(res.statusCode, 403);
    });

    it('answers 400, not 500, when the body is missing', async () => {
      const res = await req('PATCH', '/api/media/m1');
      assert.strictEqual(res.statusCode, 400);
    });

    it("refuses an author editing someone else's media", async () => {
      const other = createTestUser(app.db, { username: 'someoneelse', role: 'author' });
      const otherSession = createTestSession(app.db, other.id);

      const res = await app.inject({
        method: 'PATCH', url: '/api/media/m1',
        payload: { altText: 'hijacked' }, cookies: { session: otherSession }
      });

      assert.strictEqual(res.statusCode, 403);
    });

    it('404s for an image that does not exist', async () => {
      const res = await req('PATCH', '/api/media/nope', { altText: 'x' });
      assert.strictEqual(res.statusCode, 404);
    });
  });

  describe('thumbnails', () => {
    it('404s when the source file is missing', async () => {
      insertMedia('m1', 'photo.jpg');
      const res = await req('GET', '/api/media/m1/thumbnail');

      // The row exists; the file behind it does not.
      assert.strictEqual(res.statusCode, 404);
    });
  });
});

describe('ThumbnailService', () => {
  let root, thumbs, service;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'relay-thumbs-'));
    thumbs = join(root, 'thumbnails');
    mkdirSync(join(root, 'public/media'), { recursive: true });
    service = new ThumbnailService({ workspacePath: root, thumbnailDir: thumbs });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function writeSource(name, width, height, metadata = {}) {
    const buffer = await sharp({ create: { width, height, channels: 3, background: '#357' } })
      .withMetadata(metadata).jpeg().toBuffer();
    writeFileSync(join(root, 'public/media', name), buffer);
    return `media/${name}`;
  }

  it('generates a thumbnail narrower than the source', async () => {
    const storagePath = await writeSource('big.jpg', 2400, 1600);

    const path = await service.ensure({ id: 'm1', storagePath });

    assert.ok(existsSync(path));
    const meta = await sharp(path).metadata();
    assert.strictEqual(meta.width, 400);
    assert.strictEqual(meta.format, 'webp');
  });

  // Upscaling would make the "thumbnail" larger than the original.
  it('does not enlarge a source smaller than the thumbnail width', async () => {
    const storagePath = await writeSource('small.jpg', 120, 80);

    const path = await service.ensure({ id: 'm2', storagePath });

    assert.strictEqual((await sharp(path).metadata()).width, 120);
  });

  // Same reason the main pipeline rotates: the source may carry EXIF.
  it('respects EXIF orientation', async () => {
    const storagePath = await writeSource('sideways.jpg', 800, 400, { orientation: 6 });

    const path = await service.ensure({ id: 'm3', storagePath });

    const meta = await sharp(path).metadata();
    assert.ok(meta.height > meta.width, 'should be upright');
  });

  it('reuses an existing thumbnail rather than rebuilding', async () => {
    const storagePath = await writeSource('cached.jpg', 800, 600);
    const first = await service.ensure({ id: 'm4', storagePath });
    const before = (await sharp(first).metadata()).size;

    // Remove the source: a rebuild would now fail, so success proves the cache.
    rmSync(join(root, 'public/media/cached.jpg'));
    const second = await service.ensure({ id: 'm4', storagePath });

    assert.strictEqual(second, first);
    assert.strictEqual((await sharp(second).metadata()).size, before);
  });

  // A half-written file used to look finished, and the route stamps
  // max-age=31536000, immutable -- so a truncated image would be cached for a
  // year. Generation now writes to a temp name and renames into place.
  it('never exposes a partially written thumbnail', async () => {
    const storagePath = await writeSource('concurrent.jpg', 2400, 1600);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.ensure({ id: 'race', storagePath }))
    );

    for (const path of results) {
      const meta = await sharp(path).metadata();
      assert.strictEqual(meta.width, 400, 'every reader should see a complete image');
    }
  });

  it('leaves no temporary files behind', async () => {
    const storagePath = await writeSource('clean.jpg', 800, 600);
    await service.ensure({ id: 'tidy', storagePath });

    const leftovers = readdirSync(thumbs).filter(f => f.endsWith('.tmp'));
    assert.deepStrictEqual(leftovers, []);
  });

  it('removes a thumbnail on request', async () => {
    const storagePath = await writeSource('gone.jpg', 800, 600);
    const path = await service.ensure({ id: 'bye', storagePath });
    assert.ok(existsSync(path));

    await service.remove('bye');

    assert.ok(!existsSync(path));
  });

  it('returns null when the source does not exist', async () => {
    assert.strictEqual(await service.ensure({ id: 'gone', storagePath: 'media/nope.jpg' }), null);
  });
});
