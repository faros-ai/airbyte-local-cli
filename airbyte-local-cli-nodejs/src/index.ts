import {parseAndValidateInputs} from './command';
import {logger} from './utils';

async function main() {
  logger.debug('Starting Airbyte Local CLI...');
  await parseAndValidateInputs(process.argv);
}

main().catch((error) => {
  logger.error(error.message, 'Error');
  process.exit(1);
});
