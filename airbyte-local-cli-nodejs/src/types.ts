import {Dictionary} from 'ts-essentials';

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

  // deprecated
  checkConnection?: boolean; // use srcCheckConnection instead
  state?: string; // use stateFile instead
}

// Airbyte connector source or destination config
export interface AirbyteConfig {
  image: string;
  config?: object;
  catalog?: AirbyteConfiguredCatalog;
  dockerOptions?: AirbyteConfigDockerOptions;
}
export interface AirbyteConfigDockerOptions {
  maxMemory?: number; // unit: MB
  maxCpus?: number; // unit: CPU
  maxLogSize?: string; // default: 10m (10MB)
  additionalOptions?: any;
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
  debug: boolean;

  // internal use
  dstStreamPrefix?: string;
}

/**
 * Copy types from faros-ai/airtype-connectors
 * https://github.com/faros-ai/airbyte-connectors/blob/main/faros-airbyte-cdk/src/protocol.ts
 */
export enum AirbyteConnectionStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}
export enum AirbyteMessageType {
  CATALOG = 'CATALOG',
  CONNECTION_STATUS = 'CONNECTION_STATUS',
  LOG = 'LOG',
  RECORD = 'RECORD',
  SPEC = 'SPEC',
  STATE = 'STATE',
  TRACE = 'TRACE',
}
export interface AirbyteMessage {
  readonly type: AirbyteMessageType;
}
export declare class AirbyteConnectionStatusMessage implements AirbyteMessage {
  readonly connectionStatus: {
    status: AirbyteConnectionStatus;
    message?: string;
  };
  readonly type: AirbyteMessageType;
  constructor(connectionStatus: {status: AirbyteConnectionStatus; message?: string});
}
export enum SyncMode {
  FULL_REFRESH = 'full_refresh',
  INCREMENTAL = 'incremental',
}
export enum DestinationSyncMode {
  APPEND = 'append',
  OVERWRITE = 'overwrite',
  APPEND_DEDUP = 'append_dedup',
}
export interface AirbyteStream {
  name: string;
  json_schema?: Dictionary<any>;
  supported_sync_modes?: SyncMode[];
  source_defined_cursor?: boolean;
  default_cursor_field?: string[];
  source_defined_primary_key?: string[][];
  namespace?: string;
}
export interface AirbyteCatalog {
  streams: AirbyteStream[];
}
export declare class AirbyteCatalogMessage implements AirbyteMessage {
  readonly catalog: AirbyteCatalog;
  readonly type: AirbyteMessageType;
  constructor(catalog: AirbyteCatalog);
}
export interface AirbyteConfiguredStream {
  stream: AirbyteStream;
  sync_mode: SyncMode;
  cursor_field?: string[];
  destination_sync_mode?: DestinationSyncMode;
  primary_key?: string[][];
  disabled?: boolean;
}
export interface AirbyteConfiguredCatalog {
  streams: AirbyteConfiguredStream[];
}
