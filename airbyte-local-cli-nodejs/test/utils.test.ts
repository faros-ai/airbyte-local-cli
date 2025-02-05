import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

import {AirbyteCatalog} from '../src/types';
import {checkDockerInstalled, overrideCatalog, parseConfigFile, updateSrcConfigWithFarosConfig} from '../src/utils';

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
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(airbyteConfig));
    expect(parseConfigFile('test-config-file')).toEqual(airbyteConfig);
  });

  it('should fail if config file is not valid json', () => {
    (readFileSync as jest.Mock).mockReturnValue('invalid-json');
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
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(airbyteConfig));
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
