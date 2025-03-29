import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {PassThrough, Writable} from 'node:stream';

import {
  checkSrcConnection,
  pullDockerImage,
  runDiscoverCatalog,
  runDstSync,
  runSpec,
  runSrcSync,
  runWizard,
} from '../src/docker';
import {FarosConfig} from '../src/types';
import {
  DST_CONFIG_FILENAME,
  OutputStream,
  setupStreams,
  SRC_OUTPUT_DATA_FILE,
  TMP_SPEC_CONFIG_FILENAME,
  TMP_WIZARD_CONFIG_FILENAME,
} from '../src/utils';

const defaultConfig: FarosConfig = {
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
};

beforeAll(async () => {
  await pullDockerImage('farosai/airbyte-example-source');
  await pullDockerImage('farosai/airbyte-faros-graphql-source');
  await pullDockerImage('farosai/airbyte-faros-destination');
  await pullDockerImage('airbyte/destination-databricks');
}, 120000);

describe('runDiscoverCatalog', () => {
  it('should success with example source', async () => {
    const res = await runDiscoverCatalog(`${process.cwd()}/test/resources`, 'farosai/airbyte-example-source');

    expect(res).toMatchSnapshot();
  });

  it('should success with graphql source', async () => {
    const res = await runDiscoverCatalog(`${process.cwd()}/test/resources`, 'farosai/airbyte-faros-graphql-source');

    expect(res).toMatchSnapshot();
  });
});

describe('checkSrcConnection', () => {
  it('should success', async () => {
    await expect(
      checkSrcConnection(
        `${process.cwd()}/test/resources`,
        'farosai/airbyte-example-source',
        'faros_airbyte_cli_src_config_chris.json',
      ),
    ).resolves.not.toThrow();
  });

  it('should fail with', async () => {
    await expect(
      checkSrcConnection(
        `${process.cwd()}/test/resources`,
        'farosai/airbyte-example-source',
        'faros_airbyte_cli_src_config_jennie.json',
      ),
    ).rejects.toThrow('Failed to validate source connection: User is not chris.');
  });
});

describe('runSrcSync', () => {
  const testCfg: FarosConfig = {
    ...defaultConfig,
    src: {
      image: 'farosai/airbyte-example-source',
    },
  };

  const testTmpDir = `${process.cwd()}/test/resources/dockerIt_runSrcSync`;

  // remove the intermediate output file
  afterEach(() => {
    rmSync(`${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`, {force: true});
  });

  it('should success', async () => {
    const {passThrough, srcOutputStream} = setupStreams();
    const writeStream = createWriteStream(`${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`);
    passThrough.pipe(writeStream);

    await expect(runSrcSync(testTmpDir, testCfg, srcOutputStream)).resolves.not.toThrow();

    // Replace timestamp and version for snapshot comparison
    const output = readFileSync(`${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`, 'utf8');
    const outputWithoutTS = output.split('\n').map((line) => {
      return line
        .replace(/"timestamp":\d+/g, '"timestamp":***')
        .replace(/"sourceVersion":"[\w.-]+"/g, '"sourceVersion":***')
        .replace(/Source version: [\w.-]+/g, 'Source version: ***');
    });
    expect(outputWithoutTS.join('\n')).toMatchSnapshot();
  });

  it('should success with specified output file', async () => {
    await expect(
      runSrcSync(testTmpDir, {...testCfg, srcOutputFile: `${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`}),
    ).resolves.not.toThrow();

    // Replace timestamp and version for snapshot comparison
    const output = readFileSync(`${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`, 'utf8');
    const outputWithoutTS = output.split('\n').map((line) => {
      return line
        .replace(/"timestamp":\d+/g, '"timestamp":***')
        .replace(/"sourceVersion":"[\w.-]+"/g, '"sourceVersion":***')
        .replace(/Source version: [\w.-]+/g, 'Source version: ***');
    });
    expect(outputWithoutTS.join('\n')).toMatchSnapshot();
  });

  it('should success with stdout', async () => {
    // print out to logger info
    await expect(
      runSrcSync(testTmpDir, {
        ...testCfg,
        srcOutputFile: OutputStream.STDOUT,
      }),
    ).resolves.not.toThrow();
  });

  // Check stdout message is correctly redirect to process.stderr
  it('should fail', async () => {
    // Capture process.stderr
    let stderrData = '';
    const originalStderrWrite = process.stderr.write;
    const stderrStream = new Writable({
      write(chunk, _encoding, callback) {
        stderrData += chunk.toString();
        callback();
      },
    });
    process.stderr.write = stderrStream.write.bind(stderrStream) as any;

    try {
      await expect(
        runSrcSync(testTmpDir, {
          ...testCfg,
          src: {image: 'farosai/airbyte-faros-graphql-source'},
        }),
      ).rejects.toThrow();
    } finally {
      process.stderr.write = originalStderrWrite;
    }

    expect(stderrData).toContain(`Faros API key was not provided`);
  });
});

describe('runDstSync', () => {
  const testCfg: FarosConfig = {
    ...defaultConfig,
    dst: {
      image: 'farosai/airbyte-faros-destination',
    },
    logLevel: 'debug',
    debug: true,
    stateFile: 'testConnectionName__state.json',
  };
  const testTmpDir = `${process.cwd()}/test/resources/dockerIt_runDstSync`;
  const testStateFile = `testConnectionName__state.json`;
  const dstConfigPath = `${testTmpDir}/${DST_CONFIG_FILENAME}`;
  const dstConfigPathTemplate = `${testTmpDir}/${DST_CONFIG_FILENAME}.template`;

  // remove config file that might contain credentials
  afterEach(() => {
    try {
      unlinkSync(dstConfigPath);
    } catch (_error) {
      // ignore
    }
  });

  // Clean up files created by the test
  afterAll(() => {
    try {
      unlinkSync(testStateFile);
    } catch (_error) {
      // ignore
    }
  });

  it('should success', async () => {
    // check if the API key is provided
    expect((process.env['FAROS_API_KEY'] ?? '').length > 0);
    const dstConfig = JSON.parse(readFileSync(dstConfigPathTemplate, 'utf8'));
    dstConfig.edition_configs.api_key = process.env['FAROS_API_KEY'];
    writeFileSync(dstConfigPath, JSON.stringify(dstConfig, null, 2));

    const passThrough = new PassThrough();
    const readStream = createReadStream(`${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`);
    readStream.pipe(passThrough);

    await expect(runDstSync(testTmpDir, testCfg, passThrough)).resolves.not.toThrow();

    const stateData = readFileSync(testStateFile, 'utf8');
    expect(JSON.parse(stateData).data).toBeTruthy();
    expect(stateData).toMatchSnapshot();
  }, 60000);

  it('should success with srcInputFile', async () => {
    // check if the API key is provided
    expect((process.env['FAROS_API_KEY'] ?? '').length > 0);
    const dstConfig = JSON.parse(readFileSync(dstConfigPathTemplate, 'utf8'));
    dstConfig.edition_configs.api_key = process.env['FAROS_API_KEY'];
    writeFileSync(dstConfigPath, JSON.stringify(dstConfig, null, 2));

    await expect(
      runDstSync(testTmpDir, {
        ...testCfg,
        srcInputFile: `${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`,
      }),
    ).resolves.not.toThrow();

    const stateData = readFileSync(testStateFile, 'utf8');
    expect(JSON.parse(stateData).data).toBeTruthy();
    expect(stateData).toMatchSnapshot();
  }, 60000);

  it('should fail', async () => {
    copyFileSync(dstConfigPathTemplate, dstConfigPath);

    await expect(runDstSync(testTmpDir, testCfg)).rejects.toThrow('Failed to run destination connector');
  }, 60000);
});

describe('runSpec', () => {
  const testTmpDir = `${process.cwd()}`;
  const testSpecfile = `${testTmpDir}/${TMP_SPEC_CONFIG_FILENAME}`;

  afterAll(() => {
    try {
      unlinkSync(testSpecfile);
    } catch (_error) {
      // ignore
    }
  });

  it('should success with faros image', async () => {
    await expect(runSpec(testTmpDir, 'farosai/airbyte-faros-graphql-source')).resolves.not.toThrow();

    const specData = readFileSync(testSpecfile, 'utf8');
    expect(JSON.parse(specData).spec).toBeTruthy();
    expect(specData).toMatchSnapshot();
  });

  it('should success with airbyte image', async () => {
    await expect(runSpec(testTmpDir, 'airbyte/destination-databricks')).resolves.not.toThrow();

    const specData = readFileSync(testSpecfile, 'utf8');
    expect(JSON.parse(specData).spec).toBeTruthy();
    expect(specData).toMatchSnapshot();
  });
});

describe('runWizard', () => {
  const testTmpDirGraphql = `${process.cwd()}/test/resources/dockerIt_runWizard_graphql`;
  const testTmpDirDatabricks = `${process.cwd()}/test/resources/dockerIt_runWizard_databricks`;

  afterAll(() => {
    try {
      unlinkSync(`${testTmpDirGraphql}/${TMP_WIZARD_CONFIG_FILENAME}`);
      unlinkSync(`${testTmpDirDatabricks}/${TMP_WIZARD_CONFIG_FILENAME}`);
    } catch (_error) {
      // ignore
    }
  });

  it('should success with faros image', async () => {
    await expect(runWizard(testTmpDirGraphql, 'farosai/airbyte-faros-graphql-source')).resolves.not.toThrow();

    const cfgData = readFileSync(`${testTmpDirGraphql}/${TMP_WIZARD_CONFIG_FILENAME}`, 'utf8');
    expect(cfgData).toMatchSnapshot();
  });

  it('should success with airbyte image', async () => {
    await expect(runWizard(testTmpDirDatabricks, 'airbyte/destination-databricks')).resolves.not.toThrow();

    const cfgData = readFileSync(`${testTmpDirDatabricks}/${TMP_WIZARD_CONFIG_FILENAME}`, 'utf8');
    expect(cfgData).toMatchSnapshot();
  });
});
