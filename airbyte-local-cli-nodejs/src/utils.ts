import {spawnSync} from 'node:child_process';
import {accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {sep} from 'node:path';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteCliContext, AirbyteConfig, FarosConfig} from './types';

// constants
export const FILENAME_PREFIX = 'faros_airbyte_cli';
export const SRC_CONFIG_FILENAME = `${FILENAME_PREFIX}_src_config.json`;
export const DST_CONFIG_FILENAME = `${FILENAME_PREFIX}_dst_config.json`;
export const SRC_CATALOG_FILENAME = `${FILENAME_PREFIX}_src_catalog.json`;
export const DST_CATALOG_FILENAME = `${FILENAME_PREFIX}_dst_catalog.json`;
export const DEFAULT_STATE_FILE = 'state.json';

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

/**
 * Create a temporary directory
 * The default temporary directory would be under system default temporaray dir e.g. `/tmp`
 * with appending six random characters for uniqueness, like `/tmp/abc123`
 * @param absTmpDir Testing purpose. Customized absolute path to the temporary directory
 * @returns The absolute path of the temporary directory
 */
export function createTmpDir(absTmpDir?: string): string {
  try {
    logger.debug(`Creating temporary directory for temporary Airbyte files...`);
    const tmpDirPath = mkdtempSync(absTmpDir ?? `${tmpdir()}${sep}`);
    logger.debug(`Temporary directory created: ${tmpDirPath}.`);
    return tmpDirPath;
  } catch (error: any) {
    throw new Error(`Failed to create temporary directory: ${error.message}`);
  }
}

// Load the existing state file and write to the temporary folder
export function loadStateFile(tempDir: string, filePath?: string, connectionName?: string): void {
  const path = filePath ?? (connectionName ? `${connectionName}__state.json` : DEFAULT_STATE_FILE);

  // Read the state file and write to temp folder
  // Write an empty state file if the state file hasn't existed yet
  try {
    accessSync(path, constants.R_OK);
    const stateData = readFileSync(path, 'utf8');
    logger.debug(`Writing state file to temporary directory: '${tempDir}/${DEFAULT_STATE_FILE}'...`);
    writeFileSync(`${tempDir}/${DEFAULT_STATE_FILE}`, stateData);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read state file '${path}' : ${error.message}`);
    } else if (filePath) {
      throw new Error(
        `State file '${filePath}' not found. Please make sure the state file exists and have read access.`,
      );
    }
    writeFileSync(`${tempDir}/${DEFAULT_STATE_FILE}`, '{}');
    logger.debug(`State file '${DEFAULT_STATE_FILE}' not found. An empty state file is created.`);
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

// Write Airbyte config and catalog to temporary dir and a json file
export function writeConfig(tmpDir: string, config: FarosConfig): void {
  const airbyteConfig = {
    src: config.src ?? ({} as AirbyteConfig),
    dst: config.dst ?? ({} as AirbyteConfig),
  };

  // write Airbyte config for user's reference
  // TODO: @FAI-14122 React secrets
  logger.debug(`Writing Airbyte config for user reference...`);
  writeFileSync(`${FILENAME_PREFIX}_config.json`, JSON.stringify(airbyteConfig, null, 2));
  logger.debug(airbyteConfig, `Airbyte config: `);
  logger.debug(`Airbyte config written to: ${FILENAME_PREFIX}_config.json`);

  // add config `feed_cfg.debug` if debug is enabled
  const regex = /^farosai\/airbyte-faros-feeds-source.*/;
  if (config.debug && regex.exec(airbyteConfig.src.image ?? '')) {
    airbyteConfig.src.config = {
      ...airbyteConfig.src.config,
      feed_cfg: {debug: true},
    };
  }

  // write config to temporary directory config files
  logger.debug(`Writing Airbyte config to files...`);
  const srcConfigFilePath = `${tmpDir}${sep}${SRC_CONFIG_FILENAME}`;
  const dstConfigFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_dst_config.json`;
  writeFileSync(srcConfigFilePath, JSON.stringify(airbyteConfig.src.config ?? {}, null, 2));
  writeFileSync(dstConfigFilePath, JSON.stringify(airbyteConfig.dst.config ?? {}, null, 2));
  logger.debug(`Airbyte config files written to: ${srcConfigFilePath}, ${dstConfigFilePath}`);

  // write catalog to temporary directory catalog files
  // TODO: @FAI-14134 Discover catalog
  logger.debug(`Writing Airbyte catalog to files...`);
  const srcCatalogFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_src_catalog.json`;
  const dstCatalogFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_dst_catalog.json`;
  if (
    (!airbyteConfig.dst.catalog || Object.keys(airbyteConfig.dst.catalog).length === 0) &&
    airbyteConfig.src.catalog &&
    Object.keys(airbyteConfig.src.catalog).length > 0
  ) {
    airbyteConfig.dst.catalog = airbyteConfig.src.catalog;
  }
  writeFileSync(srcCatalogFilePath, JSON.stringify(airbyteConfig.src.catalog ?? {}, null, 2));
  writeFileSync(dstCatalogFilePath, JSON.stringify(airbyteConfig.dst.catalog ?? {}, null, 2));
  logger.debug(`Airbyte catalog files written to: ${srcCatalogFilePath}, ${dstCatalogFilePath}`);
}
