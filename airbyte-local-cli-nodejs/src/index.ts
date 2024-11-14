import {parseAndValidateInputs} from './command';
import {checkDockerInstalled, logger} from './utils';

async function main() {
  await parseAndValidateInputs(process.argv);
  checkDockerInstalled();
}

main().catch((error) => {
  logger.error(error.message, 'Error');
  process.exit(1);
});
