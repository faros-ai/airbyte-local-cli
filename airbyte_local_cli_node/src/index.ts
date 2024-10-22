import {Command} from 'commander';

const program = new Command();

program
  .name('airbyte-local.sh')
  .description('Airbyte local CLI')
  .version('1.0.0')
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
  .option('--debug', 'Enable debug logging');

program.parse(process.argv);

const options = program.opts();
console.log('Options:', options);
