export const rateLimitConfig = {
  global: {
    max: 100,
    timeWindow: '15 minutes'
  },
  auth: {
    max: 10,
    timeWindow: '15 minutes'
  },
  upload: {
    max: 20,
    timeWindow: '15 minutes'
  }
};
