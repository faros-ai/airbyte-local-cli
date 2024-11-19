import {parseAndValidateInputs} from './command';
import {checkDockerInstalled, logger, writeConfig} from './utils';

async function main() {
  const config = await parseAndValidateInputs(process.argv);
  checkDockerInstalled();
  writeConfig('<tmpDir_placeholder>', config);
}

main().catch((error) => {
  logger.error(error.message, 'Error');
  process.exit(1);
});
