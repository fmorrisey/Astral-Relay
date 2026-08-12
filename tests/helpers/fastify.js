import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join as joinPath } from 'path';
import { TestDB } from './db.js';
import { Post } from '../../src/models/Post.js';
import { User } from '../../src/models/User.js';
import { Media } from '../../src/models/Media.js';
import { Tag } from '../../src/models/Tag.js';
import { AuthService } from '../../src/services/auth.js';
import { StorageService } from '../../src/services/storage.js';
import { ThumbnailService } from '../../src/services/thumbnails.js';
import { ExportService } from '../../src/services/exporter.js';

import healthRoutes from '../../src/routes/health.js';
import authRoutes from '../../src/routes/auth.js';
import postRoutes from '../../src/routes/posts.js';
import mediaRoutes from '../../src/routes/media.js';
import tagRoutes from '../../src/routes/tags.js';
import setupRoutes from '../../src/routes/setup.js';
import userRoutes from '../../src/routes/users.js';

/**
 * Build a Fastify instance for testing
 */
export async function buildFastify(options = {}) {
  const db = new TestDB();

  // Initialize models and services
  const postModel = new Post(db);
  const userModel = new User(db);
  const mediaModel = new Media(db);
  const tagModel = new Tag(db);
  const authService = new AuthService(db);
  const storageService = new StorageService('/tmp/test-workspace');
  const thumbnailService = new ThumbnailService({
    workspacePath: '/tmp/test-workspace',
    // Fresh per instance. A fixed directory persisted between runs, and because
    // ensure() caches on existence with reused fixture ids, a leftover file made
    // the "source is missing" test answer 200 on the next run.
    thumbnailDir: mkdtempSync(joinPath(tmpdir(), 'relay-test-thumbs-'))
  });
  const exportService = new ExportService({
    workspacePath: '/tmp/test-workspace',
    collections: ['blog']
  });

  // Insert default config for collections
  db.prepare(`
    INSERT OR REPLACE INTO config (key, value)
    VALUES ('collections', '["blog"]')
  `).run();

  const fastify = Fastify({
    logger: false,
    ...options
  });

  // Activity logging helper
  function logActivity({ userId, action, resourceType, resourceId, metadata, ipAddress }) {
    try {
      db.prepare(`
        INSERT INTO activity_log (user_id, action, resource_type, resource_id, metadata, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, action, resourceType, resourceId, JSON.stringify(metadata || {}), ipAddress);
    } catch (err) {
      // Silently fail in tests
    }
  }

  // Decorate fastify with shared instances
  fastify.decorate('db', db);
  fastify.decorate('postModel', postModel);
  fastify.decorate('userModel', userModel);
  fastify.decorate('mediaModel', mediaModel);
  fastify.decorate('tagModel', tagModel);
  fastify.decorate('authService', authService);
  fastify.decorate('storageService', storageService);
  fastify.decorate('thumbnailService', thumbnailService);
  fastify.decorate('exportService', exportService);
  fastify.decorate('logActivity', logActivity);

  // Register plugins
  await fastify.register(fastifyCookie, {
    secret: 'test-secret-key-for-testing-only'
  });

  await fastify.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10485760 // 10MB
    }
  });

  // Collect every route as it registers. printRoutes() renders a tree, so a
  // path is split across lines and cannot be reassembled reliably -- an earlier
  // attempt to parse it silently matched nothing, which made the coverage test
  // pass without checking anything.
  const registeredRoutes = [];
  fastify.addHook('onRoute', route => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) registeredRoutes.push({ method, url: route.url });
  });
  fastify.decorate('registeredRoutes', registeredRoutes);

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(postRoutes);
  await fastify.register(mediaRoutes);
  await fastify.register(tagRoutes);
  await fastify.register(setupRoutes);
  await fastify.register(userRoutes);

  return fastify;
}
