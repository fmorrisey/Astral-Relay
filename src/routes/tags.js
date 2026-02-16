import { authenticate } from '../middleware/authenticate.js';
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

  // Delete tag
  fastify.delete('/api/tags/:id', async (request, reply) => {
    const tag = tagModel.findById(parseInt(request.params.id, 10));
    if (!tag) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    tagModel.delete(parseInt(request.params.id, 10));
    return { success: true };
  });
}
