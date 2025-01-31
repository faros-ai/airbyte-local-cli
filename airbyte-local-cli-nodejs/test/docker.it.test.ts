import {copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {Writable} from 'node:stream';

import {checkSrcConnection, pullDockerImage, runDiscoverCatalog, runDstSync, runSrcSync} from '../src/docker';
import {FarosConfig} from '../src/types';
import {DST_CONFIG_FILENAME, SRC_OUTPUT_DATA_FILE} from '../src/utils';

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
};

beforeAll(async () => {
  await pullDockerImage('farosai/airbyte-example-source');
  await pullDockerImage('farosai/airbyte-faros-graphql-source');
  await pullDockerImage('farosai/airbyte-faros-destination');
});

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

  // Clean up files created by the test
  afterAll(() => {
    const pattern = /.*-src_cid$/;
    const files = readdirSync(process.cwd());
    const matchingFiles = files.filter((file) => pattern.test(file));

    matchingFiles.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      unlinkSync(filePath);
    });
  });

  it('should success', async () => {
    await expect(runSrcSync(testTmpDir, testCfg)).resolves.not.toThrow();

    // Replace timestamp and version for snapshot comparison
    const output = readFileSync(`${testTmpDir}/${SRC_OUTPUT_DATA_FILE}`, 'utf8');
    const outputWithoutTS = output.split('\n').map((line) => {
      return line
        .replace(/"timestamp":\d+/g, '"timestamp":***')
        .replace(/"sourceVersion":"[\d.]+"/g, '"sourceVersion":***')
        .replace(/Source version: [\d.]+/g, 'Source version: ***');
    });
    expect(outputWithoutTS.join('\n')).toMatchSnapshot();
  });

  // Check stderr message is correctly redirect to process.stderr
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

describe.only('runDstSync', () => {
  const testCfg: FarosConfig = {
    ...defaultConfig,
    dst: {
      image: 'farosai/airbyte-faros-destination:0.12.5',
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

  beforeAll(() => {
    expect(process.env['FAROS_API_KEY']).toBeDefined();
  });

  // Clean up files created by the test
  afterAll(() => {
    const pattern = /.*-dst_cid$/;
    const files = readdirSync(process.cwd());
    const matchingFiles = files.filter((file) => pattern.test(file));

    matchingFiles.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      unlinkSync(filePath);
    });

    try {
      unlinkSync(testStateFile);
    } catch (_error) {
      // ignore
    }
  });

  it('should success', async () => {
    const dstConfig = JSON.parse(readFileSync(dstConfigPathTemplate, 'utf8'));
    dstConfig.edition_configs.api_key = process.env['FAROS_API_KEY'];
    writeFileSync(dstConfigPath, JSON.stringify(dstConfig, null, 2));

    await expect(runDstSync(testTmpDir, testCfg)).resolves.not.toThrow();

    const stateData = readFileSync(testStateFile, 'utf8');
    expect(JSON.parse(stateData).data).toBeTruthy();
    expect(stateData).toMatchSnapshot();
  }, 60000);

  it('should fail', async () => {
    copyFileSync(dstConfigPathTemplate, dstConfigPath);

    await expect(runDstSync(testTmpDir, testCfg)).rejects.toThrow('Failed to run destination connector');
  }, 60000);
});
