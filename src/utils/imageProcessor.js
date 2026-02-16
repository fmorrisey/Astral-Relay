import sharp from 'sharp';
import { v4 as uuid } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10);
const MAX_WIDTH = 2400;
const JPEG_QUALITY = 85;

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

  const image = sharp(buffer);
  const metadata = await image.metadata();

  if (metadata.width > MAX_WIDTH) {
    image.resize(MAX_WIDTH, null, { withoutEnlargement: true });
  }

  let processed;
  let ext;

  if (mimeType === 'image/png') {
    processed = await image.png({ quality: JPEG_QUALITY }).toBuffer();
    ext = 'png';
  } else if (mimeType === 'image/webp') {
    processed = await image.webp({ quality: JPEG_QUALITY }).toBuffer();
    ext = 'webp';
  } else if (mimeType === 'image/gif') {
    processed = await image.gif().toBuffer();
    ext = 'gif';
  } else {
    processed = await image.jpeg({ quality: JPEG_QUALITY, progressive: true }).toBuffer();
    ext = 'jpg';
  }

  const filename = `${uuid()}.${ext}`;

  return {
    buffer: processed,
    filename,
    width: metadata.width,
    height: metadata.height,
    size: processed.length
  };
}
