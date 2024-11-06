import {parseAndValidateInputs} from '../src/command';
import {parseConfigFile} from '../src/utils';

jest.mock('../src/utils');

const defaultConfig = {
  logLevel: 'info',
};

describe('Check options conflict', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should fail if using both --config-file and --src', async () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path', '--src', 'source-image'];
    await expect(parseAndValidateInputs(argv)).rejects.toThrow();
  });

  it('should fail if using both --config-file and --dst', async () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path', '--dst', 'destination-image'];
    await expect(parseAndValidateInputs(argv)).rejects.toThrow();
  });

  it('should fail if using both --config-file and --wizard', async () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path', '--wizard'];
    await expect(parseAndValidateInputs(argv)).rejects.toThrow();
  });

  it('should fail if using both --config-file and --wizard', async () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--src', 'source-image', '--dst', 'destination-image', '--wizard'];
    await expect(parseAndValidateInputs(argv)).rejects.toThrow();
  });

  it('should fail if using both --src-only and --src-output-file', async () => {
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit() was called by commander js');
    });
    const argv = ['./airbyte-local-cli', 'index.js', '--src-only', '--src-output-file', 'some_test_path'];
    await expect(parseAndValidateInputs(argv)).rejects.toThrow();
  });
});

describe('Check src and dst config parsing', () => {
  const mockedParseConfigFile = parseConfigFile as jest.Mock;

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should parse and validate options: src and dst', async () => {
    const argv = ['./airbyte-local-cli', 'index.js', '--src', 'source-image', '--dst', 'destination-image'];
    const result = await parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
    });
  });

  it('should parse and validate options: configFile', async () => {
    mockedParseConfigFile.mockResolvedValue({
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
    });

    const argv = ['./airbyte-local-cli', 'index.js', '--config-file', 'config-file-path'];
    const result = await parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {}},
      dst: {image: 'destination-image', config: {}},
    });
  });

  it('should parse and validate options: src.* and dst.*', async () => {
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
    const result = await parseAndValidateInputs(argv);
    expect(result).toEqual({
      ...defaultConfig,
      src: {image: 'source-image', config: {username: 'src-username', password: 'src-password'}},
      dst: {image: 'destination-image', config: {username: 'dst-username', password: 'dst-password'}},
    });
  });

  it('should parse and validate options: nested src.* and dst.*', async () => {
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
    const result = await parseAndValidateInputs(argv);
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
