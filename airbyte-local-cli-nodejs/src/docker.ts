import {createReadStream, createWriteStream, readFileSync, writeFileSync} from 'node:fs';
import {PassThrough, Writable} from 'node:stream';

import Docker from 'dockerode';

import {
  DEFAULT_STATE_FILE,
  DST_CATALOG_FILENAME,
  DST_CONFIG_FILENAME,
  SRC_CATALOG_FILENAME,
  SRC_CONFIG_FILENAME,
  SRC_OUTPUT_DATA_FILE,
  TMP_SPEC_CONFIG_FILENAME,
  TMP_WIZARD_CONFIG_FILENAME,
} from './constants/constants';
import {logger} from './logger';
import {
  AirbyteCatalog,
  AirbyteCatalogMessage,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteMessageType,
  AirbyteSpec,
  FarosConfig,
  OutputStream,
} from './types';
import {processSrcDataByLine} from './utils';

// Constants
const DEFAULT_MAX_LOG_SIZE = '10m';

// Create a new Docker instance
let _docker = new Docker();

// For testing purposes
export function setDocker(docker: Docker): void {
  _docker = docker;
}

export async function checkDockerInstalled(): Promise<void> {
  try {
    await _docker.version();
    logger.info('Docker is installed and running.');
  } catch (error: any) {
    logger.error('Docker is not installed or running.');
    throw error;
  }
}

export async function pullDockerImage(image: string): Promise<void> {
  logger.info(`Pulling docker image: ${image}`);

  try {
    const stream = await _docker.pull(image);
    await new Promise((resolve, reject) => {
      _docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
    logger.info(`Docker image pulled: ${image}`);
  } catch (error: any) {
    logger.error(`Failed to pull docker image: ${image}`);
    throw error;
  }
}

export async function inspectDockerImage(image: string): Promise<{digest: string; version: string}> {
  logger.debug(`Inspecting docker image: ${image}`);

  try {
    const imageInfo = await _docker.getImage(image).inspect();
    logger.debug(`Docker image inspected: ${image}`);

    const digest = imageInfo.RepoDigests[0];
    const version = imageInfo.Config.Labels['io.airbyte.version'];

    if (!digest || !version) {
      throw new Error('RepoDigests or airbyte version label is missing.');
    }
    return {digest, version};
  } catch (error: any) {
    logger.error(`Failed to inspect docker image: ${image}`);
    throw error;
  }
}

/**
 * Use 'linux/amd64' plaform for farosai images.
 */
function getImagePlatform(image: string): string | undefined {
  if (image?.startsWith('farosai')) {
    return 'linux/amd64';
  }
  return undefined;
}

/**
 * Spinning up a docker container to check the source connection.
 * `docker run --rm -v "$tempdir:/configs" $src_docker_options "$src_docker_image"
 *      check --config "/configs/$src_config_filename"`
 *
 * Sample output from the docker container:
 * {"connectionStatus":{"status":"SUCCEEDED"},"type":"CONNECTION_STATUS"}
 * {"connectionStatus":{"status":"FAILED","message":"Faros API key was not provided"},"type":"CONNECTION_STATUS"}
 */
export async function checkSrcConnection(tmpDir: string, image: string, srcConfigFile?: string): Promise<void> {
  logger.info('Validating connection to source...');

  if (!image) {
    throw new Error('Source image is missing.');
  }

  try {
    const cfgFile = srcConfigFile ?? SRC_CONFIG_FILENAME;
    const command = ['check', '--config', `/configs/${cfgFile}`];
    const createOptions: Docker.ContainerCreateOptions = {
      HostConfig: {
        Binds: [`${tmpDir}:/configs`],
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // create a writable stream to capture the output
    let data = '';
    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        data += chunk.toString();
        callback();
      },
    });

    // docker run
    const res = await _docker.run(image, command, outputStream, createOptions);

    // capture connection status from the output
    let status: AirbyteConnectionStatusMessage | undefined;
    data.split('\n').forEach((line) => {
      if (line.includes(AirbyteMessageType.CONNECTION_STATUS)) {
        status = JSON.parse(line) as AirbyteConnectionStatusMessage;
      }
    });
    if (
      status?.type === AirbyteMessageType.CONNECTION_STATUS &&
      status?.connectionStatus.status === AirbyteConnectionStatus.SUCCEEDED &&
      res[0].StatusCode === 0
    ) {
      logger.info('Source connection is valid.');
    } else {
      throw new Error(status?.connectionStatus.message);
    }
  } catch (error: any) {
    throw new Error(`Failed to validate source connection: ${error.message ?? JSON.stringify(error)}.`);
  }
}

/**
 * Get catalog configuration
 *
 * Docker cli command:
 * docker run --rm -v "$tempdir:/configs" "$src_docker_image" discover \
 *      --config "/configs/$src_config_filename"
 */
export async function runDiscoverCatalog(tmpDir: string, image: string | undefined): Promise<AirbyteCatalog> {
  logger.info('Discovering catalog...');

  if (!image) {
    throw new Error('Source image is missing.');
  }

  try {
    const command = ['discover', '--config', `/configs/${SRC_CONFIG_FILENAME}`];
    const createOptions: Docker.ContainerCreateOptions = {
      HostConfig: {
        Binds: [`${tmpDir}:/configs`],
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // create a writable stream to capture the output
    let data = '';
    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        data += chunk.toString();
        callback();
      },
    });

    // docker run
    const res = await _docker.run(image, command, outputStream, createOptions);

    // capture catalog output
    let rawCatalog: AirbyteCatalogMessage | undefined;
    data.split('\n').forEach((line) => {
      if (line.includes(AirbyteMessageType.CATALOG)) {
        rawCatalog = JSON.parse(line) as AirbyteCatalogMessage;
      } else {
        if (line) {
          process.stderr.write(`${line}\n`);
        }
      }
    });

    if (rawCatalog?.type === AirbyteMessageType.CATALOG && res[0].StatusCode === 0) {
      logger.info('Catalog discovered successfully.');
      return rawCatalog.catalog ?? {streams: []};
    }
    throw new Error('Catalog not found or container ends with non-zero status code');
  } catch (error: any) {
    throw new Error(`Failed to discover catalog: ${error.message ?? JSON.stringify(error)}.`);
  }
}

/**
 * Process the destination output.
 */
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

    if (data?.type === AirbyteMessageType.STATE && data?.state?.data) {
      state = JSON.stringify(data.state.data);
      logger.debug(formatDstMsg(data));
    }
    if (cfg.rawMessages) {
      process.stdout.write(`${line}\n`);
    } else {
      if (data?.type === AirbyteMessageType.LOG && data?.log?.level !== 'INFO') {
        if (data?.log?.level === 'ERROR') {
          logger.error(formatDstMsg(data));
        } else if (data?.log?.level === 'WARN') {
          logger.warn(formatDstMsg(data));
        } else if (data?.log?.level === 'DEBUG') {
          logger.debug(formatDstMsg(data));
        }
      } else {
        logger.info(formatDstMsg(data));
      }
    }
  } catch (error: any) {
    // log as errors but not throw it
    logger.error(`Line of data: '${line}'; Error: ${error.message}`);
  }
  return state;
}
/**
 * Filter out spec output
 */

export function processSpecByLine(line: string): AirbyteSpec | undefined {
  let spec;

  // skip empty lines
  if (line.trim() === '') {
    return spec;
  }

  try {
    const data = JSON.parse(line);
    if (data?.type === AirbyteMessageType.SPEC && data?.spec) {
      spec = data as AirbyteSpec;
      logger.debug(line);
    }
  } catch (error: any) {
    throw new Error(`Spec data: '${line}'; Error: ${error.message}`);
  }
  return spec;
}

/**
 * Spinning up a docker container to run source airbyte connector.
 * Platform is set to 'linux/amd64' as we only publish airbyte connectors images for linux/amd64.
 *
 * Docker cli command:
 *  docker run --name $src_container_name --init \
 *    -v "$tempdir:/configs" \
 *    $max_memory $max_cpus --log-opt max-size="$max_log_size" \
 *    --env LOG_LEVEL="$log_level" \
 *    $src_docker_options
 *    --cidfile="$tempPrefix-src_cid" \
 *    -a stdout -a stderr \
 *    "$src_docker_image" \
 *    read \
 *    --config "/configs/$src_config_filename" \
 *    --catalog "/configs/$src_catalog_filename" \
 *    --state "/configs/$src_state_filename"
 */
export async function runSrcSync(tmpDir: string, config: FarosConfig, srcOutputStream?: Writable): Promise<void> {
  logger.info('Running source connector...');

  if (!config.src?.image) {
    throw new Error('Source image is missing.');
  }

  try {
    const timestamp = Date.now();
    const srcContainerName = `airbyte-local-src-${timestamp}`;
    const cmd = [
      'read',
      '--config',
      `/configs/${SRC_CONFIG_FILENAME}`,
      '--catalog',
      `/configs/${SRC_CATALOG_FILENAME}`,
      '--state',
      `/configs/${DEFAULT_STATE_FILE}`,
    ];
    // 1e9 nano cpus = 1 cpu
    const maxNanoCpus = config.src?.dockerOptions?.maxCpus ? config.src?.dockerOptions?.maxCpus * 1e9 : undefined;
    // 1024 * 1024 bytes = 1MB
    const maxMemory = config.src?.dockerOptions?.maxMemory
      ? config.src?.dockerOptions?.maxMemory * 1024 * 1024
      : undefined;
    const createOptions: Docker.ContainerCreateOptions = {
      // Default config: can be overridden by the docker options provided by users
      name: srcContainerName,
      Image: config.src.image,
      ...config.src?.dockerOptions?.additionalOptions,

      // Default options: cannot be overridden by users
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      platform: getImagePlatform(config.src.image),
      Env: [`LOG_LEVEL=${config.logLevel}`, ...(config.src?.dockerOptions?.additionalOptions?.Env || [])],
      HostConfig: {
        // Defautl host config: can be overridden by users
        NanoCpus: maxNanoCpus,
        Memory: maxMemory,
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': config.src?.dockerOptions?.maxLogSize ?? DEFAULT_MAX_LOG_SIZE,
          },
        },
        ...config.src?.dockerOptions?.additionalOptions?.HostConfig,
        // Default options: cannot be overridden by users
        Binds: [`${tmpDir}:/configs`],
        AutoRemove: !config.keepContainers,
        Init: true,
      },
    };

    // Create the Docker container
    const container = await _docker.createContainer(createOptions);

    // Create a writable stream for the processed output data
    const outputStream =
      srcOutputStream ??
      (config.srcOutputFile && config.srcOutputFile !== OutputStream.STDOUT.valueOf()
        ? createWriteStream(config.srcOutputFile)
        : process.stdout);

    // Close the output stream when the container is finished
    if (srcOutputStream) {
      outputStream.on('finish', () => {
        srcOutputStream.end();
      });
    }

    // create a writable stream to capture the stdout
    let buffer = '';
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach((line: string) => {
          processSrcDataByLine(line, outputStream, config);
        });
        callback();
      },
    });

    // Attach the stderr to termincal stderr, and stdout to the output stream
    const stream = await container.attach({stream: true, stdout: true, stderr: true});
    container.modem.demuxStream(stream, containerOutputStream, process.stderr);

    // Start the container
    await container.start();

    // Wait for the container to finish
    const res = await container.wait();
    logger.debug(`Source connector exit code: ${JSON.stringify(res)}`);

    // Close the output stream
    if (srcOutputStream || config?.srcOutputFile !== OutputStream.STDOUT.valueOf()) {
      outputStream.end();
    }

    if (res.StatusCode === 0) {
      logger.info('Source connector completed.');
    } else {
      throw new Error('Failed to run source connector.');
    }
  } catch (error: any) {
    throw new Error(`Failed to run source connector: ${error.message ?? JSON.stringify(error)}`);
  }
}

/**
 * Spinning up a docker container to run destination airbyte connector.
 *
 * Docker cli command:
 * docker run \
 *   --name $dst_container_name \
 *   $dst_use_host_network \
 *   $max_memory $max_cpus \
 *   --cidfile="$tempPrefix-dst_cid" \
 *   -i --init \
 *   -v "$tempdir:/configs" \
 *   --log-opt max-size="$max_log_size" -a stdout -a stderr -a stdin \
 *   --env LOG_LEVEL="$log_level" \
 *   $dst_docker_options \
 *   "$dst_docker_image" \
 *   write \
 *   --config "/configs/$dst_config_filename" \
 *   --catalog "/configs/$dst_catalog_filename"
 *
 */
export async function runDstSync(tmpDir: string, config: FarosConfig, srcPassThrough?: PassThrough): Promise<void> {
  logger.info('Running destination connector...');

  if (!config.dst?.image) {
    throw new Error('Destination image is missing.');
  }

  try {
    const timestamp = Date.now();
    const dstContainerName = `airbyte-local-dst-${timestamp}`;
    const cmd = [
      'write',
      '--config',
      `/configs/${DST_CONFIG_FILENAME}`,
      '--catalog',
      `/configs/${DST_CATALOG_FILENAME}`,
    ];
    // 1e9 nano cpus = 1 cpu
    const maxNanoCpus = config.src?.dockerOptions?.maxCpus ? config.src?.dockerOptions?.maxCpus * 1e9 : undefined;
    // 1024 * 1024 bytes = 1MB
    const maxMemory = config.src?.dockerOptions?.maxMemory
      ? config.src?.dockerOptions?.maxMemory * 1024 * 1024
      : undefined;
    const createOptions: Docker.ContainerCreateOptions = {
      // Default config: can be overridden by the docker options provided by users
      name: dstContainerName,
      Image: config.dst.image,
      ...config.dst?.dockerOptions?.additionalOptions,

      // Default options: cannot be overridden by users
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: true,
      OpenStdin: true,
      StdinOnce: true,
      platform: getImagePlatform(config.dst.image),
      Env: [`LOG_LEVEL=${config.logLevel}`, ...(config.dst?.dockerOptions?.additionalOptions?.Env || [])],
      HostConfig: {
        // Defautl host config: can be overridden by users
        NanoCpus: maxNanoCpus,
        Memory: maxMemory,
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': config.dst?.dockerOptions?.maxLogSize ?? DEFAULT_MAX_LOG_SIZE,
          },
        },
        ...config.dst?.dockerOptions?.additionalOptions?.HostConfig,
        // Default options: cannot be overridden by users
        Binds: [`${tmpDir}:/configs`],
        AutoRemove: !config.keepContainers,
        Init: true,
      },
    };

    // Create the Docker container
    const container = await _docker.createContainer(createOptions);

    // Uderlying bug in dockerode:
    // Workaround copied from issue: https://github.com/apocas/dockerode/issues/742
    container.modem = new Proxy(container.modem, {
      get(target, prop) {
        const origMethod = target[prop];
        // internally to send http requests to the docker daemon
        if (prop === 'dial') {
          return function (...args: any[]) {
            if (args[0].path.endsWith('/attach?')) {
              // send an empty json payload instead
              args[0].file = Buffer.from('');
            }
            return origMethod.apply(target, args);
          };
        }
        return origMethod;
      },
    });

    // create a writable stream to capture the stdout
    let buffer = '';
    const states: string[] = [];
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach((line: string) => {
          const maybeState = processDstDataByLine(line, config);
          if (maybeState) {
            states.push(maybeState);
          }
        });
        callback();
      },
    });

    // Attach stdout to the output stream, stderr to terminal stderr
    const outputStream = await container.attach({stream: true, stdout: true, stderr: true});
    container.modem.demuxStream(outputStream, containerOutputStream, process.stderr);

    // Create a readable stream from the src output file and pipe it to the container stdin
    const inputStream = srcPassThrough ?? createReadStream(`${tmpDir}/${SRC_OUTPUT_DATA_FILE}`);
    const stdinStream = await container.attach({stream: true, hijack: true, stdin: true});
    inputStream.pipe(stdinStream);

    // Start the container
    await container.start();

    // Wait for the container to finish
    const res = await container.wait();
    logger.debug(`Destination connector exit code: ${JSON.stringify(res)}`);

    if (res.StatusCode === 0) {
      logger.info('Destination connector completed.');

      // Write the state file
      const lastState = states.pop();
      if (lastState) {
        writeFileSync(`${config.stateFile}`, lastState);
        logger.info(`New state is updated in '${config.stateFile}'.`);
      } else {
        logger.warn('No new state is generated.');
      }
    } else {
      throw new Error(`Exit with ${JSON.stringify(res)}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to run destination connector: ${error.message ?? JSON.stringify(error)}`);
  }
}

/**
 * Run the spec to generate the configuration file.
 *
 * TODO: Check if it's running fine on non faros airbyte images
 *
 * Raw docker command:
 * docker run -it --rm "$docker_image" spec
 */
export async function runSpec(image: string): Promise<AirbyteSpec> {
  logger.info('Retrieving Airbyte configuration spec...');

  try {
    const createOptions: Docker.ContainerCreateOptions = {
      Image: image,
      Cmd: ['spec'],
      AttachStderr: true,
      AttachStdout: true,
      HostConfig: {
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // create a writable stream to capture the spec
    let buffer = '';
    const specs: AirbyteSpec[] = [];
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach((line: string) => {
          const maybeSpec = processSpecByLine(line);
          if (maybeSpec) {
            specs.push(maybeSpec);
          }
        });
        callback();
      },
    });

    // Create the Docker container
    const container = await _docker.createContainer(createOptions);

    // Attach stdout and stderr
    const outputStream = await container.attach({stream: true, stdout: true, stderr: true});
    container.modem.demuxStream(outputStream, containerOutputStream, process.stderr);

    // docker run
    await container.start();
    const res = await container.wait();
    logger.debug(`Spec exit code: ${JSON.stringify(res)}`);

    // write spec to the file
    if (res.StatusCode === 0 && specs.length > 0) {
      const spec = specs.pop();
      if (spec?.type === AirbyteMessageType.SPEC) {
        return spec;
      }
      throw new Error(`Unexpected spec: ${JSON.stringify(spec)}`);
    }
    throw new Error(`Exit with ${JSON.stringify(res)}`);
  } catch (error: any) {
    throw new Error(`Failed to run spec: ${error.message ?? JSON.stringify(error)}.`);
  }
}

/**
 * Run the wizard to generate the configuration file.
 * Utilize the `--autofill` flag to generate the configuration file.
 *
 * Always use the placeholder image for the wizard.
 * This allows us to generate configs for any source connectors.
 *
 * Raw docker command:
 * docker run -it --rm \
 *  -v "$tempdir:/configs" "$docker_image" \
 *  airbyte-local-cli-wizard --autofill \
 *  --json "/configs/$config_filename"
 *  --spec-file "/configs/$spec_filename"
 */
const DEFAULT_PLACEHOLDER_WIZARD_IMAGE = 'farosai/airbyte-faros-graphql-source';
export async function runWizard(tmpDir: string, image: string, spec: AirbyteSpec): Promise<any> {
  logger.info('Retrieving Airbyte auto generated configuration...');

  logger.info(`Pulling placeholder image to generate configuration...`);
  await pullDockerImage(DEFAULT_PLACEHOLDER_WIZARD_IMAGE);

  // Write the spec to a file
  writeFileSync(`${tmpDir}/${TMP_SPEC_CONFIG_FILENAME}`, JSON.stringify(spec));

  try {
    const cmd = [
      'airbyte-local-cli-wizard',
      '--autofill',
      '--json',
      `/configs/${TMP_WIZARD_CONFIG_FILENAME}`,
      '--spec-file',
      `/configs/${TMP_SPEC_CONFIG_FILENAME}`,
    ];
    const createOptions: Docker.ContainerCreateOptions = {
      Image: DEFAULT_PLACEHOLDER_WIZARD_IMAGE,
      Cmd: cmd,
      AttachStderr: true,
      AttachStdout: true,
      HostConfig: {
        Binds: [`${tmpDir}:/configs`],
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // Create the Docker container
    const container = await _docker.createContainer(createOptions);

    // Attach stdout and stderr
    const outputStream = await container.attach({stream: true, stdout: true, stderr: true});
    container.modem.demuxStream(outputStream, process.stdout, process.stderr);

    // docker run
    await container.start();
    const res = await container.wait();
    logger.debug(`Generate config exit code: ${JSON.stringify(res)}`);

    if (res.StatusCode !== 0) {
      throw new Error(`Exit with ${JSON.stringify(res)}`);
    }
    const resultConfig = JSON.parse(readFileSync(`${tmpDir}/${TMP_WIZARD_CONFIG_FILENAME}`, 'utf-8'));
    return resultConfig;
  } catch (error: any) {
    throw new Error(`Failed to generate config: ${error.message ?? JSON.stringify(error)}.`);
  }
}
