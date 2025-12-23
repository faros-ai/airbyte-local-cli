import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

import {
  AirbyteCatalog,
  AirbyteMessageType,
  AirbyteState,
  AirbyteStateMessage,
  AirbyteStateType,
  FarosConfig,
} from '../src/types';
import {
  checkDockerInstalled,
  collectStates,
  extractStateFromMessage,
  generateDstStreamPrefix,
  overrideCatalog,
  parseConfigFile,
  updateSrcConfigWithFarosConfig,
} from '../src/utils';

jest.mock('node:fs');
jest.mock('node:child_process');

describe('parseConfigFile', () => {
  it('should pass if config file is valid json', () => {
    const airbyteConfig = {
      src: {
        image: 'source-image',
        config: {},
      },
      dst: {
        image: 'destination-image',
        config: {},
      },
    };
    (readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(airbyteConfig)));
    expect(parseConfigFile('test-config-file')).toEqual(airbyteConfig);
  });

  it('should fail if config file is not valid json', () => {
    (readFileSync as jest.Mock).mockReturnValue(Buffer.from('invalid-json'));
    expect(() => parseConfigFile('test-config-file')).toThrow('Failed to read or parse config file');
  });

  it('should fail if config file contains invalid properties', () => {
    const airbyteConfig = {
      src: {
        image: 'source-image',
        bad_config: {},
      },
      dst: {
        image: 'destination-image',
        bad_config: {},
      },
    };
    (readFileSync as jest.Mock).mockReturnValue(Buffer.from(JSON.stringify(airbyteConfig)));
    expect(() => parseConfigFile('test-config-file')).toThrow(
      'Failed to read or parse config file: ' +
        'Invalid config file json format. Please check if it contains invalid properties.',
    );
  });
});

describe('checkDockerInstalled', () => {
  it('should pass if docker is installed', () => {
    (spawnSync as jest.Mock).mockReturnValue({status: 0});
    expect(() => checkDockerInstalled()).not.toThrow();
  });

  it('should fail if docker is not installed', () => {
    (spawnSync as jest.Mock).mockReturnValue({status: 1, error: {message: 'command not found'}});
    expect(() => checkDockerInstalled()).toThrow('Docker is not installed: command not found');
  });
});

describe('updateSrcConfigWithFarosConfig', () => {
  it('should succeed', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-faros-feeds-source',
        config: {
          testKey: 'testValue',
        },
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
        config: {
          edition_configs: {
            api_url: 'api-url',
            api_key: 'api-key',
          },
        },
      },
    };
    updateSrcConfigWithFarosConfig(testAirbyteConfig);
    expect(testAirbyteConfig.src.config).toEqual({
      testKey: 'testValue',
      faros: {
        api_url: 'api-url',
        api_key: 'api-key',
      },
    });
  });

  it('should succeed with no dst faros api settings', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-faros-feeds-source',
        config: {
          testKey: 'testValue',
        },
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
        config: {
          testKey: {},
        },
      },
    };
    updateSrcConfigWithFarosConfig(testAirbyteConfig);
    expect(testAirbyteConfig.src.config).toEqual({
      testKey: 'testValue',
    });
  });

  it('should skip with non feed src image', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-example-source',
        config: {
          testKey: 'testValue',
        },
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
        config: {
          edition_configs: {
            api_url: 'api-url',
            api_key: 'api-key',
          },
        },
      },
    };
    updateSrcConfigWithFarosConfig(testAirbyteConfig);
    expect(testAirbyteConfig.src.config).toEqual({
      testKey: 'testValue',
    });
  });
});

describe('overrideCatalog', () => {
  const testDefaultCatalog = {
    streams: [
      {
        default_cursor_field: ['updated_at'],
        json_schema: {},
        name: 'builds',
        source_defined_cursor: true,
        source_defined_primary_key: [['uid'], ['source']],
        supported_sync_modes: ['full_refresh', 'incremental'],
      },
    ],
  };
  it('should succeed with empty catalog', () => {
    expect(overrideCatalog({}, testDefaultCatalog as AirbyteCatalog)).toEqual({
      streams: [
        {
          stream: {name: 'builds', supported_sync_modes: ['full_refresh', 'incremental'], json_schema: {}},
          sync_mode: 'incremental',
          destination_sync_mode: 'append',
        },
      ],
    });
  });

  it('should succeed with full refresh command option', () => {
    expect(overrideCatalog({}, testDefaultCatalog as AirbyteCatalog, true)).toEqual({
      streams: [
        {
          stream: {name: 'builds', supported_sync_modes: ['full_refresh', 'incremental'], json_schema: {}},
          sync_mode: 'full_refresh',
          destination_sync_mode: 'overwrite',
        },
      ],
    });
  });

  it('should succeed with full refresh catalog', () => {
    const testCatalog = {
      streams: [
        {
          stream: {name: 'builds'},
          sync_mode: 'full_refresh',
        },
      ],
    };
    expect(overrideCatalog(testCatalog, testDefaultCatalog as AirbyteCatalog)).toEqual({
      streams: [
        {
          stream: {name: 'builds', supported_sync_modes: ['full_refresh', 'incremental'], json_schema: {}},
          sync_mode: 'full_refresh',
          destination_sync_mode: 'overwrite',
        },
      ],
    });
  });

  it('should succeed with disabled', () => {
    const testCatalog = {
      streams: [
        {
          stream: {name: 'builds'},
          sync_mode: 'full_refresh',
          disabled: true,
        },
      ],
    };
    expect(overrideCatalog(testCatalog, testDefaultCatalog as AirbyteCatalog)).toEqual({streams: []});
  });
});

describe('generateDstStreamPrefix', () => {
  it('should succeed', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-example-source',
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
      },
    } as FarosConfig;
    generateDstStreamPrefix(testAirbyteConfig);
    expect(testAirbyteConfig.connectionName).toEqual('myexamplesrc');
    expect(testAirbyteConfig.dstStreamPrefix).toEqual('myexamplesrc__example__');
  });

  it('should succeed with connection name flag', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-example-source',
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
      },
      connectionName: 'testConnectionName',
    } as FarosConfig;
    generateDstStreamPrefix(testAirbyteConfig);
    expect(testAirbyteConfig.connectionName).toEqual('testConnectionName');
    expect(testAirbyteConfig.dstStreamPrefix).toEqual('testConnectionName__example__');
  });

  it('should succeed with feeds source', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-faros-feeds-source',
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
      },
    } as FarosConfig;
    generateDstStreamPrefix(testAirbyteConfig);
    expect(testAirbyteConfig.connectionName).toEqual('myfarosfeedssrc');
    expect(testAirbyteConfig.dstStreamPrefix).toEqual('myfarosfeedssrc__faros_feeds__');
  });

  it('should succeed with feeds source and connection name flag', () => {
    const testAirbyteConfig = {
      src: {
        image: 'farosai/airbyte-faros-feeds-source',
      },
      dst: {
        image: 'farosai/airbyte-faros-destination',
      },
      connectionName: 'testConnectionName',
    } as FarosConfig;
    generateDstStreamPrefix(testAirbyteConfig);
    expect(testAirbyteConfig.connectionName).toEqual('testConnectionName');
    expect(testAirbyteConfig.dstStreamPrefix).toEqual('testConnectionName__faros_feeds__');
  });

  it('should skip generation when dstStreamPrefix is provided via CLI flag', () => {
    const testAirbyteConfig = {
      src: {image: 'farosai/airbyte-example-source:latest'},
      dst: {image: 'farosai/airbyte-faros-destination:latest'},
      dstStreamPrefix: 'custom_prefix__',
    } as FarosConfig;
    generateDstStreamPrefix(testAirbyteConfig);
    expect(testAirbyteConfig.dstStreamPrefix).toEqual('custom_prefix__');
    expect(testAirbyteConfig.connectionName).toBeUndefined();
  });
});

describe('extractStateFromMessage', () => {
  it('should return undefined for unsupported formats', () => {
    expect(extractStateFromMessage({state: {type: AirbyteStateType.GLOBAL}} as AirbyteStateMessage)).toBeUndefined();
    expect(extractStateFromMessage({state: {}} as AirbyteStateMessage)).toBeUndefined();
  });

  it('should handle legacy state compressed format', () => {
    const legacyState: AirbyteStateMessage = {
      type: AirbyteMessageType.STATE,
      state: {
        data: {format: 'base64/gzip', data: 'testdata'},
      },
    };
    const result = extractStateFromMessage(legacyState);
    expect(result).toEqual({
      type: AirbyteStateType.LEGACY,
      data: {format: 'base64/gzip', data: 'testdata'},
    });
  });

  it('should handle legacy state format non-compressed format', () => {
    const legacyState: AirbyteStateMessage = {
      type: AirbyteMessageType.STATE,
      state: {
        data: {cursor: '2025-01-01'},
      },
    };
    const result = extractStateFromMessage(legacyState);
    expect(result).toEqual({
      type: AirbyteStateType.LEGACY,
      data: {cursor: '2025-01-01'},
    });
  });

  it('should handle STREAM state format', () => {
    const streamState: AirbyteStateMessage = {
      type: AirbyteMessageType.STATE,
      state: {
        type: AirbyteStateType.STREAM,
        stream: {
          stream_descriptor: {name: 'users'},
          stream_state: {format: 'base64/gzip', data: 'testdata'},
        },
      },
    };
    const result = extractStateFromMessage(streamState);
    expect(result).toEqual({
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'users'},
        stream_state: {format: 'base64/gzip', data: 'testdata'},
      },
    });
  });
});

describe('collectStates', () => {
  let streamStates: Map<string, AirbyteState>;
  let legacyState: {value: any};

  beforeEach(() => {
    streamStates = new Map();
    legacyState = {value: undefined};
  });

  it('should do nothing when state is undefined', () => {
    collectStates(undefined, streamStates, legacyState);
    expect(streamStates.size).toBe(0);
    expect(legacyState.value).toBeUndefined();
  });

  it('should collect STREAM states keyed by stream name', () => {
    const state1: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'users'},
        stream_state: {format: 'base64/gzip', data: 'testdata'},
      },
    };
    const state2: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'orders'},
        stream_state: {format: 'base64/gzip', data: 'testdata'},
      },
    };

    collectStates(state1, streamStates, legacyState);
    collectStates(state2, streamStates, legacyState);

    expect(streamStates.size).toBe(2);
    expect(streamStates.get('users')).toEqual(state1);
    expect(streamStates.get('orders')).toEqual(state2);
  });

  it('should keep only the latest STREAM state per stream', () => {
    const state1: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'users'},
        stream_state: {cursor: '2025-01-01'},
      },
    };
    const state2: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'users'},
        stream_state: {cursor: '2025-02-01'},
      },
    };

    collectStates(state1, streamStates, legacyState);
    collectStates(state2, streamStates, legacyState);

    expect(streamStates.size).toBe(1);
    expect(streamStates.get('users')).toEqual(state2);
  });

  it('should collect LEGACY state', () => {
    const state: AirbyteState = {
      type: AirbyteStateType.LEGACY,
      data: {cursor: '2025-01-01'},
    };

    collectStates(state, streamStates, legacyState);

    expect(legacyState.value).toEqual(state);
  });

  it('should keep only the latest LEGACY state', () => {
    const state1: AirbyteState = {
      type: AirbyteStateType.LEGACY,
      data: {cursor: '2025-01-01'},
    };
    const state2: AirbyteState = {
      type: AirbyteStateType.LEGACY,
      data: {cursor: '2025-02-01'},
    };

    collectStates(state1, streamStates, legacyState);
    collectStates(state2, streamStates, legacyState);

    expect(legacyState.value).toEqual(state2);
  });

  it('should ignore STREAM state without stream name', () => {
    const state = {
      type: AirbyteStateType.STREAM,
    } as AirbyteState;

    collectStates(state, streamStates, legacyState);

    expect(streamStates.size).toBe(0);
  });
});
