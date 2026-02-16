import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

import config from './config.js';
import logger from './utils/logger.js';
import DB from './db/index.js';
import { Post } from './models/Post.js';
import { User } from './models/User.js';
import { Media } from './models/Media.js';
import { Tag } from './models/Tag.js';
import { AuthService } from './services/auth.js';
import { StorageService } from './services/storage.js';
import { ExportService } from './services/exporter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogging } from './middleware/logging.js';
import { rateLimitConfig } from './middleware/rateLimit.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import mediaRoutes from './routes/media.js';
import tagRoutes from './routes/tags.js';
import setupRoutes from './routes/setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Ensure data directory exists
const dataDir = dirname(config.dbPath.startsWith('/') ? config.dbPath : join(projectRoot, config.dbPath));
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = config.dbPath.startsWith('/') ? config.dbPath : join(projectRoot, config.dbPath);

// Initialize database
const db = new DB(dbPath);
db.migrate();

// Get collections from DB config
const collectionsRow = db.prepare("SELECT value FROM config WHERE key = 'collections'").get();
const collections = collectionsRow ? JSON.parse(collectionsRow.value) : ['blog'];

// Initialize models and services
const postModel = new Post(db);
const userModel = new User(db);
const mediaModel = new Media(db);
const tagModel = new Tag(db);
const authService = new AuthService(db);
const storageService = new StorageService(config.workspacePath);
const exportService = new ExportService({
  workspacePath: config.workspacePath,
  collections
});

// Create Fastify instance
const fastify = Fastify({
  logger: false,
  trustProxy: true
});

// Activity logging helper
function logActivity({ userId, action, resourceType, resourceId, metadata, ipAddress }) {
  try {
    db.prepare(`
      INSERT INTO activity_log (user_id, action, resource_type, resource_id, metadata, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, action, resourceType, resourceId, JSON.stringify(metadata || {}), ipAddress);
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to log activity');
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
fastify.decorate('exportService', exportService);
fastify.decorate('logActivity', logActivity);

// Register plugins
await fastify.register(fastifyCookie, {
  secret: config.sessionSecret
});

await fastify.register(fastifyCors, {
  origin: (() => {
    const raw = process.env.FRONTEND_ORIGINS || process.env.ALLOWED_ORIGINS || '';
    if (!raw) return true; // reflect origin
    const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length === 0) return true;
    if (allowed.length === 1) return allowed[0];
    return (origin, cb) => {
      if (!origin) return cb(null, false);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    };
  })(),
  credentials: true
});

await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: config.maxUploadSize
  }
});

await fastify.register(fastifyRateLimit, rateLimitConfig.global);

// Serve static frontend
await fastify.register(fastifyStatic, {
  root: join(projectRoot, 'public'),
  prefix: '/'
});

// Request logging
fastify.addHook('onRequest', requestLogging);

// Error handler
fastify.setErrorHandler(errorHandler);

// Register routes
await fastify.register(healthRoutes);
await fastify.register(authRoutes);
await fastify.register(postRoutes);
await fastify.register(mediaRoutes);
await fastify.register(tagRoutes);
await fastify.register(setupRoutes);

// SPA fallback - serve index.html for non-API, non-file routes
fastify.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.status(404).send({ error: 'Not found' });
  }
  return reply.sendFile('index.html');
});

// Clean expired sessions periodically
setInterval(() => {
  try {
    const cleaned = authService.cleanExpiredSessions();
    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} expired sessions`);
    }
  } catch (err) {
    logger.error({ error: err.message }, 'Session cleanup failed');
  }
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown
function shutdown() {
  logger.info('Shutting down...');
  db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
try {
  await fastify.listen({ port: config.port, host: config.host });
  logger.info(`Astral Relay running on http://${config.host}:${config.port}`);
} catch (err) {
  logger.error(err);
  process.exit(1);
}
