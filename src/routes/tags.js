import { authenticate } from '../middleware/authenticate.js';
import { authorize, ROLES } from '../middleware/authorize.js';
import { validate, schemas } from '../utils/validators.js';

export default async function tagRoutes(fastify) {
  const { tagModel, authService } = fastify;
  const auth = authenticate(authService);

  fastify.addHook('preHandler', auth);

  // List tags
  fastify.get('/api/tags', async () => {
    const tags = tagModel.list();
    return { tags };
  });

  // Create tag
  fastify.post('/api/tags', async (request, reply) => {
    const { name } = validate(schemas.createTag, request.body);
    const tag = tagModel.create({ name });
    return reply.status(201).send({ success: true, tag });
  });

  // Admin-only. Tag.delete clears post_tags first, so removing a tag strips it
  // from every post that used it -- including other people's. Creating tags
  // stays open to any author; only the destructive half is restricted.
  fastify.delete('/api/tags/:id', { preHandler: authorize(ROLES.ADMIN) }, async (request, reply) => {
    const tag = tagModel.findById(parseInt(request.params.id, 10));
    if (!tag) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    tagModel.delete(parseInt(request.params.id, 10));
    return { success: true };
  });
}
