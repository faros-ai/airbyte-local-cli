import {Command, Option} from 'commander';

import {AirbyteConfig, AirbyteConfigInputType, CliOptions, FarosConfig} from './types';
import {logger, parseConfigFile, updateLogLevel} from './utils';
import {CLI_VERSION} from './version';

// Command line program
function command() {
  const cmd = new Command()
    .name('airbyte-local')
    .description('Airbyte local CLI')
    .version(CLI_VERSION, '-v, --version', 'Output the current version')
    // Enable this to allow src and dst configs to be passed as options
    .allowUnknownOption(true)
    // Help configiration
    .helpOption('-h, --help', 'Display usage information')
    .showHelpAfterError('(add --help for additional information)')
    .configureHelp({
      helpWidth: 100,
    })
    // Output configuration
    .configureOutput({
      writeErr: (str) => logger.error(str),
      writeOut: (str) => logger.info(str),
    })

    // Options: Airbyte connector config
    .addOption(
      new Option('--config-file <path>', 'Airbyte source and destination connector config Json file path').conflicts([
        'src',
        'dst',
        'wizard',
      ]),
    )
    // TODO: @FAI-13889 Finalize the wizard arugments and implementation
    .addOption(
      new Option('--wizard <src> [dst]', 'Run the Airbyte configuration wizard').conflicts([
        'configFile',
        'src',
        'dst',
      ]),
    )
    .option('--src <image>', 'Airbyte source Docker image')
    .option('--dst <image>', 'Airbyte destination Docker image')
    .option('--src.<key> <value>', 'Add "key": "value" into the source config')
    .option('--dst.<key> <value>', 'Add "key": "value" into the destination config')
    .option('--full-refresh', 'Force full_refresh and overwrite mode. This overrides the mode in provided config file.')
    .option('--state-file <path>', 'Override state file path for incremental sync')

    // Options: Airbyte connector settings
    .option('--no-src-pull', 'Skip pulling Airbyte source image')
    .option('--no-dst-pull', 'Skip pulling Airbyte destination image')
    .option('--src-check-connection', 'Validate the Airbyte source connection')
    .addOption(
      new Option(
        '--src-only',
        `Only run the Airbyte source and write output in stdout. Use '--src-output-file' instead to write to a file`,
      ).conflicts('srcOutputFile'),
    )
    .option('--src-output-file <path>', 'Write source output as a file (requires a destination)')
    .option('--dst-only <file>', 'Use a file for destination input instead of a source')
    .option('--dst-use-host-network', 'Use the host network when running the Airbyte destination')
    .option('--log-level <level>', 'Set level of source and destination loggers', 'info')
    .option('--raw-messages', 'Output raw Airbyte messages')
    .option('--connection-name <name>', 'Connection name used in various places')
    .option('--keep-containers', 'Do not remove source and destination containers after they exit')

    // Options: Cli settings
    .option('--debug', 'Enable debug logging')

    // Additional check
    .action((opts: any) => {
      if (opts.debug) {
        updateLogLevel(true);
        cmd.setOptionValue('logLevel', 'debug');
      }

      // Check if Airbyte config is provided
      if (!opts.configFile && !(opts.src || opts.dst) && !opts.wizard) {
        cmd.error(
          'Configuration options are missing. Please provide one of the following options: ' +
            `'--config-file', '--src' and '--dst', or '--wizard' to configure the Airbyte connector.`,
        );
      }
    });
  return cmd;
}

// Parse the key-value pair of source and destination configurations
function parseSrcAndDstConfig(argv: string[]) {
  const srcConfig: Record<string, string> = {};
  const dstConfig: Record<string, string> = {};

  function handleNestedConfig(obj: Record<string, any>, keys: string[], value: string) {
    let current = obj;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        current[key] = value;
      } else {
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
    });
  }

  argv.forEach((arg, index) => {
    if (arg.startsWith('--src.')) {
      const keys = arg.split('.').slice(1);
      const value = argv[index + 1];
      if (keys.length && value && !value.startsWith('--')) {
        handleNestedConfig(srcConfig, keys, value);
      }
    } else if (arg.startsWith('--dst.')) {
      const keys = arg.split('.').slice(1);
      const value = argv[index + 1];
      if (keys.length && value && !value.startsWith('--')) {
        handleNestedConfig(dstConfig, keys, value);
      }
    }
  });
  logger.debug('Source Config:', srcConfig);
  logger.debug('Destination Config:', dstConfig);
  return {srcConfig, dstConfig};
}

// Convert the options to CliOptions type
function convertToCliOptions(options: any): CliOptions {
  return {
    ...options,
    srcImage: options.src,
    dstImage: options.dst,
  } as CliOptions;
}

// Validate the input options
function validateConfigFileInput(config: FarosConfig, inputType: AirbyteConfigInputType): void {
  if (!config.src?.image && !config.srcInputFile) {
    if (inputType === AirbyteConfigInputType.OPTION) {
      throw new Error(`Missing source image. Please use '--src <image>' to provide the source image`);
    } else {
      throw new Error('Missing source image. Please make sure you provide it in the config file.');
    }
  }
  if (!config.dst?.image && !config.srcOutputFile) {
    if (inputType === AirbyteConfigInputType.OPTION) {
      throw new Error(`Missing destination image. Please use '--dst <image>' to provide the destination image`);
    } else {
      throw new Error('Missing destination image. Please make sure you provide it in the config file.');
    }
  }
  if (!config.src?.config || !config.dst?.config) {
    logger.warn('No source or destination config provided. Please make sure this is intended.');
  }
}

// parse the command line arguments
export function parseAndValidateInputs(argv: string[]): FarosConfig {
  // Parse the command line arguments
  const program = command().parse(argv);

  // Check for unknown options
  const unknown = program.parseOptions(argv).unknown;
  unknown.forEach((u) => {
    if (u.startsWith('--') && !u.startsWith('--src.') && !u.startsWith('--dst.')) {
      throw new Error(`Unknown option: ${u}`);
    }
  });

  // Handle the src and dst config options passed as options
  const configKeyValues = parseSrcAndDstConfig(argv);
  program.setOptionValue('srcConfig', configKeyValues.srcConfig);
  program.setOptionValue('dstConfig', configKeyValues.dstConfig);

  // Get the options
  const options = program.opts();
  logger.debug({options}, 'Options');
  const cliOptions = convertToCliOptions(options);
  logger.debug({cliOptions}, 'Cli options');

  // Convert the cli options to FarosConfig
  const farosConfig: FarosConfig = {
    // The default source output file is stdout if `srcOnly` is true
    // Take the non-default value if provided with `srcOutputFile` option
    srcOutputFile: cliOptions.srcOnly ? '/dev/null' : cliOptions.srcOutputFile,
    // Rename the `dstOnly` file path to `srcInputFile`
    srcInputFile: cliOptions.dstOnly,
    connectionName: cliOptions.connectionName,
    stateFile: cliOptions.stateFile,
    srcCheckConnection: cliOptions.srcCheckConnection ?? false,
    dstUseHostNetwork: cliOptions.dstUseHostNetwork ?? false,
    // If `dstOnly` is true, do not pull the source image. Otherwise, fall back to option `noSrcPull`
    srcPull: (cliOptions.dstOnly ? false : cliOptions.srcPull) ?? true,
    dstPull: (cliOptions.srcOnly ? false : cliOptions.dstPull) ?? true,
    fullRefresh: cliOptions.fullRefresh ?? false,
    rawMessages: cliOptions.rawMessages ?? false,
    keepContainers: cliOptions.keepContainers ?? false,
    logLevel: cliOptions.logLevel ?? 'info',
    debug: cliOptions.debug ?? false,
  };

  if (cliOptions.srcImage || cliOptions.dstImage) {
    farosConfig.src = {
      image: cliOptions.srcImage,
      config: cliOptions.srcConfig,
    } as AirbyteConfig;
    farosConfig.dst = {
      image: cliOptions.dstImage,
      config: cliOptions.dstConfig,
    } as AirbyteConfig;
    validateConfigFileInput(farosConfig, AirbyteConfigInputType.OPTION);
  } else if (cliOptions.configFile) {
    logger.info('Reading config file...');
    const airbyteConfig = parseConfigFile(cliOptions.configFile);
    farosConfig.src = airbyteConfig.src;
    farosConfig.dst = airbyteConfig.dst;
    validateConfigFileInput(farosConfig, AirbyteConfigInputType.FILE);
  } else if (cliOptions.wizard) {
    logger.info('Runing wizard...');
    // TODO: @FAI-13889 Implement the wizard
  }
  return farosConfig;
}
