import { authenticate } from '../middleware/authenticate.js';
import { processUpload, isAllowedType } from '../utils/imageProcessor.js';

export default async function mediaRoutes(fastify) {
  const { mediaModel, storageService, authService } = fastify;
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
    const { limit, offset } = request.query;
    return mediaModel.list({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });
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

    await storageService.deleteMedia(media.storagePath);
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
