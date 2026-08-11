import { validate, schemas } from '../utils/validators.js';
import { rateLimitConfig } from '../middleware/rateLimit.js';
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
      secure: config.cookieSecure,
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

  // Redeem a recovery code to set a new password. Unauthenticated by
  // necessity -- it exists precisely for someone who cannot log in.
  //
  // Rate limited harder than the global bucket, since this is the one endpoint
  // where guessing repeatedly is the attack. The auth limit was configured in
  // middleware/rateLimit.js but had never been applied to a route.
  fastify.post('/api/auth/recover', {
    config: { rateLimit: rateLimitConfig.auth }
  }, async (request, reply) => {
    const { username, recoveryCode, newPassword } = validate(schemas.recover, request.body);

    const ok = await authService.redeemRecoveryCode(username, recoveryCode, newPassword);
    if (!ok) {
      // One message for every failure -- unknown user, no code issued, wrong
      // code. Distinguishing them would confirm which usernames exist and which
      // accounts have recovery set up.
      return reply.status(401).send({ error: 'Invalid username or recovery code' });
    }

    fastify.logActivity({
      userId: null,
      action: 'auth.recover',
      resourceType: 'user',
      resourceId: username,
      ipAddress: request.ip
    });

    // No auto-login: redeeming proves possession of the code, and requiring a
    // fresh login proves the new password works before the only way in changes.
    return { success: true };
  });

  // Issue a replacement recovery code. Authenticated: this is for someone who
  // still has access and wants a code they can rely on -- including every
  // account created before codes were stored, which has none.
  fastify.post('/api/auth/recovery-code', async (request, reply) => {
    const sessionId = request.cookies.session;
    const session = sessionId && authService.validateSession(sessionId);
    if (!session) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const recoveryCode = await authService.issueRecoveryCode(session.uid);

    fastify.logActivity({
      userId: session.uid,
      action: 'auth.recovery_code.issued',
      resourceType: 'user',
      resourceId: String(session.uid),
      ipAddress: request.ip
    });

    // Returned once. Only the hash is stored, so it cannot be shown again.
    return { success: true, recoveryCode };
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

    // Stored as a hash here, not merely generated. Previously this code was
    // displayed and discarded, so the "save your recovery code" screen promised
    // something no endpoint could honour.
    const recoveryCode = await authService.issueRecoveryCode(user.id);

    // Auto-login
    const { sessionId, expiresAt } = authService.createSession(
      user.id,
      request.headers['user-agent'],
      request.ip
    );

    reply.setCookie('session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
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
