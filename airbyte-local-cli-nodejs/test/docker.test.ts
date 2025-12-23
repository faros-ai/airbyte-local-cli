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
    expect(mockRunDocker.mock.calls[0]?.[0]?.HostConfig?.Binds).toMatchObject([
      'testTmpDir:/configs',
      '/path/to/tasks.xlsx:/tasks.xlsx',
    ]);
  });
});
