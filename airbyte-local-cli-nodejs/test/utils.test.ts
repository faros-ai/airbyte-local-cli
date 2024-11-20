import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

import {checkDockerInstalled, parseConfigFile} from '../src/utils';

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
