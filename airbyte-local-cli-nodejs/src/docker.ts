import {createReadStream, createWriteStream, readFileSync, ReadStream, writeFileSync} from 'node:fs';
import {sep} from 'node:path';
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
// Self-reference for unit test mocking
import * as docker from './docker';
import {logger} from './logger';
import {
  AirbyteCatalog,
  AirbyteCatalogMessage,
  AirbyteConnectionStatus,
  AirbyteConnectionStatusMessage,
  AirbyteMessageType,
  AirbyteSpec,
  AirbyteState,
  AirbyteStateMessage,
  FarosConfig,
  OutputStream,
} from './types';
import {
  collectStates,
  extractStateFromMessage,
  formatDstMsg,
  getUserAgent,
  logDstMessage,
  processSrcDataByLine,
  writeStateFile,
} from './utils';

// Constants
const DEFAULT_MAX_LOG_SIZE = '10m';

// Create a new Docker instance
let _docker = new Docker();

// Track running containers for cleanup on exit
const runningContainers = new Set<string>();

// For testing purpose only
export function setDocker(testDocker: Docker): void {
  _docker = testDocker;
}

// For testing purpose only
export function addRunningContainerForTest(containerId: string): void {
  runningContainers.add(containerId);
}

export async function stopAllContainers(): Promise<void> {
  if (runningContainers.size > 0) {
    const containers = [...runningContainers];
    await Promise.all(
      containers.map(async (containerId) => {
        try {
          await _docker.getContainer(containerId).stop();
          logger.debug(`Container ${containerId} stopped.`);
        } catch (error: any) {
          // Ignore 304 "container already stopped" - this is expected during cleanup
          if (error.statusCode === 304) {
            logger.debug(`Container ${containerId} already stopped.`);
          } else {
            logger.warn(`Failed to stop container ${containerId}: ${error.message}`);
          }
        }
      }),
    );
    runningContainers.clear();
  }
}

/**
 * Use 'linux/amd64' plaform for farosai images.
 * Use 'windows/amd64' platform if there's `windows` in the tag.
 *
 * TODO: @FAI-15309 This should be removed once we have a proper multi-platform image.
 */
function getImagePlatform(image: string): string | undefined {
  if (image.includes(':windows')) {
    return 'windows/amd64';
  } else if (image?.startsWith('farosai')) {
    return 'linux/amd64';
  }
  return undefined;
}

/**
 * This is a workaround for running tests on Windows with Windows images.
 * IRL, users should run linux images even on Windows.
 *
 * On Linux, we add the `:z` suffix for SELinux compatibility (required on Fedora, RHEL, etc.).
 * The `:z` suffix tells Docker to relabel the volume content with a shared label.
 * This is safe to use on non-SELinux systems as it's simply ignored.
 */
function getBindsLocation(image: string): string {
  if (image.includes(':windows')) {
    return `C:${sep}configs`;
  }
  // Add :z suffix for SELinux compatibility on Linux hosts
  const selinuxSuffix = process.platform === 'linux' ? ':z' : '';
  return `/configs${selinuxSuffix}`;
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

export async function inspectDockerImage(image: string): Promise<any> {
  logger.debug(`Inspecting docker image: ${image}`);

  try {
    const imageInfo = await _docker.getImage(image).inspect();
    logger.debug(`Docker image inspected: ${image}`);

    return {digest: imageInfo.RepoDigests[0], version: imageInfo.Config.Labels['io.airbyte.version']};
  } catch (error: any) {
    logger.warn(`Failed to inspect docker image '${image}': ${error.message ?? JSON.stringify(error)}`);
    return {};
  }
}

/**
 * Process the destination output.
 * Logs the messages and returns the state message if any.
 */
function processDstDataByLine(line: string, cfg: FarosConfig): AirbyteState | undefined {
  if (line.trim() === '') {
    return undefined;
  }

  try {
    const data = JSON.parse(line);
    let state: AirbyteState | undefined;

    if (data?.type === AirbyteMessageType.STATE && data?.state) {
      state = extractStateFromMessage(data as AirbyteStateMessage);
      logger.debug(formatDstMsg(data));
    }

    if (cfg.rawMessages) {
      process.stdout.write(`${line}\n`);
    } else {
      logDstMessage(data);
    }

    return state;
  } catch (error: any) {
    logger.error(`Line of data: '${line}'; Error: ${error.message}`);
    return undefined;
  }
}

/**
 * Parses Airbyte output lines and extracts the message matching the specified type.
 * Logs any error traces or error-level log messages encountered during parsing.
 */
function processAirbyteLines<T>(lines: string[], messageType: AirbyteMessageType): T | undefined {
  let message: T | undefined;
  lines.forEach((line: string) => {
    try {
      const parsedLine = JSON.parse(line);
      if (line.includes(messageType)) {
        message = parsedLine as T;
      } else {
        if (parsedLine?.trace?.type === 'ERROR' || parsedLine?.log?.level === 'ERROR') {
          logger.error(line);
        }
      }
    } catch (error: any) {
      logger.debug(`Failed to parse line: '${line}'; Error: ${error.message}`);
    }
  });
  return message;
}

/**
 * Run the docker container with the provided options and stdout stream.
 * @param options - Docker container create options
 * @param outputStream - Writable stream to capture the output
 */
export async function runDocker(
  options: Docker.ContainerCreateOptions,
  outputStream: Writable,
  inputStream?: ReadStream | PassThrough,
): Promise<void> {
  // Create the Docker container
  const container = await _docker.createContainer(options);

  // Attach the stderr to termincal stderr, and stdout to the output stream
  const stdoutStream = await container.attach({stream: true, stdout: true, stderr: true});
  container.modem.demuxStream(stdoutStream, outputStream, process.stderr);

  // Attach the input stream to the container stdin
  let stdinStream: NodeJS.ReadWriteStream | undefined;
  if (inputStream) {
    // Remove additional stdin data from the stdin stream
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

    stdinStream = await container.attach({stream: true, hijack: true, stdin: true});
    inputStream.pipe(stdinStream);
  }

  // Start the container
  await container.start();
  runningContainers.add(container.id);

  // Wait for the container to finish
  let res: {StatusCode: number};
  try {
    res = await container.wait();
  } finally {
    runningContainers.delete(container.id);
  }
  logger.debug(`Container exit code: ${JSON.stringify(res)}`);

  // Close docker attached stream explicitly
  // This is supposed to be automatically closed when the container exits
  // but on Windows we intermittently experienced issues with the stream not being closed.
  try {
    if (stdoutStream) {
      (stdoutStream as any).destroy();
    }
    if (stdinStream) {
      (stdinStream as any).destroy();
    }
  } catch (error: any) {
    logger.debug(`Failed to destroy streams: ${error.message} ?? ${JSON.stringify(error)}`);
  }

  if (res?.StatusCode !== 0) {
    throw new Error(`Container exited with code ${res.StatusCode}`);
  }
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
export async function runCheckSrcConnection(tmpDir: string, image: string, srcConfigFile?: string): Promise<void> {
  logger.info('Validating connection to source...');

  if (!image) {
    throw new Error('Source image is missing.');
  }

  try {
    const cfgFile = srcConfigFile ?? SRC_CONFIG_FILENAME;
    const command = ['check', '--config', `/configs/${cfgFile}`];
    const createOptions: Docker.ContainerCreateOptions = {
      Image: image,
      Cmd: command,
      AttachStderr: true,
      AttachStdout: true,
      HostConfig: {
        Binds: [`${tmpDir}:${getBindsLocation(image)}`],
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // create a writable stream to capture the output and process line by line
    let buffer = '';
    let status: AirbyteConnectionStatusMessage | undefined;
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        const result = processAirbyteLines<AirbyteConnectionStatusMessage>(lines, AirbyteMessageType.CONNECTION_STATUS);
        if (result !== undefined) {
          status = result;
        }
        callback();
      },
    });

    // run docker
    await docker.runDocker(createOptions, containerOutputStream);

    if (
      status?.type === AirbyteMessageType.CONNECTION_STATUS &&
      status?.connectionStatus.status === AirbyteConnectionStatus.SUCCEEDED
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
      Image: image,
      Cmd: command,
      AttachStderr: true,
      AttachStdout: true,
      HostConfig: {
        Binds: [`${tmpDir}:${getBindsLocation(image)}`],
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // create a writable stream to capture the output and process line by line
    let buffer = '';
    let rawCatalog: AirbyteCatalogMessage | undefined;
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        const result = processAirbyteLines<AirbyteCatalogMessage>(lines, AirbyteMessageType.CATALOG);
        if (result !== undefined) {
          rawCatalog = result;
        }
        callback();
      },
    });

    // run docker
    await docker.runDocker(createOptions, containerOutputStream);

    if (rawCatalog?.type === AirbyteMessageType.CATALOG) {
      logger.info('Catalog discovered successfully.');
      return rawCatalog.catalog ?? {streams: []};
    }
    throw new Error('Catalog not found or container ends with non-zero status code');
  } catch (error: any) {
    throw new Error(`Failed to discover catalog: ${error.message ?? JSON.stringify(error)}.`);
  }
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

        // Allow users to add bind mount but not override the default one
        Binds: [
          `${tmpDir}:${getBindsLocation(config.src.image)}`,
          ...(config.src?.dockerOptions?.additionalOptions?.HostConfig?.Binds || []),
        ],

        // Default options: cannot be overridden by users
        AutoRemove: !config.keepContainers,
        Init: true,
      },
    };

    // Create a writable stream for the processed output data
    const outputStream =
      srcOutputStream ??
      (config.srcOutputFile && config.srcOutputFile !== OutputStream.STDOUT.valueOf()
        ? createWriteStream(config.srcOutputFile)
        : process.stdout);

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

    // run docker
    await docker.runDocker(createOptions, containerOutputStream);

    // Close the container output stream
    // This is required to notify the dst connector that inputs are done
    containerOutputStream.end();
    logger.debug('Container output stream ended.');

    // Wait for the outputStream to finish writing
    if (outputStream !== process.stdout) {
      // close the output stream when the container output stream finishes writing
      containerOutputStream.on('finish', () => {
        outputStream.end();
        logger.debug('Wrting file output stream closed.');
      });

      // Wait for the outputStream to finish writing
      await new Promise<void>((resolve, reject) => {
        (outputStream as Writable).on('finish', resolve);
        (outputStream as Writable).on('error', reject);
      });
    }

    logger.info('Source connector completed.');
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
      Env: [
        `LOG_LEVEL=${config.logLevel}`,
        `CLI_USER_AGENT=${getUserAgent()}`,
        ...(config.dst?.dockerOptions?.additionalOptions?.Env || []),
      ],
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

        // Allow users to add bind mount but not override the default one
        Binds: [
          `${tmpDir}:${getBindsLocation(config.dst.image)}`,
          ...(config.dst?.dockerOptions?.additionalOptions?.HostConfig?.Binds || []),
        ],

        // Default options: cannot be overridden by users
        AutoRemove: !config.keepContainers,
        Init: true,
      },
    };

    // create a writable stream to capture the stdout
    let buffer = '';
    const streamStates = new Map<string, AirbyteState>();
    const legacyState: {value: AirbyteState | undefined} = {value: undefined};
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach((line: string) => {
          const maybeState = processDstDataByLine(line, config);
          collectStates(maybeState, streamStates, legacyState);
        });
        callback();
      },
    });

    // Create a readable stream from the src output file and pipe it to the container stdin
    const inputStream = srcPassThrough ?? createReadStream(`${tmpDir}/${SRC_OUTPUT_DATA_FILE}`);

    // Start the container
    await docker.runDocker(createOptions, containerOutputStream, inputStream);
    logger.info('Destination connector completed.');

    // Write the state file
    writeStateFile(streamStates, legacyState, config.stateFile);
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
    let spec: AirbyteSpec | undefined;
    const containerOutputStream = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        const result = processAirbyteLines<AirbyteSpec>(lines, AirbyteMessageType.SPEC);
        if (result !== undefined) {
          spec = result;
        }
        callback();
      },
    });

    // run docker
    await docker.runDocker(createOptions, containerOutputStream);

    if (spec?.type === AirbyteMessageType.SPEC) {
      return spec;
    }
    throw new Error(`No spec found in the output`);
  } catch (error: any) {
    throw new Error(`Failed to run spec: ${error.message ?? JSON.stringify(error)}.`);
  }
}

/**
 * Run the wizard to generate the configuration file.
 * Utilize the `--autofill` flag to generate the configuration file.
 *
 * For feeds sources, use the actual source image with `--feed <feedName>`.
 * For other sources, use the placeholder image.
 *
 * Raw docker command:
 * docker run -it --rm \
 *  -v "$tempdir:/configs" "$docker_image" \
 *  airbyte-local-cli-wizard --autofill \
 *  --json "/configs/$config_filename"
 *  --spec-file "/configs/$spec_filename"
 *  [--feed <feedName>]
 */
const DEFAULT_PLACEHOLDER_WIZARD_IMAGE = 'farosai/airbyte-faros-graphql-source';
export async function runWizard(tmpDir: string, image: string, spec: AirbyteSpec, feedName?: string): Promise<any> {
  logger.info('Retrieving Airbyte auto generated configuration...');

  const wizardImage = feedName ? image : DEFAULT_PLACEHOLDER_WIZARD_IMAGE;
  logger.info(`Pulling image to generate configuration...`);
  await pullDockerImage(wizardImage);

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
      ...(feedName ? ['--feed', feedName] : []),
    ];
    const createOptions: Docker.ContainerCreateOptions = {
      Image: wizardImage,
      Cmd: cmd,
      AttachStderr: true,
      AttachStdout: true,
      HostConfig: {
        Binds: [`${tmpDir}:${getBindsLocation(image)}`],
        AutoRemove: true,
      },
      platform: getImagePlatform(image),
    };

    // run docker
    await docker.runDocker(createOptions, process.stdout);

    const resultConfig = JSON.parse(readFileSync(`${tmpDir}/${TMP_WIZARD_CONFIG_FILENAME}`, 'utf-8'));
    return resultConfig;
  } catch (error: any) {
    throw new Error(`Failed to generate config: ${error.message ?? JSON.stringify(error)}.`);
  }
}
