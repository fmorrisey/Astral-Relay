import logger from '../utils/logger.js';

export function errorHandler(error, request, reply) {
  logger.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method
  }, 'Request error');

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500
    ? 'Internal server error'
    : error.message;

  reply.status(statusCode).send({
    error: message,
    statusCode
  });
}
