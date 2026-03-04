import {FarosConfig} from '../src/types';

export function createTestCfg(overrides: Partial<FarosConfig> = {}): FarosConfig {
  return {
    srcOutputFile: undefined,
    srcInputFile: undefined,
    srcCheckConnection: false,
    dstUseHostNetwork: false,
    srcPull: false,
    dstPull: false,
    fullRefresh: false,
    rawMessages: false,
    keepContainers: false,
    logLevel: 'info',
    debug: false,
    yes: false,
    silent: false,
    image: false,
    connectionName: undefined,
    stateFile: undefined,
    ...overrides,
  };
}
