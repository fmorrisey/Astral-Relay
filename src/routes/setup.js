import { existsSync } from 'fs';
import { join } from 'path';

export default async function setupRoutes(fastify) {
  // Check setup status
  fastify.get('/api/setup/status', async () => {
    const setupComplete = fastify.db
      .prepare("SELECT value FROM config WHERE key = 'setup_complete'")
      .get();

    const version = fastify.db
      .prepare("SELECT value FROM config WHERE key = 'version'")
      .get();

    return {
      setupComplete: setupComplete?.value === 'true',
      version: version?.value || '1.0.0'
    };
  });

  // Get collections
  fastify.get('/api/setup/collections', async () => {
    const result = fastify.db
      .prepare("SELECT value FROM config WHERE key = 'collections'")
      .get();

    let collections;
    if (result?.value) {
      try {
        collections = JSON.parse(result.value);
      } catch (error) {
        collections = ['blog'];
      }
    } else {
      collections = ['blog'];
    }
    return { collections };
  });

  // Validate workspace
  fastify.post('/api/setup/validate', async (request, reply) => {
    const { workspacePath } = request.body || {};
    const wsPath = workspacePath || '/workspace';

    if (!existsSync(wsPath)) {
      return reply.status(400).send({
        valid: false,
        errors: ['Workspace path does not exist']
      });
    }

    const checks = {
      astroConfig: existsSync(join(wsPath, 'astro.config.mjs'))
        || existsSync(join(wsPath, 'astro.config.js'))
        || existsSync(join(wsPath, 'astro.config.ts')),
      packageJson: existsSync(join(wsPath, 'package.json')),
      hasSrcContent: existsSync(join(wsPath, 'src', 'content'))
    };

    const errors = [];
    const warnings = [];

    if (!checks.astroConfig) errors.push('No astro.config.* found');
    if (!checks.packageJson) errors.push('Missing package.json');
    if (!checks.hasSrcContent) warnings.push('No src/content directory found (will be created)');

    if (errors.length > 0) {
      return reply.status(400).send({ valid: false, errors, warnings });
    }

    return {
      valid: true,
      ...checks,
      warnings
    };
  });
}
