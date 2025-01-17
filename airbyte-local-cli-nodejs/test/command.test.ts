import {parseAndValidateInputs} from '../src/command';
import {parseConfigFile} from '../src/utils';

jest.mock('../src/utils');

const defaultConfig = {
  srcPull: true,
  dstPull: true,
  srcCheckConnection: false,
  dstUseHostNetwork: false,
  fullRefresh: false,
  rawMessages: false,
  keepContainers: false,
  logLevel: 'info',
  debug: false,
};

afterEach(() => {
  jest.resetAllMocks();
});

describe('Check options conflict', () => {
  it('should fail if using both --config-file and --src', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path', '--src', 'source-image'];
    expect(() => parseAndValidateInputs(argv)).toThrow('process.exit() was called by commander js');
  });

  it('should fail if using both --config-file and --dst', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path', '--dst', 'destination-image'];
    expect(() => parseAndValidateInputs(argv)).toThrow();
  });

  it('should fail if using both --config-file and --wizard', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path', '--wizard'];
    expect(() => parseAndValidateInputs(argv)).toThrow();
  });

  it('should fail if using both --config-file and --wizard', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--src', 'source-image', '--dst', 'destination-image', '--wizard'];
    expect(() => parseAndValidateInputs(argv)).toThrow();
  });

  it('should fail if using both --src-only and --src-output-file', () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--src-only', '--src-output-file', 'some_test_path'];
    expect(() => parseAndValidateInputs(argv)).toThrow();
  });
});

describe('Check src and dst config parsing', () => {
  it('should parse and validate options: src and dst', () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--src', 'source-image', '--dst', 'destination-image'];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
    });
  });

  it('should parse and validate options: configFile', () => {
    const mockedParseConfigFile = parseConfigFile as jest.Mock;
    mockedParseConfigFile.mockReturnValue({
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
    });

    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path'];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
    });
  });

  it('should parse and validate options: src.* and dst.*', () => {
    const argv = [
      './airbyte-local-cli',
      'index.js',
      '--src',
      'source-image',
      '--dst',
      'destination-image',
      '--src.username',
      'src-username',
      '--src.password',
      'src-password',
      '--dst.username',
      'dst-username',
      '--dst.password',
      'dst-password',
    ];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {username: 'src-username', password: 'src-password'}},
      dst: {image: 'destination-image', config: {username: 'dst-username', password: 'dst-password'}},
    });
  });

  it('should parse and validate options: nested src.* and dst.*', () => {
    const argv = [
      './airbyte-local-cli',
      'index.js',
      '--src',
      'source-image',
      '--dst',
      'destination-image',
      '--dst.edition_config.graph',
      'default',
      '--dst.edition_config.edition',
      'cloud',
    ];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {
        image: 'destination-image',
        config: {
          edition_config: {graph: 'default', edition: 'cloud'},
        },
      },
    });
  });
});

describe('Check wizard option parsing', () => {
  it('should parse and validate options: wizard', () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--wizard', 'jira'];
    expect(() => parseAndValidateInputs(argv)).not.toThrow();
  });

  it('should parse and validate options: wizard with dst', () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--wizard', 'jira', 'faros'];
    expect(() => parseAndValidateInputs(argv)).not.toThrow();
  });
});

describe('Check other options', () => {
  it('should parse and validate options: all optional ones', () => {
    const argv = [
      './airbyte-local-cli',
      'index.js',
      '--src',
      'source-image',
      '--dst',
      'destination-image',
      '--state-file',
      'test_state_file',
      '--src-output-file',
      'test_src_output_file',
      '--dst-only',
      'test_src_input_file',
      '--connection-name',
      'test_connection_name',
      '--log-level',
      'debug',
      '--full-refresh',
      '--no-src-pull',
      '--no-dst-pull',
      '--src-check-connection',
      '--dst-use-host-network',
      '--raw-messages',
      '--keep-containers',
      '--debug',
    ];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
      srcOutputFile: 'test_src_output_file',
      srcInputFile: 'test_src_input_file',
      srcCheckConnection: true,
      dstUseHostNetwork: true,
      srcPull: false,
      dstPull: false,
      connectionName: 'test_connection_name',
      stateFile: 'test_state_file',
      fullRefresh: true,
      rawMessages: true,
      keepContainers: true,
      logLevel: 'debug',
      debug: true,
    });
  });

  it('should parse and validate options: debug', () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--src', 'source-image', '--dst', 'destination-image', '--debug'];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
      logLevel: 'debug',
      debug: true,
    });
  });

  it('should not fail on src-only without providing dst image', () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--src', 'source-image', '--src-only'];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: undefined, config: {}},
      srcOutputFile: 'STDOUT',
      dstPull: false,
    });
  });

  it('should not fail on dst-only without providing src image', () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--dst', 'destination-image', '--dst-only', 'test_src_input_file'];
    const result = parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: undefined, config: {}},
      dst: {image: 'destination-image', config: {}},
      srcInputFile: 'test_src_input_file',
      srcPull: false,
    });
  });
});
