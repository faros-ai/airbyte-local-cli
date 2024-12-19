import {Writable} from 'node:stream';

import Docker from 'dockerode';

import {checkSrcConnection, setDocker} from '../src/docker';
import {AirbyteMessageType} from '../src/types';

jest.mock('dockerode');

describe('checkSrcConnection', () => {
  const docker = new Docker();
  const tmpDir = '/tmp';
  const testImage = 'test-image';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate the source connection successfully', async () => {
    const testData = JSON.stringify({
      type: AirbyteMessageType.CONNECTION_STATUS,
      connectionStatus: {
        status: 'SUCCEEDED',
      },
    });
    docker.run = jest.fn().mockImplementation((_image, _command, outputStream: Writable, _createOptions) => {
      outputStream.write(testData);
      outputStream.end();
      return Promise.resolve([{StatusCode: 0}]);
    });
    setDocker(docker);

    await checkSrcConnection(tmpDir, testImage);
  });

  it('should throw an error if the connection validation fails', async () => {
    const testData = JSON.stringify({
      type: AirbyteMessageType.CONNECTION_STATUS,
      connectionStatus: {
        status: 'FAILED',
        message: 'Connection failed',
      },
    });

    docker.run = jest.fn().mockImplementation((_image, _command, _outputStream, _createOptions) => {
      _outputStream.write(testData);
      _outputStream.end();
      return Promise.resolve([{StatusCode: 0}]);
    });

    await expect(checkSrcConnection(tmpDir, testImage)).rejects.toThrow(
      'Failed to validate source connection: Connection failed',
    );
  });
});
