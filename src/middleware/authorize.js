export const ROLES = Object.freeze({
  ADMIN: 'admin',
  AUTHOR: 'author'
});

export const ALL_ROLES = Object.freeze([ROLES.ADMIN, ROLES.AUTHOR]);

/**
 * Require one of `roles`. Composes after `authenticate`, which puts the role on
 * request.user -- this only decides, it never identifies.
 *
 * Fails closed: a request with no user, or a role not in the list, is rejected.
 * A role this code does not recognise therefore gets nothing rather than
 * everything.
 */
export function authorize(...roles) {
  return async function (request, reply) {
    if (!request.user) {
      // authenticate should have run first and 401'd. Reaching here means the
      // route was wired wrong, so refuse rather than assume anything.
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
}

/**
 * True if the user may act on a resource owned by `ownerId`.
 *
 * Admins may act on anything; everyone else only on their own. Ownership is
 * checked against created_by rather than trusting anything in the request.
 */
export function ownsOrAdmin(user, ownerId) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  return user.id === ownerId;
}
