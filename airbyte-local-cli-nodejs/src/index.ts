import {parseAndValidateInputs} from './command';
import {checkDockerInstalled, checkSrcConnection, pullDockerImage, runSrcSync} from './docker';
import {AirbyteCliContext} from './types';
import {cleanUp, createTmpDir, loadStateFile, logger, writeConfig} from './utils';

async function main(): Promise<void> {
  const context: AirbyteCliContext = {};
  try {
    // Parse and validate cli arguments
    const cfg = parseAndValidateInputs(process.argv);
    await checkDockerInstalled();

    // Create temporary directory, load state file, write config to files
    context.tmpDir = createTmpDir();
    loadStateFile(context.tmpDir, cfg?.stateFile, cfg?.connectionName);
    writeConfig(context.tmpDir, cfg);

    // Pull source docker image
    if (cfg.srcPull && cfg.src?.image) {
      await pullDockerImage(cfg.src.image);
    }
    // Check source connection
    if (cfg.srcCheckConnection && cfg.src?.image) {
      await checkSrcConnection(context.tmpDir, cfg.src.image);
    }
    // Run airbyte source connector
    if (!cfg.srcInputFile) {
      await runSrcSync(context.tmpDir, cfg);
    }
  } catch (error: any) {
    logger.error(error.message, 'Error');
    cleanUp(context);
    throw error;
  }
}

main().catch((_error) => {
  logger.error('Exit Airbyte CLI with errors.');
  process.exit(1);
});
