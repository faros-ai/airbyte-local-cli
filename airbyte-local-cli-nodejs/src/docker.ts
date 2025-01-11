import {writeFileSync} from 'node:fs';
import {Writable} from 'node:stream';

import Docker from 'dockerode';

import {AirbyteConnectionStatus, AirbyteConnectionStatusMessage, AirbyteMessageType, FarosConfig} from './types';
import {DEFAULT_STATE_FILE, logger, SRC_CATALOG_FILENAME, SRC_CONFIG_FILENAME} from './utils';

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
    logger.debug('Docker is installed and running.');
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
      platform: 'linux/amd64',
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
 *
 * @argument command - for testing purposes only
 */
export async function runSrcSync(tmpDir: string, config: FarosConfig, command?: string[]): Promise<string> {
  logger.info('Running source connector...');

  if (!config.src?.image) {
    throw new Error('Source image is missing.');
  }

  try {
    const timestamp = Date.now();
    const srcContainerName = `airbyte-local-src-${timestamp}`;
    const cmd = command ?? [
      'read',
      '--config',
      `/configs/${SRC_CONFIG_FILENAME}`,
      '--catalog',
      `/configs/${SRC_CATALOG_FILENAME}`,
      '--state',
      `/configs/${DEFAULT_STATE_FILE}`,
    ];
    const maxNanoCpus =
      config.src?.dockerOptions?.maxCpus !== undefined ? config.src.dockerOptions.maxCpus * 1e9 : undefined;
    const maxMemory =
      config.src?.dockerOptions?.maxMemory !== undefined ? config.src.dockerOptions.maxMemory * 1024 * 1024 : undefined;
    const createOptions: Docker.ContainerCreateOptions = {
      name: srcContainerName,
      Image: config.src.image,
      Cmd: cmd,
      HostConfig: {
        Binds: [`${tmpDir}:/configs`],
        AutoRemove: true,
        Init: true,
        NanoCpus: maxNanoCpus, // 1e9 nano cpus = 1 cpu
        Memory: maxMemory, // 1024 * 1024 bytes = 1MB
        LogConfig: {
          Type: 'json-file',
          Config: {
            'max-size': config.src?.dockerOptions?.maxLogSize ?? DEFAULT_MAX_LOG_SIZE,
          },
        },
      },
      AttachStdout: true,
      AttachStderr: true,
      Env: [`LOG_LEVEL=${config.logLevel}`],
      platform: 'linux/amd64',
    };

    // Create the Docker container
    const container = await _docker.createContainer(createOptions);

    // Write the container ID to the cidfile
    const cidfilePath = `tmp-${timestamp}-src_cid`;
    writeFileSync(cidfilePath, container.id);

    // create a writable stream to capture the stdout
    let data = '';
    const stdoutStream = new Writable({
      write(chunk, _encoding, callback) {
        data += chunk.toString();
        callback();
      },
    });
    // Attach the stderr to termincal stderr, and stdout to the output stream
    const stream = await container.attach({stream: true, stdout: true, stderr: true});
    container.modem.demuxStream(stream, stdoutStream, process.stderr);

    // Start the container
    await container.start();

    // Wait for the container to finish
    const res = await container.wait();
    logger.debug(res);
    logger.debug(data);

    if (res.StatusCode === 0) {
      logger.info('Source connector ran successfully.');
    } else {
      throw new Error('Failed to run source connector.');
    }

    // return the stdout data
    return data;
  } catch (error: any) {
    throw new Error(`Failed to run source connector: ${error.message ?? JSON.stringify(error)}.`);
  }
}
