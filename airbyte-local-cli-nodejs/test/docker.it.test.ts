import {readdirSync, unlinkSync} from 'node:fs';
import path from 'node:path';

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

describe.only('runSrcSync', () => {
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
    const cfg: FarosConfig = {
      ...defaultConfig,
      src: {
        image: 'farosai/airbyte-example-source',
      },
    };
    await expect(runSrcSync(`${process.cwd()}/test/resources/dockerIt_runSrcSync_success`, cfg)).resolves.not.toThrow();
  });
});
