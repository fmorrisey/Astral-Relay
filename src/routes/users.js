import { validate, schemas } from '../utils/validators.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize, ROLES } from '../middleware/authorize.js';

export default async function userRoutes(fastify) {
  const { userModel, authService } = fastify;

  // Every route here is admin-only. Managing accounts is the one capability
  // that lets a user grant themselves anything else.
  fastify.addHook('preHandler', authenticate(authService));
  fastify.addHook('preHandler', authorize(ROLES.ADMIN));

  fastify.get('/api/users', async () => {
    // No password hashes or recovery hashes: User.list selects columns
    // explicitly rather than SELECT *.
    return { users: userModel.list() };
  });

  fastify.post('/api/users', async (request, reply) => {
    const data = validate(schemas.createUser, request.body);

    if (userModel.findByUsername(data.username)) {
      return reply.status(409).send({ error: 'Username already taken' });
    }

    const passwordHash = await authService.hashPassword(data.password);
    const user = userModel.create({
      username: data.username,
      passwordHash,
      displayName: data.displayName,
      email: data.email,
      role: data.role
    });

    fastify.logActivity({
      userId: request.user.id,
      action: 'user.create',
      resourceType: 'user',
      resourceId: String(user.id),
      metadata: { role: user.role },
      ipAddress: request.ip
    });

    return reply.status(201).send({ success: true, user });
  });

  fastify.delete('/api/users/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    const user = userModel.findById(id);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Deleting yourself would end the session making the request, and if you
    // were the last admin it would leave the site unadministrable.
    if (id === request.user.id) {
      return reply.status(400).send({ error: 'You cannot delete your own account' });
    }

    // Belt and braces: even deleting someone else must not remove the last
    // admin. Without this a two-admin site could be left with none.
    if (user.role === ROLES.ADMIN && userModel.countByRole(ROLES.ADMIN) <= 1) {
      return reply.status(400).send({ error: 'Cannot delete the last admin' });
    }

    // Posts and media reference users via created_by with no ON DELETE clause,
    // so deleting an author with content would violate that constraint. Refuse
    // rather than orphan or cascade-delete their work.
    const posts = fastify.db.prepare('SELECT COUNT(*) c FROM posts WHERE created_by = ?').get(id).c;
    const media = fastify.db.prepare('SELECT COUNT(*) c FROM media WHERE created_by = ?').get(id).c;
    if (posts > 0 || media > 0) {
      return reply.status(409).send({
        error: `User still owns ${posts} post(s) and ${media} media file(s). Reassign or delete them first.`
      });
    }

    userModel.delete(id);

    fastify.logActivity({
      userId: request.user.id,
      action: 'user.delete',
      resourceType: 'user',
      resourceId: String(id),
      ipAddress: request.ip
    });

    return { success: true };
  });
}
