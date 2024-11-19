import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {sep} from 'node:path';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteConfig, FarosConfig} from './command';

// constants
export const TEMP_DIR = 'tmp-';
export const FILENAME_PREFIX = 'faros_airbyte_cli';

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

// Write Airbyte config and catalog to temporary dir and a json file
// TODO: @FAI-14122 React secrets
// TODO: @FAI-14134 Discover catalog
export function writeConfig(tmpDir: string, config: FarosConfig) {
  const airbyteConfig = {
    src: config.src ?? ({} as AirbyteConfig),
    dst: config.dst ?? ({} as AirbyteConfig),
  };

  // write Airbyte config for user's reference
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
  const srcConfigFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_src_config.json`;
  const dstConfigFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_dst_config.json`;
  writeFileSync(srcConfigFilePath, JSON.stringify(airbyteConfig.src.config ?? {}, null, 2));
  writeFileSync(dstConfigFilePath, JSON.stringify(airbyteConfig.dst.config ?? {}, null, 2));
  logger.debug(`Airbyte config files written to: ${srcConfigFilePath}, ${dstConfigFilePath}`);

  // write catalog to temporary directory catalog files
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
}
