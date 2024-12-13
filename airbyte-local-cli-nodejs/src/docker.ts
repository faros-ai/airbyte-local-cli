import {Writable} from 'node:stream';

import Docker from 'dockerode';

import {AirbyteConnectionStatus, AirbyteConnectionStatusMessage, AirbyteMessageType} from './types';
import {logger, SRC_CONFIG_FILENAME} from './utils';

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
    await _docker.pull(image);
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
export async function checkSrcConnection(tmpDir: string, image: string): Promise<void> {
  logger.info('Validating connection to source...');

  if (!image) {
    throw new Error('Source image is missing.');
  }

  try {
    const command = ['check', '--config', `/configs/${SRC_CONFIG_FILENAME}`];
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
    throw new Error(`Failed to validate source connection: ${error.message}.`);
  }
}
