import {Command, Option} from 'commander';

import {CONFIG_FILE} from './constants/constants';
import {logger} from './logger';
import {AirbyteConfig, AirbyteConfigInputType, CliOptions, FarosConfig, OutputStream} from './types';
import {parseConfigFile, updateLogLevel} from './utils';
import {CLI_VERSION} from './version';

// Command line program
function command() {
  const cmd = new Command()
    .name('airbyte-local')
    .description('Airbyte local CLI')
    .version(CLI_VERSION, '-v, --version', 'Output the current version')
    // Enable this to allow src and dst configs to be passed as options as it's not natively supported by commanderjs
    .allowUnknownOption()
    .allowExcessArguments()
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
      new Option(
        '-c, --config-file <path>',
        'Airbyte source and destination connector config Json file path',
      ).conflicts(['src', 'dst']),
    )
    .option('--full-refresh', 'Force full_refresh and overwrite mode. This overrides the mode in provided config file.')
    .option('--state-file <path>', 'Override state file path for incremental sync')

    // Options: Airbyte connector settings
    .option('--no-src-pull', 'Skip pulling Airbyte source image')
    .option('--no-dst-pull', 'Skip pulling Airbyte destination image')
    .addOption(
      new Option(
        '--src-only',
        `Only run the Airbyte source and write output in stdout. Use '--src-output-file' instead to write to a file`,
      ).conflicts('srcOutputFile'),
    )
    .option('--src-output-file <path>', 'Write source output as a file (requires a destination)')
    .option('--src-check-connection', `Validate the Airbyte source connection`)
    .addOption(
      new Option('--dst-only <path>', 'Use a file for destination input instead of a source')
        .conflicts('srcOnly')
        .conflicts('srcOutputFile')
        .conflicts('srcCheckConnection'),
    )
    .option('--dst-use-host-network', 'Use the host network when running the Airbyte destination')
    .option('--log-level <level>', 'Set level of source and destination loggers', 'info')
    .option('--raw-messages', 'Output raw Airbyte messages')
    .option('--connection-name <name>', 'Connection name used in various places')
    .option('--keep-containers', 'Do not remove source and destination containers after they exit')

    // Options: Cli settings
    .option('-d, --debug', 'Enable debug logging')

    // Options: deprecated options
    .option('--src <image>', '[Deprecated] Airbyte source Docker image')
    .option('--dst <image>', '[Deprecated] Airbyte destination Docker image')
    .option('--src.<key> <value>', '[Deprecated] Add "key": "value" into the source config')
    .option('--dst.<key> <value>', '[Deprecated] Add "key": "value" into the destination config')

    // Options: renamed options
    .addOption(new Option('--check-connection', 'Support for the renamed option').hideHelp())
    .addOption(new Option('--state <file>', 'Support for the renamed option').hideHelp())

    // Options: hidden options
    .addOption(
      new Option('--dst-stream-prefix <prefix>', 'Override destination stream prefix')
        .hideHelp()
        .conflicts('connectionName'),
    )

    // Additional check
    .action((opts: any) => {
      if (opts.debug) {
        updateLogLevel(true);
        cmd.setOptionValue('logLevel', 'debug');
      }

      // Check if Airbyte config is provided
      if (!opts.configFile && !(opts.src || opts.dst)) {
        cmd.error(
          'Configuration options are missing. Please provide one of the following options: ' +
            `'--config-file', '--src' and '--dst' to configure the Airbyte connector.`,
        );
      }
    });

  // generate-config subcommand
  cmd
    .command('generate-config <source> [destination]')
    .description(
      'Generate Airbyte configuration templates. ' +
        'It is required to provide source, which means you will have to know ' +
        'which source data you are pulling from, e.g. Github, Jira, etc. ' +
        'and the default destination is Faros. ' +
        'For example, "./airbyte-local generate-config github" will pull data from Github and push it to Faros. ' +
        'If you want to use custom images, please use option "--image" and provide the images ' +
        '(source is required and destination is optional).',
    )
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .option('-s, --silent', 'Do not print out the configuration tables')
    .option(
      '--image',
      'Indicate that the provided source and destination are custom image(s), ' +
        'ex: "./airbyte-local generate-config --image farosai/airbyte-github-custom-source "',
    )
    .action((source, destination, opts: any) => {
      cmd.setOptionValue('generateConfig', {src: source, dst: destination});
      cmd.setOptionValue('silent', opts.silent);
      cmd.setOptionValue('image', opts.image);
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
        // parse the string as an json object. if fails, treeat it as a string
        let parsedValue;
        try {
          parsedValue = JSON.parse(value);
        } catch (_error) {
          parsedValue = value;
        }
        current[key] = parsedValue;
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

  // log warnings when src.* and dst.* options are used
  if (Object.keys(srcConfig).length > 0 || Object.keys(dstConfig).length > 0) {
    logger.warn(
      `Option '--src.<key> <value>' and '--dst.<key> <value>' are deprecated. Please use '--config-file' instead.`,
    );
    logger.warn(
      `Equivalent configuration file is generated at '${CONFIG_FILE}'.` +
        `Please replace the command with '--config-file ${CONFIG_FILE}'`,
    );
  }
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

/**
 * Parse the command line arguments.
 *
 * Since we have to handle deprecated options `--src.<key> <value>` and `--dst.<key> <value>`
 * which its syntax are not natively supported by commanderjs, we are forced to handle the unknown options ourselves.
 * We use `parseOptions` to get the unknown options. However theoretically, in commanderjs, parsing
 * should only be called once. Thus, we deep clone the options before calling parsing the second time
 * to get unknown options, to avoid the second parsing updating the options object.
 */
export function parseAndValidateInputs(argv: string[]): FarosConfig {
  // Create command line parse program
  const program = command();

  // Show help if no options or subcommands is given
  if (!argv.slice(2).length) {
    program.help();
  }

  // Parse arguments
  program.parse(argv);

  // Log the version
  logger.debug(`CLI version: ${CLI_VERSION}`);

  // Deep clone the parsed options before parsing the second time to get unknown options
  const options = structuredClone(program.opts());
  logger.debug(`Options: ${JSON.stringify(options)}`);

  // Check for unknown options only if it's not `generateConfig`
  // Note: calling `parseOptions` parsing again will have side effects and update the options object
  if (!options['generateConfig']) {
    const unknown = program.parseOptions(argv).unknown;
    unknown.forEach((u) => {
      if (u.startsWith('--') && !u.startsWith('--src.') && !u.startsWith('--dst.')) {
        throw new Error(`Unknown option: ${u}`);
      }
    });
  }

  // convert the options to CliOptions
  const cliOptions = convertToCliOptions(options);
  logger.debug(`Cli options: ${JSON.stringify(cliOptions)}`);

  // Handle the src and dst config options passed as options
  const configKeyValues = parseSrcAndDstConfig(argv);
  cliOptions.srcConfig = configKeyValues.srcConfig;
  cliOptions.dstConfig = configKeyValues.dstConfig;

  // Convert the cli options to FarosConfig
  const farosConfig: FarosConfig = {
    generateConfig: cliOptions.generateConfig,
    silent: cliOptions.silent ?? false,
    image: cliOptions.image ?? false,
    // The default source output file is stdout(`-`) if `srcOnly` is true
    // Take the non-default value if provided with `srcOutputFile` option
    srcOutputFile: cliOptions.srcOnly ? OutputStream.STDOUT : cliOptions.srcOutputFile,
    // Rename the `dstOnly` file path to `srcInputFile`
    srcInputFile: cliOptions.dstOnly,
    connectionName: cliOptions.connectionName,
    stateFile: cliOptions.stateFile ?? cliOptions.state,
    srcCheckConnection: cliOptions.srcCheckConnection ?? cliOptions.checkConnection ?? false,
    dstUseHostNetwork: cliOptions.dstUseHostNetwork ?? false,
    // If `dstOnly` is true, do not pull the source image. Otherwise, fall back to option `noSrcPull`
    srcPull: (cliOptions.dstOnly ? false : cliOptions.srcPull) ?? true,
    dstPull: (cliOptions.srcOnly ? false : cliOptions.dstPull) ?? true,
    fullRefresh: cliOptions.fullRefresh ?? false,
    rawMessages: cliOptions.rawMessages ?? false,
    keepContainers: cliOptions.keepContainers ?? false,
    logLevel: cliOptions.logLevel ?? 'info',
    debug: cliOptions.debug ?? false,
    dstStreamPrefix: cliOptions.dstStreamPrefix,
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
  }
  return farosConfig;
}
