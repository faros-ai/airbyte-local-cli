import {spawnSync} from 'node:child_process';
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
    const data = await readFile(configFilePath, 'utf8');
    const configJson = JSON.parse(data);
    const config = {
      src: configJson.src as AirbyteConfig,
      dst: configJson.dst as AirbyteConfig,
    };

    const validateConfig = (cfg: AirbyteConfig) => {
      const allowedKeys = ['image', 'config', 'catalog', 'dockerOptions'];
      return Object.keys(cfg).every((key) => allowedKeys.includes(key));
    };
    if (!validateConfig(config.src) || !validateConfig(config.dst)) {
      throw new Error(`Invalid config file json format. Please check if it contains invalid properties.`);
    }

    return config;
  } catch (error: any) {
    throw new Error(`Failed to read or parse config file: ${error.message}`);
  }
}

// Check if Docker is installed
export function checkDockerInstalled(command = 'docker', args = ['--version']) {
  const result = spawnSync(command, args, {shell: false});

  if (result.error) {
    throw new Error(`Docker is not installed: ${result.error.message}`);
  } else if (result.status !== 0) {
    throw new Error(`Docker is not installed: ${result.stderr.toString()}`);
  }
}
