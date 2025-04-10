import pino from 'pino';
import pretty from 'pino-pretty';

// Create a pino logger instance
export const logger = pino(pretty({colorize: true}));
