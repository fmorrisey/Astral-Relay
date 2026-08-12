import { describe, it } from 'node:test';
import assert from 'node:assert';
import sharp from 'sharp';
import { processUpload, isAllowedType } from '../../../src/utils/imageProcessor.js';

// Fixtures are generated rather than checked in: a binary in the repo is a
// thing nobody can review, and these are a few lines to build.
const solid = (width, height, opts = {}) =>
  sharp({ create: { width, height, channels: 3, background: '#4466aa' } })
    .withMetadata(opts.metadata || {})
    .jpeg()
    .toBuffer();

const meta = buffer => sharp(buffer).metadata();

describe('processUpload', () => {
  describe('recorded dimensions', () => {
    // These numbers end up in the database and drive aspect-ratio boxes and
    // width/height attributes. Reading them before the resize meant they
    // described the upload, not the file that was kept.
    it('describe the stored file after a resize', async () => {
      const result = await processUpload(await solid(3000, 1500), 'image/jpeg');
      const stored = await meta(result.buffer);

      assert.strictEqual(result.width, stored.width);
      assert.strictEqual(result.height, stored.height);
      assert.strictEqual(result.width, 2400);
    });

    it('describe the stored file when no resize happens', async () => {
      const result = await processUpload(await solid(300, 200), 'image/jpeg');
      const stored = await meta(result.buffer);

      assert.strictEqual(result.width, stored.width);
      assert.strictEqual(result.height, stored.height);
      assert.strictEqual(result.width, 300);
    });
  });

  describe('EXIF orientation', () => {
    // sharp strips metadata on output, so an unrotated image loses the tag that
    // told viewers to turn it: every portrait photo from a phone, sideways.
    it('is baked into the pixels', async () => {
      const sideways = await solid(800, 400, { metadata: { orientation: 6 } });

      const result = await processUpload(sideways, 'image/jpeg');
      const stored = await meta(result.buffer);

      assert.strictEqual(stored.width, 400);
      assert.strictEqual(stored.height, 800);
    });

    // Rotation has to happen first, or the width cap is applied to the
    // pre-rotation width and the result is scaled on the wrong axis.
    it('is applied before the resize, not after', async () => {
      const sideways = await solid(6000, 1000, { metadata: { orientation: 6 } });

      const result = await processUpload(sideways, 'image/jpeg');

      // Rotated to 1000x6000, whose width is already under the cap -- so it must
      // come through unscaled. Resizing first would have produced 2400 wide.
      assert.strictEqual(result.width, 1000);
      assert.strictEqual(result.height, 6000);
    });

    it('leaves an untagged image alone', async () => {
      const result = await processUpload(await solid(800, 400), 'image/jpeg');
      const stored = await meta(result.buffer);

      assert.strictEqual(stored.width, 800);
      assert.strictEqual(stored.height, 400);
    });
  });

  describe('formats', () => {
    it('keeps PNG as PNG', async () => {
      const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#fff' } })
        .png().toBuffer();
      const result = await processUpload(png, 'image/png');

      assert.match(result.filename, /\.png$/);
      assert.strictEqual((await meta(result.buffer)).format, 'png');
    });

    it('keeps WebP as WebP', async () => {
      const webp = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } })
        .webp().toBuffer();
      const result = await processUpload(webp, 'image/webp');

      assert.match(result.filename, /\.webp$/);
      assert.strictEqual((await meta(result.buffer)).format, 'webp');
    });

    // GIFs are opened with { animated: true }, without which sharp reads only
    // the first page and re-encodes a multi-frame image as a still.
    //
    // Multi-frame preservation is NOT asserted here: sharp's raw input could not
    // be coaxed into producing an animated GIF in this environment, so there is
    // no fixture to test against. The fix rests on sharp's documented behaviour,
    // and this covers the single-frame path plus the frame count being reported.
    it('keeps GIF as GIF and reports a frame count', async () => {
      const gif = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#fff' } })
        .gif().toBuffer();
      const result = await processUpload(gif, 'image/gif');

      assert.match(result.filename, /\.gif$/);
      assert.strictEqual((await meta(result.buffer)).format, 'gif');
      assert.strictEqual(result.frames, 1);
    });

    it('gives every upload a unique filename', async () => {
      const image = await solid(100, 100);
      const a = await processUpload(image, 'image/jpeg');
      const b = await processUpload(image, 'image/jpeg');

      assert.notStrictEqual(a.filename, b.filename);
    });
  });

  describe('rejections', () => {
    it('refuses a type that is not allowed', async () => {
      await assert.rejects(
        () => processUpload(Buffer.from('not an image'), 'application/pdf'),
        /Invalid file type/
      );
    });

    it('refuses a buffer over the size limit', async () => {
      const huge = Buffer.alloc(11 * 1024 * 1024);
      await assert.rejects(() => processUpload(huge, 'image/jpeg'), /too large/i);
    });
  });

  describe('isAllowedType', () => {
    it('accepts the four supported image types', () => {
      for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
        assert.ok(isAllowedType(type), type);
      }
    });

    it('rejects anything else', () => {
      for (const type of ['image/svg+xml', 'application/pdf', 'text/html', '']) {
        assert.ok(!isAllowedType(type), type);
      }
    });
  });
});
