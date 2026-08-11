import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { buildOpenApiDocument } from './openapi.js';

/**
 * Serve the OpenAPI document at /api/openapi.json and a browsable UI at /docs.
 *
 * Static mode: the document is built from src/docs/openapi.js rather than read
 * off route definitions. Attaching `schema` to a route makes Fastify validate
 * against it, and validation here belongs to Joi -- two validators on the same
 * request is a bug waiting to happen. Request bodies in the document are still
 * generated from the Joi schemas, so they cannot drift.
 */
export async function registerDocs(fastify, { version = '0.1.0' } = {}) {
  const document = buildOpenApiDocument({ version });

  await fastify.register(fastifySwagger, {
    mode: 'static',
    specification: { document }
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true }
  });

  // A stable, obvious URL for the spec. The plugins expose their own
  // (/docs/json, /documentation/json), but those are implementation details of
  // whichever version is installed; this one is ours and can be linked from the
  // README without going stale on an upgrade.
  fastify.get('/api/openapi.json', async () => fastify.swagger());
}
