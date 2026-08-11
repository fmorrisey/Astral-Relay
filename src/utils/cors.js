/**
 * Work out the `origin` option for @fastify/cors.
 *
 * The UI is served from the same origin as the API, so cross-origin access is
 * not needed by default. It is configurable because a separately hosted
 * frontend is a reasonable thing to want.
 *
 * @param {string} raw   comma-separated origin list (FRONTEND_ORIGINS / ALLOWED_ORIGINS)
 * @param {string} env   NODE_ENV
 * @returns {boolean|string|Function} value for @fastify/cors `origin`
 */
export function resolveCorsOrigin(raw = '', env = 'development') {
  const allowed = String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    // Unset in production means same-origin only, NOT reflect-any. Reflecting
    // whatever Origin a caller sends while `credentials: true` is set is the
    // shape that lets any site make authenticated requests on a logged-in
    // user's behalf. It is currently held off by the session cookie being
    // sameSite: 'strict', which is one attribute away from being the only
    // thing holding -- so production should not be able to fall into it by
    // omission. Development still reflects, so localhost tooling works.
    return env === 'production' ? false : true;
  }

  // Deliberately the function form even for a single origin. Passing the string
  // makes @fastify/cors emit that fixed Access-Control-Allow-Origin to every
  // caller. That is still safe -- a browser compares the header against its own
  // origin and blocks the mismatch -- but it means a rejected origin and an
  // allowed one produce identical headers, so the policy cannot be checked by
  // looking at a response. Here an unlisted origin gets no header at all.
  return (origin, cb) => {
    // No Origin header: same-origin navigations, curl, health checks.
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  };
}
