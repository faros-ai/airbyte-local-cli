import * as command from '../src/command';
import * as docker from '../src/docker';
import {FarosConfig} from '../src/types';

jest.mock('../src/command');
jest.mock('../src/docker');
jest.mock('../src/utils');

describe('main', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  const testCommand = ['node', 'index.js', '--config-file', 'foo'];

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalExit = process.exit;
    process.exit = jest.fn() as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  it('should pull dock images', async () => {
    const testConfig = {
      srcPull: true,
      dstPull: true,
      src: {image: 'bar'},
      dst: {image: 'baz'},
    } as FarosConfig;
    process.argv = testCommand;
    (command.parseAndValidateInputs as jest.Mock).mockReturnValue(testConfig);

    const {main} = await import('../src/index');
    await main();

    expect(docker.pullDockerImage).toHaveBeenCalledWith('bar');
    expect(docker.pullDockerImage).toHaveBeenCalledWith('baz');
  });

  it('should not pull dock images', async () => {
    const testConfig = {
      srcPull: false,
      dstPull: false,
      src: {image: 'bar'},
      dst: {image: 'baz'},
    } as FarosConfig;
    process.argv = testCommand;
    (command.parseAndValidateInputs as jest.Mock).mockReturnValue(testConfig);

    const {main} = await import('../src/index');
    await main();

    expect(docker.pullDockerImage).not.toHaveBeenCalled();
  });

  it('should check source connection', async () => {
    const testConfig = {
      srcPull: true,
      dstPull: true,
      src: {image: 'bar'},
      dst: {image: 'baz'},
      srcCheckConnection: true,
    } as FarosConfig;
    process.argv = testCommand;
    (command.parseAndValidateInputs as jest.Mock).mockReturnValue(testConfig);

    const {main} = await import('../src/index');
    await main();

    expect(docker.checkSrcConnection).toHaveBeenCalled();
  });

  it('should run sync', async () => {
    const testConfig = {
      srcPull: true,
      dstPull: true,
      src: {image: 'bar'},
      dst: {image: 'baz'},
    } as FarosConfig;
    process.argv = testCommand;
    (command.parseAndValidateInputs as jest.Mock).mockReturnValue(testConfig);

    const {main} = await import('../src/index');
    await main();

    expect(docker.runSrcSync).toHaveBeenCalled();
    expect(docker.runDstSync).toHaveBeenCalled();
  });

  it('should not run source sync', async () => {
    const testConfig = {
      srcPull: true,
      dstPull: true,
      src: {image: 'bar'},
      dst: {image: 'baz'},
      srcInputFile: 'somefile',
    } as FarosConfig;
    process.argv = testCommand;
    (command.parseAndValidateInputs as jest.Mock).mockReturnValue(testConfig);

    const {main} = await import('../src/index');
    await main();

    expect(docker.runSrcSync).not.toHaveBeenCalled();
    expect(docker.runDstSync).toHaveBeenCalled();
  });

  it('should not run destination sync', async () => {
    const testConfig = {
      srcPull: true,
      dstPull: true,
      src: {image: 'bar'},
      dst: {image: 'baz'},
      srcOutputFile: 'somefile',
    } as FarosConfig;
    process.argv = testCommand;
    (command.parseAndValidateInputs as jest.Mock).mockReturnValue(testConfig);

    const {main} = await import('../src/index');
    await main();

    expect(docker.runSrcSync).toHaveBeenCalled();
    expect(docker.runDstSync).not.toHaveBeenCalled();
  });
});
