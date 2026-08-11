import { validate, schemas } from '../utils/validators.js';
import { authenticate } from '../middleware/authenticate.js';
import { ownsOrAdmin, ROLES } from '../middleware/authorize.js';

export default async function postRoutes(fastify) {
  const { postModel, exportService, authService } = fastify;
  const auth = authenticate(authService);

  fastify.addHook('preHandler', auth);

  // Ownership is checked per-route rather than by a hook: reading is open to
  // any authenticated user, and only mutations are restricted to the owner.
  // Checked against created_by in the database, never against anything the
  // request supplies.
  function denyIfNotOwner(request, reply, post) {
    if (ownsOrAdmin(request.user, post.createdBy)) return false;
    reply.status(403).send({ error: 'You can only modify your own posts' });
    return true;
  }

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
    const existing = postModel.findById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (denyIfNotOwner(request, reply, existing)) return reply;

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
    if (denyIfNotOwner(request, reply, post)) return reply;

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

    const existing = postModel.findById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    // Publishing writes to the live site, so it is restricted the same way
    // editing is -- an author may publish their own work, nobody else's.
    if (denyIfNotOwner(request, reply, existing)) return reply;

    // Export first, then commit the status change -- the same order the
    // unpublish route already uses. The export can legitimately fail: it
    // refuses to overwrite an entry whose existing frontmatter is unparseable.
    // Flipping the database to published first would leave a post shown as
    // published with no file on disk, and every retry would rewrite
    // published_at again.
    const timestamp = publishedAt || new Date().toISOString();
    const raw = fastify.db.prepare('SELECT * FROM posts WHERE id = ?').get(request.params.id);
    const tags = postModel._getPostTags(request.params.id);

    const exported = await exportService.publishPost(
      { ...raw, status: 'published', published_at: timestamp },
      tags
    );

    const post = postModel.publish(request.params.id, timestamp);

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

    if (denyIfNotOwner(request, reply, post)) return reply;

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
