export function authenticate(authService) {
  return async function (request, reply) {
    const sessionId = request.cookies.session;

    if (!sessionId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const session = authService.validateSession(sessionId);
    if (!session) {
      reply.clearCookie('session');
      return reply.status(401).send({ error: 'Session expired' });
    }

    request.user = {
      id: session.uid,
      username: session.username,
      displayName: session.display_name,
      email: session.email
    };
  };
}
