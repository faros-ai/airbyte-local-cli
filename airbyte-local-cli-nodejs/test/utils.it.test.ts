import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Writable} from 'node:stream';

import {FarosConfig} from '../src/types';
import {
  checkDockerInstalled,
  cleanUp,
  createTmpDir,
  FILENAME_PREFIX,
  loadStateFile,
  OutputStream,
  parseConfigFile,
  processSrcData,
  writeConfig,
} from '../src/utils';

const testConfig: FarosConfig = {
  src: {
    image: 'farosai/airbyte-test-source',
    config: {
      username: 'test',
      password: 'test',
      url: 'test',
    },
    catalog: {
      tests: {disabled: true},
      projects: {disabled: true},
    },
  },
  dst: {
    image: 'farosai/airbyte-test-destination',
    config: {
      edition_config: {
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
};

describe('parseConfigFile', () => {
  it('should pass', () => {
    expect(parseConfigFile('test/resources/test_config_file.json')).toMatchSnapshot();
  });
  it('should fail with invalid json', () => {
    expect(() => parseConfigFile('test_config_file_invalid')).toThrow();
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
  beforeAll(() => {
    tmpDirPath = mkdtempSync(`${tmpdir()}/test-temp-dir`);
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

    it('should fail if state file is not loaded', () => {
      expect(() => loadStateFile(tmpDirPath, 'non-exist-state-file')).toThrow(
        `State file 'non-exist-state-file' not found. Please make sure the state file exists and have read access.`,
      );
    });
  });

  describe('writeConfig', () => {
    afterEach(() => {
      rmSync(`${FILENAME_PREFIX}_config.json`, {force: true});
      rmSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_config.json`, {force: true});
      rmSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_config.json`, {force: true});
      rmSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_catalog.json`, {force: true});
      rmSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_catalog.json`, {force: true});
    });

    it('should write files', () => {
      expect(() => writeConfig(tmpDirPath, structuredClone(testConfig))).not.toThrow();
      expect(existsSync(`${FILENAME_PREFIX}_config.json`)).toBe(true);
      expect(existsSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_config.json`)).toBe(true);
      expect(existsSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_config.json`)).toBe(true);
      expect(existsSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_catalog.json`)).toBe(true);
      expect(existsSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_catalog.json`)).toBe(true);

      expect(readFileSync(`${FILENAME_PREFIX}_config.json`, 'utf8')).toEqual(
        JSON.stringify({src: testConfig.src, dst: testConfig.dst}, null, 2),
      );
      expect(readFileSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_config.json`, 'utf8')).toEqual(
        JSON.stringify(testConfig.src?.config, null, 2),
      );
      expect(readFileSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_config.json`, 'utf8')).toEqual(
        JSON.stringify(testConfig.dst?.config, null, 2),
      );
      expect(readFileSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_catalog.json`, 'utf8')).toEqual(
        JSON.stringify(testConfig.src?.catalog, null, 2),
      );
      expect(readFileSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_catalog.json`, 'utf8')).toEqual(
        JSON.stringify(testConfig.src?.catalog, null, 2),
      );
    });

    it('should alter config if debug is enabled', () => {
      const testConfigDebug = {...structuredClone(testConfig), debug: true};
      testConfigDebug.src!.image = 'farosai/airbyte-faros-feeds-source:v1';
      expect(() => writeConfig(tmpDirPath, structuredClone(testConfigDebug))).not.toThrow();
      expect(existsSync(`${FILENAME_PREFIX}_config.json`)).toBe(true);
      expect(existsSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_config.json`)).toBe(true);
      expect(existsSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_config.json`)).toBe(true);

      expect(readFileSync(`${FILENAME_PREFIX}_config.json`, 'utf8')).toEqual(
        JSON.stringify({src: testConfigDebug.src, dst: testConfigDebug.dst}, null, 2),
      );
      expect(readFileSync(`${tmpDirPath}/${FILENAME_PREFIX}_src_config.json`, 'utf8')).toEqual(
        JSON.stringify({...testConfigDebug.src?.config, feed_cfg: {debug: true}}, null, 2),
      );
      expect(readFileSync(`${tmpDirPath}/${FILENAME_PREFIX}_dst_config.json`, 'utf8')).toEqual(
        JSON.stringify(testConfigDebug.dst?.config, null, 2),
      );
    });
  });
});

describe.only('processSrcData', () => {
  const testSrcInputFile = `${process.cwd()}/test/resources/test_src_input`;
  const testSrcOutputFile = `${process.cwd()}/test/resources/test_src_output`;

  afterEach(() => {
    rmSync(testSrcOutputFile, {force: true});
  });

  it('should succeed writing to an output file', async () => {
    const cfg: FarosConfig = {
      ...testConfig,
      srcInputFile: testSrcInputFile,
      srcOutputFile: testSrcOutputFile,
    };

    await expect(processSrcData(cfg)).resolves.not.toThrow();

    const output = readFileSync(testSrcOutputFile, 'utf8');
    expect(output).toMatchSnapshot();
  });

  it('should succeed writing to stdout', async () => {
    const cfg: FarosConfig = {
      ...testConfig,
      srcInputFile: testSrcInputFile,
      srcOutputFile: OutputStream.STDOUT,
    };

    // Capture process.stdout
    let stdoutData = '';
    const originalStdoutWrite = process.stdout.write;
    const stdoutStream = new Writable({
      write(chunk, _encoding, callback) {
        stdoutData += chunk.toString();
        callback();
      },
    });
    process.stdout.write = stdoutStream.write.bind(stdoutStream) as any;

    try {
      await expect(processSrcData(cfg)).resolves.not.toThrow();
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    // remove timestamp from the output so that it can be compared
    const stdoutDataWithoutTS = stdoutData.split('\n').map((line) => {
      return line.replace(/\[SRC\].*\s-/g, '[SRC]');
    });
    expect(stdoutDataWithoutTS.join('\n')).toMatchSnapshot();
  });
});
