import pino from 'pino';
import { config } from '../config.js';

/**
 * Pino logger configuration
 * Development: pretty print
 * Production: JSON format
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isDev ? 'debug' : 'info'),
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Child logger для конкретных модулей
 */
export const createLogger = (module: string) => {
  return logger.child({ module });
};
