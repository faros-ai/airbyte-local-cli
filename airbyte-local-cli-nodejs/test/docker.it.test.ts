import {readdirSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {Writable} from 'node:stream';

import {checkSrcConnection, pullDockerImage, runSrcSync} from '../src/docker';
import {FarosConfig} from '../src/types';

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
    await expect(runSrcSync(`${process.cwd()}/test/resources/dockerIt_runSrcSync`, testCfg)).resolves.not.toThrow();
  });

  // Check the error message is correctly redirect to process.stderr
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
        runSrcSync(`${process.cwd()}/test/resources/dockerIt_runSrcSync`, {
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
