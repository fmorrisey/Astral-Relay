import { env, parseMax, parseWindow } from '../utils/envUtils.js';

export const rateLimitConfig = {
  global: {
    max: parseMax(env.RATE_LIMIT_GLOBAL_MAX, 100),
    timeWindow: parseWindow(env.RATE_LIMIT_GLOBAL_WINDOW, '15 minutes')
  },
  auth: {
    max: parseMax(env.RATE_LIMIT_AUTH_MAX, 10),
    timeWindow: parseWindow(env.RATE_LIMIT_AUTH_WINDOW, '15 minutes')
  },
  upload: {
    max: parseMax(env.RATE_LIMIT_UPLOAD_MAX, 20),
    timeWindow: parseWindow(env.RATE_LIMIT_UPLOAD_WINDOW, '15 minutes')
  }
};
