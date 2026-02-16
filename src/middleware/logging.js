import logger from '../utils/logger.js';

export function requestLogging(request, reply, done) {
  const start = Date.now();

  reply.raw.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`
    }, 'request');
  });

  done();
}
