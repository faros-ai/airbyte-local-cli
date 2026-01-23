import Docker from 'dockerode';

import * as docker from '../src/docker';
import {FarosConfig} from '../src/types';

describe('runSrcSync', () => {
  const testCfg: FarosConfig = {
    src: {
      image: 'farosai/airbyte-example-source',
    },
    srcCheckConnection: false,
    dstUseHostNetwork: false,
    srcPull: false,
    dstPull: false,
    fullRefresh: false,
    rawMessages: false,
    keepContainers: false,
    logLevel: 'info',
    debug: false,
    stateFile: undefined,
    connectionName: undefined,
    srcOutputFile: undefined,
    srcInputFile: undefined,
    silent: false,
    image: false,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call runDocker with correct parameters', async () => {
    const mockRunDocker = jest.spyOn(docker, 'runDocker').mockResolvedValue(undefined);

    const testCfgWithVolumeMount = {
      ...testCfg,
      src: {
        ...testCfg.src,
        dockerOptions: {
          additionalOptions: {
            HostConfig: {
              Binds: ['/path/to/tasks.xlsx:/tasks.xlsx'],
            },
          },
        },
      },
    } as FarosConfig;

    await docker.runSrcSync('testTmpDir', testCfgWithVolumeMount, process.stdout);

    expect(mockRunDocker).toHaveBeenCalled();
    const binds = mockRunDocker.mock.calls[0]?.[0]?.HostConfig?.Binds;
    expect(binds?.some((b: string) => b.startsWith('testTmpDir:/configs'))).toBe(true);
    expect(binds).toContain('/path/to/tasks.xlsx:/tasks.xlsx');
  });
});

describe('stopAllContainers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should do nothing when no containers are running', async () => {
    const mockDocker = {
      getContainer: jest.fn(),
    } as unknown as Docker;
    docker.setDocker(mockDocker);

    await docker.stopAllContainers();

    expect(mockDocker.getContainer).not.toHaveBeenCalled();
  });

  it('should stop running containers successfully', async () => {
    const mockStop = jest.fn().mockResolvedValue(undefined);
    const mockDocker = {
      getContainer: jest.fn().mockReturnValue({stop: mockStop}),
    } as unknown as Docker;
    docker.setDocker(mockDocker);
    docker.addRunningContainerForTest('container-123');

    await docker.stopAllContainers();

    expect(mockDocker.getContainer).toHaveBeenCalledWith('container-123');
    expect(mockStop).toHaveBeenCalled();
  });

  it('should ignore 304 already stopped errors', async () => {
    const error304 = {statusCode: 304, message: 'container already stopped'};
    const mockStop = jest.fn().mockRejectedValue(error304);
    const mockDocker = {
      getContainer: jest.fn().mockReturnValue({stop: mockStop}),
    } as unknown as Docker;
    docker.setDocker(mockDocker);
    docker.addRunningContainerForTest('container-456');

    // Should not throw
    await docker.stopAllContainers();

    expect(mockDocker.getContainer).toHaveBeenCalledWith('container-456');
    expect(mockStop).toHaveBeenCalled();
  });

  it('should warn on other errors', async () => {
    const otherError = {statusCode: 500, message: 'internal error'};
    const mockStop = jest.fn().mockRejectedValue(otherError);
    const mockDocker = {
      getContainer: jest.fn().mockReturnValue({stop: mockStop}),
    } as unknown as Docker;
    docker.setDocker(mockDocker);
    docker.addRunningContainerForTest('container-789');

    // Should not throw, but should log warning
    await docker.stopAllContainers();

    expect(mockDocker.getContainer).toHaveBeenCalledWith('container-789');
    expect(mockStop).toHaveBeenCalled();
  });
});
