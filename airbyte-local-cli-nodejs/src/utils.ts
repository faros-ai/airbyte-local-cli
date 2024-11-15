import {spawnSync} from 'node:child_process';
import {accessSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteCliContext, AirbyteConfig} from './types';

// Create a pino logger instance
export const logger = pino(pretty({colorize: true}));

export function updateLogLevel(debug: boolean | undefined) {
  logger.level = debug ? 'debug' : 'info';
}

// Read the config file and covert to AirbyteConfig
export function parseConfigFile(configFilePath: string) {
  try {
    const data = readFileSync(configFilePath, 'utf8');
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

// Run a command and throw an error if it fails
export function execCommand(command: string, options?: {errMsg: string}) {
  const result = spawnSync(command, {shell: false});

  const errInfoMsg = options?.errMsg ? `${options?.errMsg}: ` : '';
  const errMsg = (result.error ? result.error.message : result.stderr.toString()) ?? `unknown error`;

  if (result.error || result.status !== 0) {
    throw new Error(`${errInfoMsg}${errMsg}`);
  }
}

// Check if Docker is installed
export function checkDockerInstalled(command = 'docker --version') {
  execCommand(command, {errMsg: 'Docker is not installed'});
}

// Create a temporary directory
export function createTmpDir() {
  logger.info(`Creating temporary directory for temporary Airbyte files...`);
  const tmpDirPath = mkdtempSync('tmp-');
  logger.info(`Temporary directory created: ${tmpDirPath}.`);
  return tmpDirPath;
}

// Load the state file and write to temp folder state file
export function loadStateFile(tempDir: string, file: string | undefined, connectionName: string | undefined) {
  const stateFilePath = file ?? (connectionName ? `${connectionName}__state.json` : 'state.json');
  logger.info(`Loading state file: '${stateFilePath}'...`);

  accessSync(stateFilePath);

  const state = readFileSync(stateFilePath, 'utf8') ?? '{}';
  writeFileSync(`${tempDir}/${stateFilePath}`, state);
  return stateFilePath;
}

export function cleanUp(context: AirbyteCliContext) {
  logger.info('Cleaning up...');
  execCommand(`rm -rf ${context.tmpDir}`, {errMsg: 'Failed to clean up temporary directory'});
  logger.info('Clean up completed.');
}
