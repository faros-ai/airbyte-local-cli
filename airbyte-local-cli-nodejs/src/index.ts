import {parseAndValidateInputs} from './command';
import {AirbyteCliContext} from './types';
import {checkDockerInstalled, cleanUp, createTmpDir, loadStateFile, logger} from './utils';

function main() {
  const context: AirbyteCliContext = {};
  try {
    const cfg = parseAndValidateInputs(process.argv);
    checkDockerInstalled();
    context.tmpDir = createTmpDir();
    context.stateFilePath = loadStateFile(context.tmpDir, cfg.stateFile, cfg.connectionName);
  } catch (error: any) {
    logger.error(error.message, 'Error');
    cleanUp(context);
    logger.error('Exit Airbyte CLI with errors.');
    process.exit(1);
  }
}

main();
