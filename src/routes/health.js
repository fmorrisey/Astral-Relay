import { existsSync } from 'fs';
import config from '../config.js';

export default async function healthRoutes(fastify) {
  fastify.get('/api/health', async () => {
    let dbStatus = 'connected';
    try {
      fastify.db.prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }

    const workspaceStatus = existsSync(config.workspacePath) ? 'mounted' : 'not mounted';

    return {
      status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
      database: dbStatus,
      workspace: workspaceStatus,
      uptime: Math.floor(process.uptime())
    };
  });
}
