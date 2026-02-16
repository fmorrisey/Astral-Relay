import { validate, schemas } from '../utils/validators.js';
import config from '../config.js';

export default async function authRoutes(fastify) {
  const { authService, userModel } = fastify;

  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = validate(schemas.login, request.body);

    const user = userModel.findByUsername(username);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await authService.verifyPassword(user.password_hash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    userModel.updateLastLogin(user.id);

    const { sessionId, expiresAt } = authService.createSession(
      user.id,
      request.headers['user-agent'],
      request.ip
    );

    reply.setCookie('session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'strict',
      expires: expiresAt
    });

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name
      }
    };
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies.session;
    if (sessionId) {
      authService.deleteSession(sessionId);
      reply.clearCookie('session', { path: '/' });
    }
    return { success: true };
  });

  fastify.get('/api/auth/me', async (request, reply) => {
    const sessionId = request.cookies.session;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const session = authService.validateSession(sessionId);
    if (!session) {
      reply.clearCookie('session', { path: '/' });
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    return {
      user: {
        id: session.uid,
        username: session.username,
        displayName: session.display_name,
        email: session.email
      }
    };
  });

  fastify.post('/api/auth/setup', async (request, reply) => {
    const setupComplete = fastify.db
      .prepare("SELECT value FROM config WHERE key = 'setup_complete'")
      .get();

    if (setupComplete && setupComplete.value === 'true') {
      return reply.status(403).send({ error: 'Setup already completed' });
    }

    const data = validate(schemas.setup, request.body);

    const passwordHash = await authService.hashPassword(data.password);
    const user = userModel.create({
      username: data.username,
      passwordHash,
      displayName: data.displayName || data.username
    });

    if (data.workspacePath) {
      fastify.db.prepare(
        "UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = 'workspace_path'"
      ).run(data.workspacePath);
    }

    if (data.collections) {
      fastify.db.prepare(
        "UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = 'collections'"
      ).run(JSON.stringify(data.collections));
    }

    if (data.webhook) {
      if (data.webhook.enabled !== undefined) {
        fastify.db.prepare(
          "UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = 'webhook_enabled'"
        ).run(String(data.webhook.enabled));
      }
      if (data.webhook.url) {
        fastify.db.prepare(
          "UPDATE config SET value = ?, updated_at = datetime('now') WHERE key = 'webhook_url'"
        ).run(data.webhook.url);
      }
    }

    fastify.db.prepare(
      "UPDATE config SET value = 'true', updated_at = datetime('now') WHERE key = 'setup_complete'"
    ).run();

    const recoveryCode = authService.generateRecoveryCode();

    // Auto-login
    const { sessionId, expiresAt } = authService.createSession(
      user.id,
      request.headers['user-agent'],
      request.ip
    );

    reply.setCookie('session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'strict',
      expires: expiresAt
    });

    return {
      success: true,
      recoveryCode,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }
    };
  });
}
