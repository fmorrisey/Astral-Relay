import { randomBytes } from 'crypto';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3031', 10),
  host: process.env.HOST || '0.0.0.0',

  dbPath: process.env.DB_PATH || './data/relay.db',
  workspacePath: process.env.WORKSPACE_PATH || '/workspace',

  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '604800000', 10),

  // Defaults to on in production. Set COOKIE_SECURE=false only when the sole route
  // to this server is already encrypted below HTTP -- e.g. behind a tailnet-bound
  // reverse proxy, where WireGuard is the transport and there is no TLS to attach
  // the cookie to. Browsers silently DROP a Secure cookie sent over http://, so
  // leaving this on in that setup makes login return 200 and then not stick.
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : (process.env.NODE_ENV || 'development') === 'production',

  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10),

  gitSyncEnabled: process.env.GIT_SYNC_ENABLED === 'true',
  gitBranch: process.env.GIT_BRANCH || 'main',

  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000', 10),

  logLevel: process.env.LOG_LEVEL || 'info',

  // OpenAPI spec and the /docs UI. On by default outside production, because a
  // complete map of the API surface is not something every deployment should
  // publish unauthenticated. This install is tailnet-only, so it opts in.
  apiDocs: process.env.API_DOCS
    ? process.env.API_DOCS === 'true'
    : (process.env.NODE_ENV || 'development') !== 'production'
};

export default config;
