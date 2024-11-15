import {readFileSync} from 'node:fs';

import {checkDockerInstalled, cleanUp, createTmpDir, execCommand, loadStateFile, parseConfigFile} from '../src/utils';

jest.mock('node:fs');

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
    expect(checkDockerInstalled('pwd')).toBeUndefined();
  });

  it('should fail if docker is not installed', () => {
    expect(() => checkDockerInstalled('bad-command')).toThrow();
  });
});

describe.skip('createTmpDir', () => {
  it('should pass if temporary directory is created', () => {
    const tmpDirPath = createTmpDir();
    expect(execCommand('ls ' + tmpDirPath)).not.toThrow();
    expect(cleanUp({tmpDir: tmpDirPath})).not.toThrow();
  });
});

describe.skip('loadStateFile', () => {
  it('should pass', () => {
    const state = '{}';
    (readFileSync as jest.Mock).mockReturnValue(state);
    expect(loadStateFile('./', 'test-state-file', undefined)).toBe('test-state-file');
  });

  it('should fail if state file is not loaded', () => {
    (readFileSync as jest.Mock).mockReturnValue(undefined);
    expect(loadStateFile('test-temp-dir', 'test-state-file', 'test-connection-name')).not.toThrow(
      'Failed to read or parse config file',
    );
  });
});
