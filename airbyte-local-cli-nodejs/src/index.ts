import {parseAndValidateInputs} from './command';
import {AirbyteCliContext} from './types';
import {checkDockerInstalled, cleanUp, createTmpDir, loadStateFile, logger} from './utils';

let context: AirbyteCliContext;

async function main() {
  const cfg = await parseAndValidateInputs(process.argv);
  await checkDockerInstalled();
  context.tmpDir = createTmpDir();
  const stateFilePath = await loadStateFile(context.tmpDir, cfg.stateFile, cfg.connectionName);
}

main().catch((error) => {
  logger.error(error.message, 'Error');
  cleanUp(context);
  process.exit(1);
});
