import {parseAndValidateInputs} from './command';
import {AirbyteCliContext} from './types';
import {checkDockerInstalled, cleanUp, createTmpDir, loadStateFile, logger, writeConfig} from './utils';

function main() {
  const context: AirbyteCliContext = {};
  try {
    const cfg = parseAndValidateInputs(process.argv);
    checkDockerInstalled();
    context.tmpDir = createTmpDir();
    loadStateFile(context.tmpDir, cfg?.stateFile, cfg?.connectionName);
    writeConfig(context.tmpDir, cfg);
  } catch (error: any) {
    logger.error(error.message, 'Error');
    cleanUp(context);
    logger.error('Exit Airbyte CLI with errors.');
    process.exit(1);
  }
}

main();
