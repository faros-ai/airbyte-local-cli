import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {Command} from 'commander';
import Docker from 'dockerode';

const program = new Command();
const docker = new Docker();
let config: any = {};

program
  .name('airbyte-local.sh')
  .description('Airbyte local CLI')
  .version('1.0.0')
  .allowUnknownOption(true) // TODO: Handle unknown options with errors
  // for testing purposes
  .option('--test-docker', 'Test spinning up a docker container')
  // for customizing output config file location
  .option('--output-config <path>', 'The location to output the config to a file')
  .requiredOption('--src <image>', 'Airbyte source Docker image')
  .requiredOption('--dst <image>', 'Airbyte destination Docker image')
  .option('--src.<key> <value>', 'Add "key": "value" into the source config')
  .option('--dst.<key> <value>', 'Add "key": "value" into the destination config')
  .option('--check-connection', 'Validate the Airbyte source connection')
  .option('--full-refresh', 'Force full_refresh and overwrite mode')
  .option('--state <path>', 'Override state file path for incremental sync')
  .option('--src-output-file <path>', 'Write source output as a file (requires a destination)')
  .option('--src-catalog-overrides <json>', 'JSON string of sync mode overrides')
  .option('--src-catalog-file <path>', 'Source catalog file path')
  .option('--src-catalog-json <json>', 'Source catalog as a JSON string')
  .option('--dst-catalog-file <path>', 'Destination catalog file path')
  .option('--dst-catalog-json <json>', 'Destination catalog as a JSON string')
  .option('--dst-stream-prefix <prefix>', 'Destination stream prefix')
  .option('--dst-use-host-network', 'Use the host network when running the Airbyte destination')
  .option('--no-src-pull', 'Skip pulling Airbyte source image')
  .option('--no-dst-pull', 'Skip pulling Airbyte destination image')
  .option('--src-wizard', 'Run the Airbyte source configuration wizard')
  .option('--dst-wizard', 'Run the Airbyte destination configuration wizard')
  .option('--src-only', 'Only run the Airbyte source')
  .option('--dst-only <file>', 'Use a file for destination input instead of a source')
  .option('--connection-name <name>', 'Connection name used in various places')
  .option('--keep-containers', 'Do not remove source and destination containers after they exit')
  .option('--log-level <level>', 'Set level of source and destination loggers')
  .option('--raw-messages', 'Output raw Airbyte messages')
  .option('--max-log-size <size>', 'Set Docker maximum log size')
  .option('--max-mem <mem>', 'Set maximum amount of memory each Docker or Kubernetes container can use')
  .option('--max-cpus <cpus>', 'Set maximum CPUs each Docker or Kubernetes container can use')
  .option('--src-docker-options <string>', 'Set additional options to pass to the "docker run <src>" command')
  .option('--dst-docker-options <string>', 'Set additional options to pass to the "docker run <dst>" command')
  .option('--debug', 'Enable debug logging')
  .action((options) => {
    const configKeyValues = parseKeyValue();
    options.srcConfig = configKeyValues.srcConfig;
    options.dstConfig = configKeyValues.dstConfig;
    config = options;
    console.log('Options:', options);
  });

/**
 * Parse the key-value pair
 * TODO: Parse out the nested key-value pairs
 */
function parseKeyValue() {
  const args = process.argv;
  const srcConfig: Record<string, string> = {};
  const dstConfig: Record<string, string> = {};

  args.forEach((arg, index) => {
    if (arg.startsWith('--src.')) {
      const key = arg.split('.')[1];
      const value = args[index + 1];
      if (key && value && !value.startsWith('--')) {
        srcConfig[key] = value;
      }
    } else if (arg.startsWith('--dst.')) {
      const key = arg.split('.')[1];
      const value = args[index + 1];
      if (key && value && !value.startsWith('--')) {
        dstConfig[key] = value;
      }
    }
  });
  console.log('Source Config:', srcConfig);
  console.log('Destination Config:', dstConfig);
  return {srcConfig, dstConfig};
}

/** Write the config to a json file */
function writeConfig() {
  const customPath = config.outputConfig ?? 'out/test_config.json';
  const file = join(process.cwd(), customPath);
  writeFileSync(file, JSON.stringify(config, null, 2));
}

/** Spin up a test docker container */
async function runTestContainer() {
  const src_docker_image = 'farosai/airbyte-faros-feeds-source';
  try {
    const container = await docker.createContainer({
      Image: src_docker_image,
      Entrypoint: ['/bin/sh', '-c'],
      Cmd: ['echo "Hello World" && sleep 10'],
    });
    console.info('Creating the docker container...');
    await container.start();
    console.info('Docker container is running...');
    await container.wait();
    console.info('Docker container is finished.');
    await container.remove();
    console.info('Docker container is removed.');
  } catch (error: any) {
    console.error(`Error spinning up the docker: ${error.message}`);
  }
}

async function main() {
  // parse the command line arguments
  program.parse();

  // write config to a json file
  writeConfig();

  // spin up a test docker container
  const options = program.opts();
  if (options['testDocker']) {
    await runTestContainer();
  }
}

main().catch((error) => {
  console.error('Error:', error);
});
