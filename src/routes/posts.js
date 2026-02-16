import { validate, schemas } from '../utils/validators.js';
import { authenticate } from '../middleware/authenticate.js';

export default async function postRoutes(fastify) {
  const { postModel, exportService, authService } = fastify;
  const auth = authenticate(authService);

  fastify.addHook('preHandler', auth);

  // List posts
  fastify.get('/api/posts', async (request) => {
    const { status, collection, limit, offset, sort, order } = request.query;
    return postModel.list({
      status,
      collection,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      sort,
      order
    });
  });

  // Get single post
  fastify.get('/api/posts/:id', async (request, reply) => {
    const post = postModel.findById(request.params.id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    return { post };
  });

  // Create post
  fastify.post('/api/posts', async (request, reply) => {
    const data = validate(schemas.createPost, request.body);
    const post = postModel.create({ ...data, userId: request.user.id });

    fastify.logActivity({
      userId: request.user.id,
      action: 'post.create',
      resourceType: 'post',
      resourceId: post.id,
      ipAddress: request.ip
    });

    return reply.status(201).send({ success: true, post });
  });

  // Update post
  fastify.put('/api/posts/:id', async (request, reply) => {
    const data = validate(schemas.updatePost, request.body);
    const post = postModel.update(request.params.id, data);

    fastify.logActivity({
      userId: request.user.id,
      action: 'post.update',
      resourceType: 'post',
      resourceId: post.id,
      ipAddress: request.ip
    });

    return { success: true, post };
  });

  // Delete post
  fastify.delete('/api/posts/:id', async (request, reply) => {
    const post = postModel.findById(request.params.id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Delete exported file if published
    if (post.status === 'published') {
      await exportService.deletePost(post).catch(() => {});
    }

    postModel.delete(request.params.id);

    fastify.logActivity({
      userId: request.user.id,
      action: 'post.delete',
      resourceType: 'post',
      resourceId: request.params.id,
      ipAddress: request.ip
    });

    return { success: true };
  });

  // Publish post
  fastify.post('/api/posts/:id/publish', async (request, reply) => {
    const { publishedAt } = request.body || {};
    const post = postModel.publish(request.params.id, publishedAt);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Get raw post data for export
    const raw = fastify.db.prepare('SELECT * FROM posts WHERE id = ?').get(request.params.id);
    const tags = postModel._getPostTags(request.params.id);

    const exported = await exportService.publishPost(raw, tags);

    fastify.logActivity({
      userId: request.user.id,
      action: 'post.publish',
      resourceType: 'post',
      resourceId: post.id,
      metadata: { collection: post.collection, slug: post.slug },
      ipAddress: request.ip
    });

    return { success: true, post, exported };
  });

  // Unpublish post
  fastify.post('/api/posts/:id/unpublish', async (request, reply) => {
    const post = postModel.findById(request.params.id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Delete exported file from Astro site
    if (post.status === 'published') {
      await exportService.deletePost(post).catch(() => {});
    }

    // Update status to draft in database
    const updatedPost = postModel.unpublish(request.params.id);

    fastify.logActivity({
      userId: request.user.id,
      action: 'post.unpublish',
      resourceType: 'post',
      resourceId: post.id,
      ipAddress: request.ip
    });

    return { success: true, post: updatedPost };
  });

  // Get version history
  fastify.get('/api/posts/:id/versions', async (request, reply) => {
    const post = postModel.findById(request.params.id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const versions = postModel.getVersions(request.params.id);
    return { versions };
  });
}
