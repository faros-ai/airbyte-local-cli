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
import {pipeline, Transform, Writable} from 'node:stream';
import {promisify} from 'node:util';

import {isNil, omitBy} from 'lodash';
import pino from 'pino';
import pretty from 'pino-pretty';

import {inspectDockerImage, runDiscoverCatalog} from './docker';
import {
  AirbyteCatalog,
  AirbyteCliContext,
  AirbyteConfig,
  AirbyteConfiguredCatalog,
  AirbyteStream,
  DestinationSyncMode,
  FarosConfig,
  SyncMode,
} from './types';

// constants
export enum OutputStream {
  STDERR = 'STDERR',
  STDOUT = 'STDOUT',
}
export enum ImageType {
  SRC = 'source',
  DST = 'destination',
}
export const FILENAME_PREFIX = 'faros_airbyte_cli';
export const CONFIG_FILE = `${FILENAME_PREFIX}_config.json`;
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

// Log the docker image digest and version
export async function logImageVersion(type: ImageType, image: string | undefined): Promise<void> {
  if (image === undefined) {
    return;
  }
  const {digest, version} = await inspectDockerImage(image);
  logger.info(`Using ${type} image digest ${digest}`);
  logger.info(`Using ${type} image version ${version}`);
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
      if (!cfg) {
        return true;
      }
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
export function loadStateFile(tempDir: string, filePath?: string, connectionName?: string): string {
  const path = filePath ?? (connectionName ? `${connectionName}__state.json` : DEFAULT_STATE_FILE);

  // Read the state file and write to temp folder
  // Write an empty state file if the state file hasn't existed yet
  try {
    accessSync(path, constants.R_OK);
    const stateData = readFileSync(path, 'utf8');
    logger.info(`Using state file: '${path}'`);

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
    logger.debug(`State file '${path}' not found. An empty state file will be created.`);
  }
  return path;
}

export function cleanUp(context: AirbyteCliContext): void {
  logger.debug('Cleaning up...');
  if (context.tmpDir !== undefined) {
    try {
      rmSync(context.tmpDir, {recursive: true, force: true});
      logger.debug(`Temporary directory ${context.tmpDir} removed.`);
    } catch (error: any) {
      logger.error(`Failed to remove temporary directory ${context.tmpDir}: ${error.message}`);
    }
  }
  logger.debug('Clean up completed.');
}

export function overrideCatalog(
  catalog: object,
  defaultCatalog: AirbyteCatalog,
  fullRefresh = false,
): AirbyteConfiguredCatalog {
  const streams = (catalog as AirbyteConfiguredCatalog)?.streams ?? [];
  const streamsMap = new Map(streams.map((stream) => [stream.stream.name, stream]));

  // overwrite the default catalog with user provided catalog
  const processedCatalog: AirbyteConfiguredCatalog = {
    streams:
      defaultCatalog.streams
        ?.filter((stream: AirbyteStream) => !streamsMap.get(stream.name)?.disabled)
        ?.map((stream: AirbyteStream) => {
          const incremental =
            stream.supported_sync_modes?.includes(SyncMode.INCREMENTAL) &&
            streamsMap.get(stream.name)?.sync_mode !== SyncMode.FULL_REFRESH &&
            fullRefresh !== true;

          return {
            stream: {
              name: stream.name,
              json_schema: {},
              ...(stream.supported_sync_modes && {supported_sync_modes: stream.supported_sync_modes}),
            },
            sync_mode: incremental ? SyncMode.INCREMENTAL : SyncMode.FULL_REFRESH,
            destination_sync_mode:
              streamsMap.get(stream.name)?.destination_sync_mode ??
              (incremental ? DestinationSyncMode.APPEND : DestinationSyncMode.OVERWRITE),
          };
        }) ?? [],
  };

  return processedCatalog;
}

/**
 * Copy Faros API settings from destination config to source config.
 * This is for users' convenience so that they don't have to provide the same settings
 * in both source and destination configs.
 */
export function updateSrcConfigWithFarosConfig(airbyteConfig: {src: AirbyteConfig; dst: AirbyteConfig}): void {
  const srcDockerImage = airbyteConfig.src?.image;
  const dstDockerImage = airbyteConfig.dst?.image;
  const dstConfig = airbyteConfig.dst?.config as any;

  if (
    srcDockerImage?.startsWith('farosai/airbyte-faros-feeds-source') &&
    dstDockerImage?.startsWith('farosai/airbyte-faros-destination')
  ) {
    // take Faros API settings from destination config
    const farosApiConfig: any = {
      api_key: dstConfig?.edition_configs?.api_key,
      api_url: dstConfig?.edition_configs?.api_url,
      graph: dstConfig?.edition_configs?.graph,
      graph_api: dstConfig?.edition_configs?.graph_api,
    };
    const compactFarosApiConfig = omitBy(farosApiConfig, isNil);
    if (Object.entries(compactFarosApiConfig).length === 0) {
      return;
    }

    const debugLog = JSON.stringify({faros: compactFarosApiConfig}).replace(
      compactFarosApiConfig?.['api_key'],
      'REDACTED',
    );
    logger.debug(`Updating source config with Faros API settings from destination config: ${debugLog}`);

    // merge Faros API config into source config
    airbyteConfig.src.config = {
      ...airbyteConfig.src.config,
      faros: compactFarosApiConfig,
    };
  }
}

/**
 * Write Airbyte config to temporary dir and a json file
 */
export function writeConfig(tmpDir: string, config: FarosConfig): void {
  const airbyteConfig = {
    src: config.src ?? ({} as AirbyteConfig),
    dst: config.dst ?? ({} as AirbyteConfig),
  };

  // write Airbyte config for user's reference
  // TODO: @FAI-14122 React secrets
  logger.debug(`Writing Airbyte config for user reference...`);
  writeFileSync(`${CONFIG_FILE}`, JSON.stringify(airbyteConfig, null, 2));
  logger.debug(`Airbyte config: ${JSON.stringify(airbyteConfig)}`);
  logger.debug(`Airbyte config written to: ${CONFIG_FILE}`);

  // add config `feed_cfg.debug` if debug is enabled
  const regex = /^farosai\/airbyte-faros-feeds-source.*/;
  if (config.debug && regex.exec(airbyteConfig.src.image ?? '')) {
    airbyteConfig.src.config = {
      ...airbyteConfig.src.config,
      feed_cfg: {debug: true},
    };
  }

  // if not running source only, copy faros api settings from destination config to source config
  if (!config.srcOutputFile) {
    updateSrcConfigWithFarosConfig(airbyteConfig);
  }

  // write config to temporary directory config files
  logger.debug(`Writing Airbyte config to files...`);
  const srcConfigFilePath = `${tmpDir}${sep}${SRC_CONFIG_FILENAME}`;
  const dstConfigFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_dst_config.json`;
  writeFileSync(srcConfigFilePath, JSON.stringify(airbyteConfig.src.config ?? {}));
  writeFileSync(dstConfigFilePath, JSON.stringify(airbyteConfig.dst.config ?? {}));
  logger.debug(`Source config: ${JSON.stringify(airbyteConfig.src.config ?? {})}`);
  logger.debug(`Destination config: ${JSON.stringify(airbyteConfig.dst.config ?? {})}`);
  logger.debug(`Airbyte config files written to: ${srcConfigFilePath}, ${dstConfigFilePath}`);
}

/**
 * Write Airbyte catalog to temporary directory catalog files
 */
export async function writeCatalog(tmpDir: string, config: FarosConfig): Promise<void> {
  logger.debug(`Writing Airbyte catalog to files...`);
  const srcCatalogFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_src_catalog.json`;
  const dstCatalogFilePath = `${tmpDir}${sep}${FILENAME_PREFIX}_dst_catalog.json`;
  let srcCatalog: AirbyteConfiguredCatalog;
  let dstCatalog: AirbyteConfiguredCatalog;

  if (config.srcInputFile) {
    // run dst only
    srcCatalog = {streams: []};
    dstCatalog = config.dst?.catalog ?? {streams: []};
  } else {
    // run discover catalog to get default catalog
    const defaultCatalog = await runDiscoverCatalog(tmpDir, config.src?.image);

    // src catalog: override the default with user provided catalog
    srcCatalog = overrideCatalog(config.src?.catalog ?? {}, defaultCatalog, config.fullRefresh);

    // dst catalog: use src catalog or override default with user provided dst catalog
    // append dst stream prefix to the stream name
    if (Object.keys(config.dst?.catalog?.streams ?? []).length === 0) {
      dstCatalog = structuredClone(srcCatalog);
    } else {
      dstCatalog = overrideCatalog(config.dst?.catalog ?? {}, defaultCatalog, config.fullRefresh);
    }
  }

  dstCatalog.streams.forEach((stream) => {
    stream.stream.name = `${config.dstStreamPrefix ?? ''}${stream.stream.name}`;
  });

  logger.debug(`Writing Airbyte catalog to files...`);
  writeFileSync(srcCatalogFilePath, JSON.stringify(srcCatalog));
  writeFileSync(dstCatalogFilePath, JSON.stringify(dstCatalog));
  logger.debug(`Source catalog: ${JSON.stringify(srcCatalog)}`);
  logger.debug(`Destination catalog: ${JSON.stringify(dstCatalog)}`);
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
 */
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
    if ((data?.type !== 'RECORD' && data?.type !== 'STATE') || cfg.srcOutputFile === OutputStream.STDOUT) {
      if (cfg.rawMessages) {
        process.stdout.write(`${line}\n`);
      } else {
        logger.info(formatSrcMsg(data));
      }
    }
    // RECORD and STATE type messages: write to output file
    else {
      if (data?.record?.stream && cfg.dstStreamPrefix) {
        data.record.stream = `${cfg.dstStreamPrefix ?? ''}${data.record.stream}`;
      }
      outputStream.write(`${JSON.stringify(data)}\n`);
    }
  } catch (error: any) {
    throw new Error(`Line of data: '${line}'; Error: ${error.message}`);
  }
}

/**
 * Process the source input file. (When `dstOnly` option flag is configured)
 * Read the source input file line by line and process the data. Write to an intermidiate file.
 */
const pipelineAsync = promisify(pipeline);
export async function processSrcInputFile(tmpDir: string, cfg: FarosConfig): Promise<void> {
  // create input and output streams
  const inputStream = createReadStream(cfg.srcInputFile!);
  const outputStream = createWriteStream(`${tmpDir}/${SRC_OUTPUT_DATA_FILE}`);

  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity,
  });

  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      const line = chunk.toString();
      try {
        processSrcDataByLine(line, outputStream, cfg);
        callback();
      } catch (error: any) {
        callback(error);
      }
    },
  });

  try {
    await pipelineAsync(rl, transform, outputStream);
  } catch (error: any) {
    throw new Error(`Failed to process the source input file: ${error.message}`);
  }
}

/**
 * Update `dstStreamPrefix` and `connectionName` in the config based on the source image.
 */
export function generateDstStreamPrefix(cfg: FarosConfig): void {
  const srcImage = cfg.src?.image;
  const dstImage = cfg.dst?.image;
  if (dstImage?.startsWith('farosai/airbyte-faros-destination')) {
    // if source image is a faros feed image
    if (
      !cfg.connectionName &&
      srcImage?.startsWith('farosai/airbyte-faros-feeds-source') &&
      (cfg.src?.config as any)?.feed_cfg?.feed_name
    ) {
      cfg.connectionName = `${(cfg.src?.config as any)?.feed_cfg?.feed_name}-feed`;
      logger.debug(`Using connection name: ${cfg.connectionName}`);
    }
    // if image is an airbyte image
    if (srcImage?.startsWith('farosai/airbyte')) {
      const [imageName] = srcImage.split(':');
      const imageParts = imageName?.split('-').slice(1, -1);
      cfg.connectionName = `my${imageParts?.join('') ?? ''}src`;
      cfg.dstStreamPrefix = `${cfg.connectionName}_${imageParts?.join('_') ?? ''}__`;
      logger.debug(`Using connection name: ${cfg.connectionName}`);
      logger.debug(`Using destination stream prefix: ${cfg.dstStreamPrefix}`);
    }
  }
}

export function processDstDataByLine(line: string, cfg: FarosConfig): string {
  // reformat the JSON message
  function formatDstMsg(json: any): string {
    return `[DST] - ${JSON.stringify(json)}`;
  }

  let state = '';

  // skip empty lines
  if (line.trim() === '') {
    return state;
  }

  try {
    const data = JSON.parse(line);

    if (data?.type === 'STATE' && data?.state?.data) {
      state = JSON.stringify(data.state.data);
      logger.debug(formatDstMsg(data));
    }
    if (cfg.rawMessages) {
      process.stdout.write(`${line}\n`);
    } else {
      logger.info(formatDstMsg(data));
    }
  } catch (error: any) {
    // log as errors but not throw it
    logger.error(`Line of data: '${line}'; Error: ${error.message}`);
  }
  return state;
}
