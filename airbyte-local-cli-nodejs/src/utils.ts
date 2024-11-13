import {exec} from 'node:child_process';
import {readFile} from 'node:fs/promises';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteConfig} from './command';

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
      src: configJson.src as AirbyteConfig,
      dst: configJson.dst as AirbyteConfig,
    };

    return config;
  } catch (error: any) {
    throw new Error(`Failed to read config file: ${error.message}`);
  }
}

// Check if Docker is installed
export function checkDockerInstalled(): Promise<void> {
  return new Promise((resolve, reject) => {
    exec('docker --version', (error, _stdout, _stderr) => {
      if (error) {
        reject(new Error('Docker is not installed.'));
      } else {
        resolve();
      }
    });
  });
}
