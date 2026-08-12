import sharp from 'sharp';
import { v4 as uuid } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10);
const MAX_WIDTH = 2400;
const JPEG_QUALITY = 85;

// Formats that can carry more than one frame. WebP belongs here as much as GIF:
// it is what most GIF-to-modern-format converters emit, and leaving it out
// flattened animated WebP in exactly the way this guards against for GIF.
const ANIMATED_TYPES = ['image/gif', 'image/webp'];

// sharp applies its pixel budget to every frame stacked, so opening a file as
// animated shares one allowance across the whole animation. The default
// (268 megapixels) then rejects long animations that used to be accepted -- as a
// still, but accepted -- and the throw carries no statusCode, so it surfaces as
// a 500. Cap it explicitly and translate the failure into a 400 below.
const MAX_DECODED_PIXELS = 100_000_000;

export function isAllowedType(mimeType) {
  return ALLOWED_TYPES.includes(mimeType);
}

export async function processUpload(buffer, mimeType) {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    const err = new Error('Invalid file type. Allowed: JPEG, PNG, WebP, GIF');
    err.statusCode = 400;
    throw err;
  }

  if (buffer.length > MAX_SIZE) {
    const err = new Error(`File too large. Maximum size: ${MAX_SIZE} bytes`);
    err.statusCode = 400;
    throw err;
  }

  const isGif = mimeType === 'image/gif';
  const isAnimatedType = ANIMATED_TYPES.includes(mimeType);

  // Animated formats must be opened with `animated`, or sharp reads only the
  // first frame and silently re-encodes a multi-frame image as a still.
  const openOptions = isAnimatedType
    ? { animated: true, limitInputPixels: MAX_DECODED_PIXELS }
    : {};
  const image = sharp(buffer, openOptions);

  // Bake in EXIF rotation. sharp strips metadata on output, so without this a
  // photo carrying `orientation: 6` keeps its unrotated pixels and loses the tag
  // telling viewers to turn it -- which is every portrait photo from a phone,
  // displayed sideways.
  //
  // Must come before resize: after rotating, a 3000x1500 landscape is 1500x3000,
  // and the width the resize applies to is the rotated one. Animated images are
  // not rotated -- sharp cannot rotate a multi-page image by an arbitrary angle.
  if (!isAnimatedType) image.rotate();

  // withoutEnlargement makes this a no-op for anything already narrower, so the
  // width no longer has to be checked up front against pre-rotation metadata.
  image.resize({ width: MAX_WIDTH, withoutEnlargement: true });

  let processed;
  let ext;

  try {
  if (mimeType === 'image/png') {
    processed = await image.png({ quality: JPEG_QUALITY }).toBuffer();
    ext = 'png';
  } else if (mimeType === 'image/webp') {
    processed = await image.webp({ quality: JPEG_QUALITY }).toBuffer();
    ext = 'webp';
  } else if (isGif) {
    processed = await image.gif().toBuffer();
    ext = 'gif';
  } else {
    processed = await image.jpeg({ quality: JPEG_QUALITY, progressive: true }).toBuffer();
    ext = 'jpg';
  }

  } catch (error) {
    // A long animation can exceed the decode budget. Without this it escapes as
    // an untyped error and the upload route answers 500 Internal server error,
    // which tells the user nothing about a file they could simply shrink.
    if (/pixel limit|exceeds/i.test(error.message)) {
      const err = new Error('Image has too many pixels to process. Try a shorter animation or a smaller image.');
      err.statusCode = 400;
      throw err;
    }
    throw error;
  }

  // Measured from the output, not the input. Reading it beforehand recorded the
  // source dimensions while storing a resized file, so every consumer -- aspect
  // ratio boxes, width/height attributes against layout shift, gallery maths --
  // was working from numbers that did not describe the file.
  const out = await sharp(processed, isAnimatedType ? { animated: true } : {}).metadata();

  // For an animated image sharp reports the height of every frame stacked;
  // pageHeight is one frame, which is the height the image actually displays at.
  const height = out.pageHeight || out.height;

  const filename = `${uuid()}.${ext}`;

  return {
    buffer: processed,
    filename,
    width: out.width,
    height,
    size: processed.length
  };
}
