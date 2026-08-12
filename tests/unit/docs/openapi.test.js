import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';
import { buildOpenApiDocument } from '../../../src/docs/openapi.js';
import { registerDocs } from '../../../src/docs/index.js';
import { joiToJsonSchema } from '../../../src/utils/joiToJsonSchema.js';
import { schemas } from '../../../src/utils/validators.js';

const doc = buildOpenApiDocument({ version: '0.0.0-test' });

describe('OpenAPI document', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('is a valid-looking OpenAPI 3 document', () => {
    assert.match(doc.openapi, /^3\./);
    assert.ok(doc.info.title);
    assert.ok(doc.paths && Object.keys(doc.paths).length > 0);
    assert.ok(doc.components.securitySchemes.cookieAuth);
  });

  // The document is written by hand, so the failure mode is a route nobody
  // documented. This is what stops that: add a route without a spec entry and
  // the suite fails, which is the only reason a static document is safe.
  // OpenAPI writes params as {id}; Fastify writes them as :id.
  const documented = new Set(
    Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map(m => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`)
    )
  );

  async function registeredApiRoutes() {
    app = await buildFastify();
    // Registered the same way server.js does when API_DOCS is on, so the
    // comparison is against the real route set rather than a subset of it.
    await registerDocs(app, { version: '0.0.0-test' });
    await app.ready();
    return new Set(
      app.registeredRoutes
        .filter(r => r.url.startsWith('/api') && !['HEAD', 'OPTIONS'].includes(r.method))
        .map(r => `${r.method} ${r.url}`)
    );
  }

  it('documents every route the server registers', async () => {
    const registered = await registeredApiRoutes();
    const missing = [...registered].filter(r => !documented.has(r)).sort();

    assert.deepStrictEqual(missing, [], `Undocumented routes:\n  ${missing.join('\n  ')}`);
  });

  it('does not document routes that do not exist', async () => {
    const registered = await registeredApiRoutes();
    const phantom = [...documented].filter(r => !registered.has(r)).sort();

    assert.deepStrictEqual(phantom, [], `Documented but not registered:\n  ${phantom.join('\n  ')}`);
  });

  // If bodies were copied by hand they would drift from what is enforced.
  it('derives request bodies from the Joi schemas the routes validate with', () => {
    const login = doc.paths['/api/auth/login'].post.requestBody.content['application/json'].schema;
    assert.deepStrictEqual(login, joiToJsonSchema(schemas.login));

    const createUser = doc.paths['/api/users'].post.requestBody.content['application/json'].schema;
    assert.deepStrictEqual(createUser, joiToJsonSchema(schemas.createUser));
    // Proves the derivation is live rather than a snapshot: this enum exists
    // only because validators.js constrains the role.
    assert.deepStrictEqual(createUser.properties.role.enum, ['admin', 'author']);
  });

  // Dropped silently before, so the spec advertised a non-nullable string for a
  // field whose null is the documented way to clear a slot.
  it('carries nullability through to the schema', () => {
    const schema = doc.paths['/api/posts/{id}/media'].put
      .requestBody.content['application/json'].schema;

    assert.strictEqual(schema.properties.heroMediaId.nullable, true);
    assert.strictEqual(schema.properties.coverMediaId.nullable, true);
  });

  it('marks the routes reachable without a session as public', () => {
    for (const path of ['/api/health', '/api/setup/status', '/api/auth/login', '/api/auth/recover', '/api/auth/setup']) {
      const [method] = Object.keys(doc.paths[path]);
      assert.deepStrictEqual(doc.paths[path][method].security, [], `${path} should be marked public`);
    }
  });

  it('leaves authenticated routes on the document-level security requirement', () => {
    assert.deepStrictEqual(doc.security, [{ cookieAuth: [] }]);
    assert.strictEqual(doc.paths['/api/posts'].get.security, undefined);
  });
});
