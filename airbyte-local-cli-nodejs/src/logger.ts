import pino from 'pino';
import pretty from 'pino-pretty';

// Create a pino logger instance
// export const logger = pino(
//   {
//     level: 'info',
//     transport: undefined as any, // no transport
//   },
//   pino.destination(1), // sync to stdout
// );
export const logger = pino(pretty({colorize: true}));
