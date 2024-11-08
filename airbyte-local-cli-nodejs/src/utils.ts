import {readFile} from 'node:fs/promises';

import pino from 'pino';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import pretty from 'pino-pretty';

import {AirbtyeConfig} from './command';

// Create a pino logger instance
export const logger = pino(pretty({colorize: true}));

export function updateLogLevel(debug: boolean | undefined) {
  logger.level = debug ? 'debug' : 'info';
}

// Read the config file and covert to AirbyteConfig
export async function parseConfigFile(configFilePath: string) {
  try {
    const file = await readFile(configFilePath, 'utf8');
    const configJson = JSON.parse(file);
    const config = {
      src: configJson.src as AirbtyeConfig,
      dst: configJson.dst as AirbtyeConfig,
    };

    return config;
  } catch (error: any) {
    throw new Error(`Failed to read config file: ${error.message}`);
  }
}
