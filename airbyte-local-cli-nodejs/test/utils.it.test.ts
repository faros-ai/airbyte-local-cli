import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';

import {
  CONFIG_FILE,
  DST_CATALOG_FILENAME,
  DST_CONFIG_FILENAME,
  SRC_CATALOG_FILENAME,
  SRC_CONFIG_FILENAME,
  SRC_OUTPUT_DATA_FILE,
} from '../src/constants/constants';
import {runDiscoverCatalog, runSpec, runWizard} from '../src/docker';
import {AirbyteState, AirbyteStateType, FarosConfig, SyncMode} from '../src/types';
import {
  checkDockerInstalled,
  cleanUp,
  createTmpDir,
  generateConfig,
  loadStateFile,
  parseConfigFile,
  processSrcInputFile,
  writeCatalog,
  writeConfig,
  writeStateFile,
} from '../src/utils';

jest.mock('../src/docker');

const testConfig: FarosConfig = {
  src: {
    image: 'farosai/airbyte-test-source',
    config: {
      username: 'test',
      password: 'test',
      url: 'test',
    },
    catalog: {
      streams: [
        {stream: {name: 'tests'}, sync_mode: SyncMode.INCREMENTAL, disabled: true},
        {stream: {name: 'projects'}, sync_mode: SyncMode.FULL_REFRESH, disabled: true},
      ],
    },
  },
  dst: {
    image: 'farosai/airbyte-test-destination',
    config: {
      edition_configs: {
        graph: 'default',
        edition: 'cloud',
        api_url: 'https://test.api.faros.ai',
      },
    },
  },

  // default values
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

describe('parseConfigFile', () => {
  it('should pass', () => {
    expect(parseConfigFile('test/resources/test_config_file.json')).toMatchSnapshot();
  });
  it('should fail with invalid json', () => {
    expect(() => parseConfigFile('test_config_file_invalid')).toThrow();
  });
  it('should parse utf16 encoding', () => {
    expect(parseConfigFile('test/resources/test_config_file_utf16.json')).toMatchSnapshot();
  });
  it('should parse crlf', () => {
    expect(parseConfigFile('test/resources/test_config_file_crlf.json')).toMatchSnapshot();
  });
});

describe('checkDockerInstalled', () => {
  it('should pass if docker is installed', () => {
    expect(checkDockerInstalled('pwd', [])).toBeUndefined();
  });

  it('should fail if docker is not installed', () => {
    expect(() => checkDockerInstalled('bad-command')).toThrow();
  });
});

describe('createTmpDir', () => {
  it('should pass', () => {
    const tmpDirPath = createTmpDir();
    expect(existsSync(tmpDirPath)).toBe(true);
    expect(() => cleanUp({tmpDir: tmpDirPath})).not.toThrow();
  });

  it('should pass with non default dir', () => {
    const tmpDirPath = createTmpDir(`test/test-tmp-dir`);
    expect(existsSync(tmpDirPath)).toBe(true);
    expect(() => cleanUp({tmpDir: tmpDirPath})).not.toThrow();
  });
});

describe('write files to temporary dir', () => {
  let tmpDirPath: string;
  let srcConfigPath: string;
  let dstConfigPath: string;
  let srcCatalogPath: string;
  let dstCatalogPath: string;

  beforeAll(() => {
    tmpDirPath = mkdtempSync(`${tmpdir()}/test-temp-dir`);
    srcConfigPath = `${tmpDirPath}/${SRC_CONFIG_FILENAME}`;
    dstConfigPath = `${tmpDirPath}/${DST_CONFIG_FILENAME}`;
    srcCatalogPath = `${tmpDirPath}/${SRC_CATALOG_FILENAME}`;
    dstCatalogPath = `${tmpDirPath}/${DST_CATALOG_FILENAME}`;
  });
  afterAll(() => {
    rmSync(tmpDirPath, {recursive: true, force: true});
  });

  describe('loadStateFile', () => {
    it('should pass without existing state file', () => {
      expect(() => loadStateFile(tmpDirPath)).not.toThrow();
      expect(existsSync(`${tmpDirPath}/state.json`)).toBe(true);
      expect(readFileSync(`${tmpDirPath}/state.json`, 'utf8')).toBe('{}');
    });

    it('should pass with existing state file', () => {
      const testStateFile = 'test/resources/test__state.json';
      expect(() => loadStateFile(tmpDirPath, testStateFile)).not.toThrow();
      expect(existsSync(`${tmpDirPath}/state.json`)).toBe(true);
      expect(readFileSync(`${tmpDirPath}/state.json`, 'utf8')).toMatchSnapshot();
    });

    it('should pass with utf16 state file', () => {
      const testStateFile = 'test/resources/test__state_utf16.json';
      expect(() => loadStateFile(tmpDirPath, testStateFile)).not.toThrow();
      expect(existsSync(`${tmpDirPath}/state.json`)).toBe(true);
      expect(readFileSync(`${tmpDirPath}/state.json`, 'utf8')).toMatchSnapshot();
    });

    it('should fail if state file is not loaded', () => {
      expect(() => loadStateFile(tmpDirPath, 'non-exist-state-file')).toThrow(
        `State file 'non-exist-state-file' not found. Please make sure the state file exists and have read access.`,
      );
    });
  });

  describe('writeConfig', () => {
    afterEach(() => {
      rmSync(CONFIG_FILE, {force: true});
      rmSync(srcConfigPath, {force: true});
      rmSync(dstConfigPath, {force: true});
    });

    it('should write files', () => {
      expect(() => writeConfig(tmpDirPath, structuredClone(testConfig))).not.toThrow();
      expect(existsSync(CONFIG_FILE)).toBe(true);
      expect(existsSync(srcConfigPath)).toBe(true);
      expect(existsSync(dstConfigPath)).toBe(true);

      expect(readFileSync(CONFIG_FILE, 'utf8')).toEqual(
        JSON.stringify({src: testConfig.src, dst: testConfig.dst}, null, 2),
      );
      expect(readFileSync(srcConfigPath, 'utf8')).toEqual(JSON.stringify(testConfig.src?.config));
      expect(readFileSync(dstConfigPath, 'utf8')).toEqual(JSON.stringify(testConfig.dst?.config));
    });

    it('should alter config if debug is enabled', () => {
      const testConfigDebug = {...structuredClone(testConfig), debug: true};
      testConfigDebug.src!.image = 'farosai/airbyte-faros-feeds-source:v1';
      expect(() => writeConfig(tmpDirPath, structuredClone(testConfigDebug))).not.toThrow();
      expect(existsSync(CONFIG_FILE)).toBe(true);
      expect(existsSync(srcConfigPath)).toBe(true);
      expect(existsSync(dstConfigPath)).toBe(true);

      expect(readFileSync(CONFIG_FILE, 'utf8')).toEqual(
        JSON.stringify({src: testConfigDebug.src, dst: testConfigDebug.dst}, null, 2),
      );
      expect(readFileSync(srcConfigPath, 'utf8')).toEqual(
        JSON.stringify({...testConfigDebug.src?.config, feed_cfg: {debug: true}}),
      );
      expect(readFileSync(dstConfigPath, 'utf8')).toEqual(JSON.stringify(testConfigDebug.dst?.config));
    });

    it('should alter config with feeds source image', () => {
      const testConfigFeeds = structuredClone(testConfig);
      testConfigFeeds.src!.image = 'farosai/airbyte-faros-feeds-source';
      testConfigFeeds.dst!.image = 'farosai/airbyte-faros-destination';

      expect(() => writeConfig(tmpDirPath, structuredClone(testConfigFeeds))).not.toThrow();
      expect(existsSync(CONFIG_FILE)).toBe(true);
      expect(existsSync(srcConfigPath)).toBe(true);
      expect(existsSync(dstConfigPath)).toBe(true);

      expect(JSON.parse(readFileSync(srcConfigPath, 'utf8'))).toEqual({
        ...testConfigFeeds.src?.config,
        faros: {graph: 'default', api_url: 'https://test.api.faros.ai'},
      });
      expect(readFileSync(dstConfigPath, 'utf8')).toEqual(JSON.stringify(testConfigFeeds.dst?.config));
    });

    it('should succeed with empty dst config', () => {
      const testConfigFeeds = structuredClone(testConfig);
      testConfigFeeds.src!.image = 'farosai/airbyte-faros-feeds-source';
      testConfigFeeds.dst!.image = 'farosai/airbyte-faros-destination';
      testConfigFeeds.dst!.config = {};

      expect(() => writeConfig(tmpDirPath, structuredClone(testConfigFeeds))).not.toThrow();
      expect(existsSync(CONFIG_FILE)).toBe(true);
      expect(existsSync(srcConfigPath)).toBe(true);
      expect(existsSync(dstConfigPath)).toBe(true);

      expect(readFileSync(srcConfigPath, 'utf8')).toEqual(JSON.stringify(testConfigFeeds.src?.config));
      expect(readFileSync(dstConfigPath, 'utf8')).toEqual(JSON.stringify(testConfigFeeds.dst?.config));
    });
  });

  describe('writeCatalog', () => {
    beforeAll(() => {
      writeFileSync(srcConfigPath, '{}');
    });
    beforeEach(() => {
      (runDiscoverCatalog as jest.Mock).mockResolvedValue({
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
      });
    });
    afterEach(() => {
      rmSync(srcConfigPath, {force: true});
      rmSync(srcCatalogPath, {force: true});
      rmSync(dstCatalogPath, {force: true});
    });

    it('should succeed with default only', async () => {
      const emptyCatalogTestConfig = {
        ...structuredClone(testConfig),
        src: {...testConfig.src, catalog: {}},
        dstStreamPrefix: 'testPrefix__',
      } as FarosConfig;
      await writeCatalog(tmpDirPath, emptyCatalogTestConfig);

      expect(existsSync(srcCatalogPath)).toBe(true);
      expect(existsSync(dstCatalogPath)).toBe(true);
      const srcCatalog = JSON.parse(readFileSync(srcCatalogPath, 'utf8'));
      const dstCatalog = JSON.parse(readFileSync(dstCatalogPath, 'utf8'));
      expect(srcCatalog.streams[0].sync_mode).toBe('incremental');
      expect(srcCatalog.streams[0].destination_sync_mode).toBe('append');
      expect(dstCatalog.streams[0].sync_mode).toBe('incremental');
      expect(dstCatalog.streams[0].destination_sync_mode).toBe('append');
      expect(dstCatalog.streams[0].stream.name).toBe('testPrefix__builds');
      expect(srcCatalog).toMatchSnapshot();
      expect(dstCatalog).toMatchSnapshot();
    });

    it('should succeed with src override', async () => {
      const overrideCatalog = {
        streams: [
          {
            stream: {name: 'builds'},
            sync_mode: 'full_refresh',
          },
        ],
      };
      const catalogTestConfig = {
        ...structuredClone(testConfig),
        src: {...testConfig.src, catalog: overrideCatalog},
        dstStreamPrefix: 'testOverridePrefix__',
      } as FarosConfig;
      await writeCatalog(tmpDirPath, catalogTestConfig);

      expect(existsSync(srcCatalogPath)).toBe(true);
      expect(existsSync(dstCatalogPath)).toBe(true);
      const srcCatalog = JSON.parse(readFileSync(srcCatalogPath, 'utf8'));
      const dstCatalog = JSON.parse(readFileSync(dstCatalogPath, 'utf8'));
      expect(srcCatalog.streams[0].sync_mode).toBe('full_refresh');
      expect(srcCatalog.streams[0].destination_sync_mode).toBe('overwrite');
      expect(dstCatalog.streams[0].sync_mode).toBe('full_refresh');
      expect(dstCatalog.streams[0].destination_sync_mode).toBe('overwrite');
      expect(dstCatalog.streams[0].stream.name).toBe('testOverridePrefix__builds');
      expect(srcCatalog).toMatchSnapshot();
      expect(dstCatalog).toMatchSnapshot();
    });

    it('should succeed with dst override', async () => {
      const overrideSrcCatalog = {
        streams: [
          {
            stream: {name: 'builds'},
            sync_mode: 'incremental',
          },
        ],
      };
      const overrideDstCatalog = {streams: [{...overrideSrcCatalog.streams[0], sync_mode: 'full_refresh'}]};
      const catalogTestConfig = {
        ...structuredClone(testConfig),
        src: {...testConfig.src, catalog: overrideSrcCatalog},
        dst: {...testConfig.dst, catalog: overrideDstCatalog},
        dstStreamPrefix: 'testPrefix__',
      } as FarosConfig;
      await writeCatalog(tmpDirPath, catalogTestConfig);

      expect(existsSync(srcCatalogPath)).toBe(true);
      expect(existsSync(dstCatalogPath)).toBe(true);
      const srcCatalog = JSON.parse(readFileSync(srcCatalogPath, 'utf8'));
      const dstCatalog = JSON.parse(readFileSync(dstCatalogPath, 'utf8'));
      expect(srcCatalog.streams[0].sync_mode).toBe('incremental');
      expect(srcCatalog.streams[0].destination_sync_mode).toBe('append');
      expect(dstCatalog.streams[0].sync_mode).toBe('full_refresh');
      expect(dstCatalog.streams[0].destination_sync_mode).toBe('overwrite');
      expect(srcCatalog).toMatchSnapshot();
      expect(dstCatalog).toMatchSnapshot();
    });

    it('should succeed with dst only', async () => {
      const dstOnlyCatalog = {
        streams: [
          {
            stream: {name: 'builds'},
            sync_mode: 'incremental',
          },
        ],
      };
      const catalogTestConfig = {
        ...structuredClone(testConfig),
        src: undefined as unknown,
        dst: {...testConfig.dst, catalog: dstOnlyCatalog},
        dstStreamPrefix: 'testPrefix__',
        srcInputFile: 'testSrcInputFile',
      } as FarosConfig;
      await writeCatalog(tmpDirPath, catalogTestConfig);

      expect(existsSync(srcCatalogPath)).toBe(true);
      expect(existsSync(dstCatalogPath)).toBe(true);
      const srcCatalog = JSON.parse(readFileSync(srcCatalogPath, 'utf8'));
      const dstCatalog = JSON.parse(readFileSync(dstCatalogPath, 'utf8'));
      expect(srcCatalog).toEqual({streams: []});
      expect(dstCatalog).toEqual(dstOnlyCatalog);
    });
  });
});

describe('processSrcInputFile', () => {
  const tmpDir = `${process.cwd()}/test/resources`;
  const testSrcInputFile = `${tmpDir}/test_src_input`;
  const testSrcOutputFile = `${tmpDir}/${SRC_OUTPUT_DATA_FILE}`;

  afterEach(() => {
    rmSync(testSrcOutputFile, {force: true});
  });

  it('should succeed writing to an output file', async () => {
    const cfg: FarosConfig = {
      ...testConfig,
      srcInputFile: testSrcInputFile,
      srcOutputFile: testSrcOutputFile,
    };

    await expect(processSrcInputFile(tmpDir, cfg)).resolves.not.toThrow();

    const output = readFileSync(testSrcOutputFile, 'utf8');
    const outputWithoutTS = output.split('\n').map((line) => line.replace(/"timestamp":\d+/g, '"timestamp":***'));
    expect(outputWithoutTS.join('\n')).toMatchSnapshot();
  });

  it('should fail with processing error', async () => {
    const cfg: FarosConfig = {
      ...testConfig,
      srcInputFile: `${process.cwd()}/test/resources/test_src_input_invalid_json`,
      srcOutputFile: '/dev/null',
    };
    await expect(processSrcInputFile(tmpDir, cfg)).rejects.toThrow(
      `Failed to process the source input file: Line of data: 'invalid json'`,
    );
  });

  it('should fail with outstream error', async () => {
    writeFileSync(testSrcOutputFile, 'test');
    chmodSync(testSrcOutputFile, 0o544);
    const cfg: FarosConfig = {
      ...testConfig,
      srcInputFile: testSrcInputFile,
      srcOutputFile: testSrcOutputFile,
    };
    await expect(processSrcInputFile(tmpDir, cfg)).rejects.toThrow(
      'Failed to process the source input file: EACCES: permission denied,',
    );
  });
});

describe('writeStateFile', () => {
  let streamStates: Map<string, AirbyteState>;
  let legacyState: {value: any};
  const testStateFile = `${process.cwd()}/test/resources/writeStateFile_test_state.json`;

  beforeEach(() => {
    streamStates = new Map();
    legacyState = {value: undefined};
  });

  afterEach(() => {
    try {
      unlinkSync(testStateFile);
    } catch (_error) {
      // ignore
    }
  });

  it('should write STREAM states as an array', () => {
    const state1: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'users'},
        stream_state: {cursor: '2024-01-01'},
      },
    };
    const state2: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'orders'},
        stream_state: {cursor: '2024-02-01'},
      },
    };
    streamStates.set('users', state1);
    streamStates.set('orders', state2);

    writeStateFile(streamStates, legacyState, testStateFile);

    const result = JSON.parse(readFileSync(testStateFile, 'utf8'));
    expect(result).toMatchSnapshot();
  });

  it('should write LEGACY state data only', () => {
    const state: AirbyteState = {
      type: AirbyteStateType.LEGACY,
      data: {format: 'base64/gzip', data: 'dGVzdA=='},
    };
    legacyState.value = state;

    writeStateFile(streamStates, legacyState, testStateFile);

    const result = JSON.parse(readFileSync(testStateFile, 'utf8'));
    expect(result).toMatchSnapshot();
  });

  it('should prioritize STREAM states over LEGACY state', () => {
    const streamState: AirbyteState = {
      type: AirbyteStateType.STREAM,
      stream: {
        stream_descriptor: {name: 'users'},
        stream_state: {cursor: '2024-01-01'},
      },
    };
    const legacy: AirbyteState = {
      type: AirbyteStateType.LEGACY,
      data: {cursor: '2024-02-01'},
    };
    streamStates.set('users', streamState);
    legacyState.value = legacy;

    writeStateFile(streamStates, legacyState, testStateFile);

    const result = JSON.parse(readFileSync(testStateFile, 'utf8'));
    expect(result).toMatchSnapshot();
  });
});

describe('generateConfig', () => {
  const tmpDir = `${process.cwd()}/test/resources`;
  const testWizardFile = `${tmpDir}/tmp_wizard_config.json`;

  afterAll(() => {
    rmSync(CONFIG_FILE, {force: true});
    rmSync(testWizardFile, {force: true});
  });

  it('should succeed', async () => {
    (runSpec as jest.Mock).mockResolvedValue({});
    (runWizard as jest.Mock).mockResolvedValue({foo: 'bar'});

    const testGenCfg = {
      ...testConfig,
      silent: true,
      generateConfig: {
        src: 'faros-graphql',
        dst: 'faros',
      },
    };
    await expect(generateConfig(tmpDir, testGenCfg)).resolves.not.toThrow();

    const resultCfg = readFileSync(CONFIG_FILE, 'utf8');
    expect(resultCfg).toMatchSnapshot();
  });

  it('should succeed with static configs', async () => {
    const testGenCfg = {
      ...testConfig,
      silent: true,
      generateConfig: {
        src: 'github',
        dst: 'faros',
      },
    };
    await expect(generateConfig('tmp-dummpy', testGenCfg)).resolves.not.toThrow();

    const resultCfg = readFileSync(CONFIG_FILE, 'utf8');
    expect(resultCfg).toMatchSnapshot();
  });

  it('should succeed with image inputs', async () => {
    (runSpec as jest.Mock).mockResolvedValue({});
    (runWizard as jest.Mock).mockResolvedValue({foo: 'bar'});

    const testGenCfg = {
      ...testConfig,
      silent: true,
      image: true,
      generateConfig: {
        src: 'farosai/airbyte-faros-graphql-source',
      },
    };
    await expect(generateConfig(tmpDir, testGenCfg)).resolves.not.toThrow();

    const resultCfg = readFileSync(CONFIG_FILE, 'utf8');
    expect(resultCfg).toMatchSnapshot();
  });

  it('should pass feed name to wizard for feeds source', async () => {
    (runSpec as jest.Mock).mockResolvedValue({});
    (runWizard as jest.Mock).mockResolvedValue({foo: 'bar'});

    const testGenCfg = {
      ...testConfig,
      silent: true,
      generateConfig: {
        src: 'changeset',
        dst: 'faros',
      },
    };
    await expect(generateConfig(tmpDir, testGenCfg)).resolves.not.toThrow();

    // Verify runWizard was called with feedName for the feeds source
    expect(runWizard).toHaveBeenCalledWith(
      tmpDir,
      'farosai/airbyte-faros-feeds-source',
      expect.anything(),
      'changeset',
    );

    const resultCfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    expect(resultCfg.src.image).toBe('farosai/airbyte-faros-feeds-source');
  });

  it('should not pass feed name to wizard for non-feeds source', async () => {
    (runSpec as jest.Mock).mockResolvedValue({});
    (runWizard as jest.Mock).mockResolvedValue({foo: 'bar'});

    const testGenCfg = {
      ...testConfig,
      silent: true,
      generateConfig: {
        src: 'faros-graphql',
        dst: 'faros',
      },
    };
    await expect(generateConfig(tmpDir, testGenCfg)).resolves.not.toThrow();

    // Verify runWizard was called without feedName for non-feeds source
    expect(runWizard).toHaveBeenCalledWith(
      tmpDir,
      'farosai/airbyte-faros-graphql-source',
      expect.anything(),
      undefined,
    );
  });

  it('should fail with invalid config', async () => {
    const testGenCfg = {
      ...testConfig,
      generateConfig: {
        src: 'foobar',
      },
    };
    await expect(generateConfig('tmp-dummpy', testGenCfg)).rejects.toThrow(
      `Source type 'foobar' not found. Please provide a valid source type.`,
    );
  });
});
