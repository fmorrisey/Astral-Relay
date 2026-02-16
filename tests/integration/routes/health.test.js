import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildFastify } from '../../helpers/fastify.js';

describe('GET /api/health', () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns health status', async () => {
    app = await buildFastify();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    assert.strictEqual(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.status, 'healthy');
    assert.strictEqual(body.database, 'connected');
    assert.ok('workspace' in body);
    assert.ok('uptime' in body);
    assert.ok(typeof body.uptime === 'number');
  });

  it('includes database status', async () => {
    app = await buildFastify();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    const body = JSON.parse(response.body);
    assert.strictEqual(body.database, 'connected');
  });

  it('includes workspace status', async () => {
    app = await buildFastify();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    const body = JSON.parse(response.body);
    assert.ok(['mounted', 'not mounted'].includes(body.workspace));
  });
});
