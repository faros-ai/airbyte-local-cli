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
  DST_CONFIG_FILENAME,
  SRC_OUTPUT_DATA_FILE,
  TMP_SPEC_CONFIG_FILENAME,
  TMP_WIZARD_CONFIG_FILENAME,
} from '../src/constants/constants';
import {
  pullDockerImage,
  runCheckSrcConnection,
  runDiscoverCatalog,
  runDstSync,
  runSpec,
  runSrcSync,
  runWizard,
} from '../src/docker';
import {AirbyteSpec, FarosConfig, OutputStream} from '../src/types';
import {setupStreams} from '../src/utils';

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
  image: false,
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
      runCheckSrcConnection(
        `${process.cwd()}/test/resources`,
        'farosai/airbyte-example-source',
        'faros_airbyte_cli_src_config_chris.json',
      ),
    ).resolves.not.toThrow();
  });

  it('should fail with', async () => {
    await expect(
      runCheckSrcConnection(
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

  it('should wait for write to complete', async () => {
    const passThrough = new PassThrough();
    const srcOutputStream = new Writable({
      async write(chunk, _encoding, callback) {
        // Sleep for 2 second to simulate a slow stream
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 2000);
        });

        passThrough.write(chunk.toString());
        callback();
      },
    });
    srcOutputStream.on('finish', () => {
      passThrough.end();
    });

    // Write the output to a file
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
  it('should success with faros image', async () => {
    const result = await runSpec('farosai/airbyte-faros-graphql-source');
    expect(result.spec).toBeTruthy();
    expect(result).toMatchSnapshot();
  });

  it('should success with airbyte image', async () => {
    const result = await runSpec('airbyte/destination-databricks');
    expect(result.spec).toBeTruthy();
    expect(result).toMatchSnapshot();
  });
});

describe('runWizard', () => {
  const testTmpDir = `${process.cwd()}/test/resources`;

  afterAll(() => {
    try {
      unlinkSync(`${testTmpDir}/${TMP_WIZARD_CONFIG_FILENAME}`);
      unlinkSync(`${testTmpDir}/${TMP_SPEC_CONFIG_FILENAME}`);
    } catch (_error) {
      // ignore
    }
  });

  it('should success with faros image', async () => {
    const spec = readFileSync(`${process.cwd()}/test/resources/graphql_spec.json`, 'utf8');
    const cfgData = await runWizard(
      testTmpDir,
      'farosai/airbyte-faros-graphql-source',
      JSON.parse(spec) as AirbyteSpec,
    );
    expect(cfgData).toMatchSnapshot();
  });

  it('should success with airbyte image', async () => {
    const spec = readFileSync(`${process.cwd()}/test/resources/databricks_spec.json`, 'utf8');
    const cfgData = await runWizard(testTmpDir, 'airbyte/destination-databricks', JSON.parse(spec) as AirbyteSpec);
    expect(cfgData).toMatchSnapshot();
  });
});
