import {spawnSync} from 'node:child_process';
import {
  accessSync,
  constants,
  createReadStream,
  createWriteStream,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {sep} from 'node:path';
import readline from 'node:readline';
import {Writable} from 'node:stream';

import pino from 'pino';
import pretty from 'pino-pretty';

import {AirbyteCliContext, AirbyteConfig, FarosConfig} from './types';

// constants
export enum OutputStream {
  STDERR = 'STDERR',
  STDOUT = 'STDOUT',
}
export const FILENAME_PREFIX = 'faros_airbyte_cli';
export const SRC_CONFIG_FILENAME = `${FILENAME_PREFIX}_src_config.json`;
export const DST_CONFIG_FILENAME = `${FILENAME_PREFIX}_dst_config.json`;
export const SRC_CATALOG_FILENAME = `${FILENAME_PREFIX}_src_catalog.json`;
export const DST_CATALOG_FILENAME = `${FILENAME_PREFIX}_dst_catalog.json`;
export const DEFAULT_STATE_FILE = 'state.json';
export const SRC_INPUT_DATA_FILE = `${FILENAME_PREFIX}_src_data`;
export const SRC_OUTPUT_DATA_FILE = `${FILENAME_PREFIX}_src_output`;

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

// Read file content
export function readFile(file: string): any {
  try {
    const data = readFileSync(file, 'utf8');
    return data;
  } catch (error: any) {
    throw new Error(`Failed to read '${file}': ${error.message}`);
  }
}

// Write file content
export function writeFile(file: string, data: any): void {
  try {
    writeFileSync(file, data);
  } catch (error: any) {
    throw new Error(`Failed to write '${file}': ${error.message}`);
  }
}

/**
 * Process the source output.
 *
 * Command line:
 *  tee >(
 *    jq -cR $jq_color_opt --unbuffered 'fromjson? |
 *    select(.type != "RECORD" and .type != "STATE")' |
 *     jq -rR --unbuffered "$jq_src_msg" >&2
 *   ) |
 *   jq -cR --unbuffered "fromjson? |
 *   select(.type == \"RECORD\" or .type == \"STATE\") |
 *   .record.stream |= \"${dst_stream_prefix}\" + ." |
 *   tee "$output_filepath" | ...
 *
 *  jq_src_msg="\"${GREEN}[SRC]: \" + ${JQ_TIMESTAMP} + \" - \" + ."
 *
 *
 * Note: `dst_stream_prefix` command option is dropped
 */

// Processing the source line by line
export function processSrcDataByLine(line: string, outputStream: Writable, cfg: FarosConfig): void {
  // Reformat the JSON message
  function formatSrcMsg(json: any): string {
    return `[SRC] - ${JSON.stringify(json)}`;
  }
  // skip empty lines
  if (line.trim() === '') {
    return;
  }

  try {
    const data = JSON.parse(line);

    // non RECORD and STATE type messages: print as stdout
    // RECORD and STATE type messages: when the output is set to stdout
    if ((data.type !== 'RECORD' && data.type !== 'STATE') || cfg.srcOutputFile === OutputStream.STDOUT) {
      if (cfg.rawMessages) {
        process.stdout.write(`${line}\n`);
      } else {
        logger.info(formatSrcMsg(data));
      }
    }
    // RECORD and STATE type messages: write to output file
    else {
      outputStream.write(`${line}\n`);
    }
  } catch (error: any) {
    throw new Error(`Line of data: '${line}'; Error: ${error.message}`);
  }
}

export function processSrcInputFile(tmpDir: string, cfg: FarosConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    // create input and output streams:
    // - input stream: read from the data file user provided
    // - output stream: write to an intermediate file. Overwrite the file if it exists, otherwise create a new one
    const inputStream = createReadStream(cfg.srcInputFile!);
    const outputStream = createWriteStream(`${tmpDir}/${SRC_OUTPUT_DATA_FILE}`);

    // create readline interface
    const rl = readline.createInterface({
      input: inputStream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        processSrcDataByLine(line, outputStream, cfg);
      } catch (error: any) {
        rl.emit('error', error);
      }
    })
      .on('close', () => {
        logger.debug('Finished processing the source output data.');
        outputStream.end();
        resolve();
      })
      .on('error', (error) => {
        outputStream.end();
        reject(new Error(`Failed to process the source output data: ${error.message ?? JSON.stringify(error)}`));
      });

    outputStream.on('error', (error: any) => {
      outputStream.end();
      reject(new Error(`Failed to write to the output file: ${error.message ?? JSON.stringify(error)}`));
    });
  });
}
