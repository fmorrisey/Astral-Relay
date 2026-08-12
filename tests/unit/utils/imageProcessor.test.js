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
const animatedMeta = buffer => sharp(buffer, { animated: true }).metadata();

/**
 * A real two-frame GIF89a, assembled byte by byte.
 *
 * sharp's create/raw inputs cannot emit an animated GIF, which an earlier
 * version of this file wrongly concluded meant no fixture was possible. The
 * frames must differ in pixel content -- the encoder collapses identical frames
 * into one page, which reads as the very flattening being tested for.
 */
const animatedGif = () => Buffer.from(
  '474946383961' + '0200' + '0200' + 'F10000' +
  'FF0000' + '00FF00' + '0000FF' + 'FFFFFF' +
  '21F904' + '04' + '3200' + '0000' +
  '2C' + '0000' + '0000' + '0200' + '0200' + '00' +
  '02' + '02' + '4C01' + '00' +
  '21F904' + '04' + '3200' + '0000' +
  '2C' + '0000' + '0000' + '0200' + '0200' + '00' +
  '02' + '02' + '8C51' + '00' +
  '3B', 'hex');

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

    it('keeps a still GIF as GIF', async () => {
      const gif = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#fff' } })
        .gif().toBuffer();
      const result = await processUpload(gif, 'image/gif');

      assert.match(result.filename, /\.gif$/);
      assert.strictEqual((await meta(result.buffer)).format, 'gif');
    });

    // Without { animated: true } sharp reads only the first page and re-encodes
    // a multi-frame image as a still.
    it('keeps every frame of an animated GIF', async () => {
      const source = animatedGif();
      assert.strictEqual((await animatedMeta(source)).pages, 2, 'fixture should have 2 frames');

      const result = await processUpload(source, 'image/gif');

      assert.strictEqual((await animatedMeta(result.buffer)).pages, 2);
    });

    // Reported height must be one frame. sharp gives the stacked height for an
    // animated image, which would record a 2px frame as 4px tall.
    it('reports the height of a single frame, not every frame stacked', async () => {
      const result = await processUpload(animatedGif(), 'image/gif');

      assert.strictEqual(result.height, 2);
    });

    // WebP is what most GIF converters emit, and it was excluded from the
    // animated path -- flattening animated WebP exactly as GIF used to be.
    it('keeps every frame of an animated WebP', async () => {
      const source = await sharp(animatedGif(), { animated: true }).webp().toBuffer();
      assert.strictEqual((await animatedMeta(source)).pages, 2, 'fixture should have 2 frames');

      const result = await processUpload(source, 'image/webp');

      assert.strictEqual((await animatedMeta(result.buffer)).pages, 2);
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

    // Opening as animated shares one pixel budget across every frame, so a long
    // animation can exceed it. That throw carries no statusCode and surfaced as
    // a 500, telling the user nothing about a file they could simply shrink.
    it('reports a too-large animation as a 400, not an unhandled error', async () => {
      const huge = await sharp({ create: { width: 12000, height: 12000, channels: 3, background: '#fff' } })
        .webp().toBuffer();

      await assert.rejects(
        () => processUpload(huge, 'image/webp'),
        err => err.statusCode === 400 && /too many pixels/i.test(err.message)
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
