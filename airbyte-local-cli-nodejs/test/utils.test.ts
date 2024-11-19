import {writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

import {checkDockerInstalled, parseConfigFile, writeConfig} from '../src/utils';

jest.mock('node:fs');
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

describe('parseConfigFile', () => {
  it('should pass if config file is valid json', async () => {
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
    (readFile as jest.Mock).mockResolvedValue(JSON.stringify(airbyteConfig));
    await expect(parseConfigFile('test-config-file')).resolves.toEqual(airbyteConfig);
  });

  it('should fail if config file is not valid json', async () => {
    (readFile as jest.Mock).mockResolvedValue('invalid-json');
    await expect(parseConfigFile('test-config-file')).rejects.toThrow('Failed to read or parse config file');
  });

  it('should fail if config file contains invalid properties', async () => {
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
    (readFile as jest.Mock).mockResolvedValue(JSON.stringify(airbyteConfig));
    await expect(parseConfigFile('test-config-file')).rejects.toThrow(
      'Failed to read or parse config file: ' +
        'Invalid config file json format. Please check if it contains invalid properties.',
    );
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

describe.only('writeConfig', () => {
  it('should pass if config is written to file', () => {
    const config = {
      src: {
        image: 'source-image',
        config: {},
      },
      dst: {
        image: 'destination-image',
        config: {},
      },
    };
    const tmpDir = 'test-tmp-dir';
    const expectedConfigFile = `${tmpDir}/faros_airbyte_cli_config.json`;
    writeConfig(tmpDir, config);
    expect(writeFileSync).toHaveBeenCalledWith(expectedConfigFile, JSON.stringify(config));
  });
});
