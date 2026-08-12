import { authenticate } from '../middleware/authenticate.js';
import { ownsOrAdmin } from '../middleware/authorize.js';
import { createReadStream, existsSync } from 'fs';
import { validate, schemas } from '../utils/validators.js';
import { processUpload, isAllowedType } from '../utils/imageProcessor.js';

export default async function mediaRoutes(fastify) {
  const { mediaModel, storageService, authService, thumbnailService } = fastify;
  const auth = authenticate(authService);

  fastify.addHook('preHandler', auth);

  // Upload media
  fastify.post('/api/media/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    if (!isAllowedType(file.mimetype)) {
      return reply.status(400).send({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' });
    }

    const buffer = await file.toBuffer();
    const processed = await processUpload(buffer, file.mimetype);
    const storagePath = storageService.getMediaStoragePath(processed.filename);

    await storageService.saveMedia(processed.buffer, storagePath);

    const media = mediaModel.create({
      filename: processed.filename,
      originalFilename: file.filename,
      mimeType: file.mimetype,
      sizeBytes: processed.size,
      width: processed.width,
      height: processed.height,
      storagePath,
      altText: file.fields?.alt?.value || null,
      userId: request.user.id
    });

    fastify.logActivity({
      userId: request.user.id,
      action: 'media.upload',
      resourceType: 'media',
      resourceId: media.id,
      ipAddress: request.ip
    });

    return reply.status(201).send({ success: true, media });
  });

  // List media
  fastify.get('/api/media', async (request) => {
    const { limit, offset, search } = request.query;
    return mediaModel.list({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      search: search || ''
    });
  });

  // Thumbnail for the grid. Built on first request rather than at upload, so
  // images that predate thumbnails need no backfill.
  fastify.get('/api/media/:id/thumbnail', async (request, reply) => {
    const media = mediaModel.findById(request.params.id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found' });
    }

    const path = await thumbnailService.ensure(media);
    if (!path) {
      // The source is gone -- unmounted workspace, or deleted by hand.
      return reply.status(404).send({ error: 'Source image not available' });
    }

    // Content-addressed by media id and immutable once written, so it can be
    // cached hard. A replaced image gets a new id.
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.type('image/webp');
    return reply.send(createReadStream(path));
  });

  // The original file, served by the CMS.
  //
  // media.url points at the published site (/media/...), which is correct for
  // frontmatter but resolves to nothing here: the static plugin serves this
  // app's own public/ directory, not the Astro workspace. Requesting it in the
  // CMS returned index.html, so every image in the grid rendered broken.
  fastify.get('/api/media/:id/file', async (request, reply) => {
    const media = mediaModel.findById(request.params.id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found' });
    }

    const path = thumbnailService.sourcePathFor(media.storagePath);
    if (!existsSync(path)) {
      return reply.status(404).send({ error: 'Source image not available' });
    }

    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.type(media.mimeType);
    return reply.send(createReadStream(path));
  });

  // Edit alt text. Upload accepts it, but nothing could change it afterwards,
  // so in practice it was always null.
  fastify.patch('/api/media/:id', async (request, reply) => {
    const media = mediaModel.findById(request.params.id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found' });
    }

    if (!ownsOrAdmin(request.user, media.createdBy)) {
      return reply.status(403).send({ error: 'You can only edit your own media' });
    }

    const { altText } = validate(schemas.updateMedia, request.body || {});
    const updated = mediaModel.updateAltText(request.params.id, altText);

    fastify.logActivity({
      userId: request.user.id,
      action: 'media.update',
      resourceType: 'media',
      resourceId: request.params.id,
      ipAddress: request.ip
    });

    return { success: true, media: updated };
  });

  // Get single media
  fastify.get('/api/media/:id', async (request, reply) => {
    const media = mediaModel.findById(request.params.id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found' });
    }
    return { media };
  });

  // Delete media
  fastify.delete('/api/media/:id', async (request, reply) => {
    const media = mediaModel.findById(request.params.id);
    if (!media) {
      return reply.status(404).send({ error: 'Media not found' });
    }

    // Deleting a file removes it from the live site, and it may be referenced
    // by someone else's post. Owner or admin only.
    if (!ownsOrAdmin(request.user, media.createdBy)) {
      return reply.status(403).send({ error: 'You can only delete your own media' });
    }

    await storageService.deleteMedia(media.storagePath);
    // Otherwise generated thumbnails accumulate forever, keyed by ids that no
    // longer exist.
    await thumbnailService.remove(request.params.id);
    mediaModel.delete(request.params.id);

    fastify.logActivity({
      userId: request.user.id,
      action: 'media.delete',
      resourceType: 'media',
      resourceId: request.params.id,
      ipAddress: request.ip
    });

    return { success: true };
  });
}
