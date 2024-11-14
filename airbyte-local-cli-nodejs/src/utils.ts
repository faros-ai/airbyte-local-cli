import {exec, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteConfig} from './types';

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
export function checkDockerInstalled(command = 'docker --version'): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, (error, _stdout, _stderr) => {
      if (error) {
        reject(new Error('Docker is not installed.'));
      } else {
        resolve();
      }
    });
  });
}

// Create a temporary directory
export function createTmpDir() {
  const systmeTmpDirPath = tmpdir();
  logger.info(`Creating temporary directory for temporary Airbyte files...`);
  const tmpDirPath = mkdtempSync(systmeTmpDirPath);
  logger.info(`Temporary directory created: ${tmpDirPath}.`);
  return tmpDirPath;
}

// Load the state file and write to temp folder state file
export async function loadStateFile(tempDir: string, file: string | undefined, connectionName: string | undefined) {
  const stateFilePath = file ?? (connectionName ? `${connectionName}__state.json` : 'state.json');
  logger.info(`Loading state file: '${stateFilePath}'...`);

  const state = (await readFile(stateFilePath, 'utf8')) ?? '{}';
  writeFileSync(`${tempDir}/${stateFilePath}`, state);

  return stateFilePath;
}

export function cleanUp(context: AirbyteCliContext) {
  logger.info('Cleaning up...');
  spawnSync(`rm -rf ${context.tmpDir}`);
}
