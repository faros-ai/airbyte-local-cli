export interface AirbyteCliContext {
  tmpDir?: string;
}

// Cli options provided by the user
export interface CliOptions {
  // source and destination config
  configFile?: string;
  wizard?: object;

  // source
  srcImage: string;
  srcConfig?: Record<string, any>;
  srcOutputFile?: string;
  srcCheckConnection?: boolean;
  srcOnly?: boolean;
  srcPull?: boolean;

  // destination
  dstImage: string;
  dstConfig?: Record<string, any>;
  dstUseHostNetwork?: boolean;
  dstOnly?: string;
  dstPull?: boolean;

  // general connector settings
  connectionName?: string;
  stateFile?: string;
  fullRefresh?: boolean;
  rawMessages?: boolean;
  keepContainers?: boolean;
  logLevel?: string;

  // logging
  debug?: boolean;
}

// Airbyte connector source or destination config
export interface AirbyteConfig {
  image: string;
  config?: object;
  catalog?: object;
  dockerOptions?: string;
}
export enum AirbyteConfigInputType {
  FILE = 'file',
  OPTION = 'option',
}

// Config that are needed for running this Airbyte Cli
export interface FarosConfig {
  src?: AirbyteConfig;
  dst?: AirbyteConfig;
  srcOutputFile: string | undefined; // if srcOnly is true
  srcInputFile: string | undefined; // if dstOnly is true
  srcCheckConnection: boolean;
  dstUseHostNetwork: boolean;
  srcPull: boolean;
  dstPull: boolean;
  connectionName: string | undefined;
  stateFile: string | undefined;
  fullRefresh: boolean;
  rawMessages: boolean;
  keepContainers: boolean;
  logLevel: string;
}
