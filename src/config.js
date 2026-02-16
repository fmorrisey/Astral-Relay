import { randomBytes } from 'crypto';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3030', 10),
  host: process.env.HOST || '0.0.0.0',

  dbPath: process.env.DB_PATH || './data/relay.db',
  workspacePath: process.env.WORKSPACE_PATH || '/workspace',

  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '604800000', 10),

  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10),

  gitSyncEnabled: process.env.GIT_SYNC_ENABLED === 'true',
  gitBranch: process.env.GIT_BRANCH || 'main',

  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT || '5000', 10),

  logLevel: process.env.LOG_LEVEL || 'info'
};

export default config;
