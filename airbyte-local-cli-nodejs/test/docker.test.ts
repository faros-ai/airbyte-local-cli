import * as docker from '../src/docker';
import {extractStateFromMessage} from '../src/docker';
import {FarosConfig} from '../src/types';

describe('extractStateFromMessage', () => {
  it('should return undefined', () => {
    expect(extractStateFromMessage(null)).toBeUndefined();
    expect(extractStateFromMessage(undefined)).toBeUndefined();
    expect(extractStateFromMessage({type: 'STATE'})).toBeUndefined();
    expect(extractStateFromMessage({state: {type: 'UNKNOWN'}})).toBeUndefined();
    expect(extractStateFromMessage({type: 'STATE', state: {type: 'GLOBAL'}})).toBeUndefined();
  });

  it('should handle legacy state format with data property', () => {
    const legacyState = {
      type: 'STATE',
      state: {
        data: {format: 'base64/gzip', data: 'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA=='},
      },
    };
    const result = extractStateFromMessage(legacyState);
    expect(result).toMatchSnapshot();
  });

  it('should handle GLOBAL state format and wrap in array', () => {
    const globalState = {
      type: 'STATE',
      state: {
        type: 'GLOBAL',
        global: {
          shared_state: {format: 'base64/gzip', data: 'H4sI...'},
          stream_states: [],
        },
      },
    };
    const result = extractStateFromMessage(globalState);
    expect(result).toMatchSnapshot();
  });
});

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
