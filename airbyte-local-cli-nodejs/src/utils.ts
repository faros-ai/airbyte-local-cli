import {spawnSync} from 'node:child_process';
import {accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {sep} from 'node:path';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteCliContext, AirbyteConfig} from './types';

// Create a pino logger instance
export const logger = pino(pretty({colorize: true}));

export function updateLogLevel(debug: boolean | undefined): void {
  logger.level = debug ? 'debug' : 'info';
}

// Read the config file and covert to AirbyteConfig
export function parseConfigFile(configFilePath: string): {src: AirbyteConfig; dst: AirbyteConfig} {
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
function execCommand(command: string, args: string[], options?: {errMsg: string}): void {
  const result = spawnSync(command, args, {shell: false});

  if (result.error || result.status !== 0) {
    const errInfoMsg = options?.errMsg ? `${options?.errMsg}: ` : '';
    const errMsg = (result.error ? result.error?.message : result.stderr?.toString()) ?? `unknown error`;
    throw new Error(`${errInfoMsg}${errMsg}`);
  }
}

// Check if Docker is installed
export function checkDockerInstalled(command = 'docker', args = ['--version']): void {
  execCommand(command, args, {errMsg: 'Docker is not installed'});
}

// Create a temporary directory
// The default temporary directory would be under system default temporaray dir e.g. `/tmp`
// with appending six random characters for uniqueness, like `/tmp/abc123`
export function createTmpDir(tmpDir?: string): string {
  try {
    logger.debug(`Creating temporary directory for temporary Airbyte files...`);
    const tmpDirPath = mkdtempSync(tmpDir ?? `${tmpdir()}${sep}`);
    logger.debug(`Temporary directory created: ${tmpDirPath}.`);
    return tmpDirPath;
  } catch (error: any) {
    throw new Error(`Failed to create temporary directory: ${error.message}`);
  }
}

// Load the existing state file and write to the temporary folder
export function loadStateFile(tempDir: string, filePath?: string, connectionName?: string): void {
  const path = filePath ?? (connectionName ? `${connectionName}__state.json` : 'state.json');
  const name = 'state.json';

  // Read the state file and write to temp folder
  // Write an empty state file if the state file hasn't existed yet
  try {
    accessSync(path, constants.R_OK);
    const stateData = readFileSync(path, 'utf8');
    logger.debug(`Writing state file to temporary directory: '${tempDir}/${name}'...`);
    writeFileSync(`${tempDir}/${name}`, stateData);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read state file '${path}' : ${error.message}`);
    } else if (filePath) {
      throw new Error(
        `State file '${filePath}' not found. Please make sure the state file exists and have read access.`,
      );
    }
    writeFileSync(`${tempDir}/${name}`, '{}');
    logger.debug(`State file '${name}' not found. An empty state file is created.`);
  }
}

export function cleanUp(context: AirbyteCliContext): void {
  logger.info('Cleaning up...');
  if (context.tmpDir !== undefined) {
    try {
      rmSync(context.tmpDir, {recursive: true, force: true});
      logger.debug(`Temporary directory ${context.tmpDir} removed.`);
    } catch (error: any) {
      logger.error(`Failed to remove temporary directory ${context.tmpDir}: ${error.message}`);
    }
  }
  logger.info('Clean up completed.');
}
