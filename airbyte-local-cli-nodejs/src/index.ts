import {parseAndValidateInputs} from './command';
import {checkDockerInstalled, checkSrcConnection, pullDockerImage, runDstSync, runSrcSync} from './docker';
import {AirbyteCliContext} from './types';
import {
  cleanUp,
  createTmpDir,
  generateDstStreamPrefix,
  ImageType,
  loadStateFile,
  logger,
  logImageVersion,
  processSrcInputFile,
  writeCatalog,
  writeConfig,
} from './utils';

async function main(): Promise<void> {
  const context: AirbyteCliContext = {};
  try {
    // Parse and validate cli arguments
    const cfg = parseAndValidateInputs(process.argv);
    await checkDockerInstalled();

    // Create temporary directory, load state file, write config and catalog to files
    context.tmpDir = createTmpDir();
    generateDstStreamPrefix(cfg);
    cfg.stateFile = loadStateFile(context.tmpDir, cfg?.stateFile, cfg?.connectionName);

    // Pull source docker image
    if (cfg.srcPull && cfg.src?.image) {
      await pullDockerImage(cfg.src.image);
    }
    // Pull destination docker image
    if (cfg.dstPull && cfg.dst?.image) {
      await pullDockerImage(cfg.dst.image);
    }

    // Write config and catalog to files
    writeConfig(context.tmpDir, cfg);
    await writeCatalog(context.tmpDir, cfg);

    // Check source connection
    if (cfg.srcCheckConnection && cfg.src?.image) {
      await checkSrcConnection(context.tmpDir, cfg.src.image);
    }

    // Run airbyte source connector
    if (!cfg.srcInputFile) {
      await logImageVersion(ImageType.SRC, cfg.src?.image);
      await runSrcSync(context.tmpDir, cfg);
    } else {
      await processSrcInputFile(context.tmpDir, cfg);
    }

    // Run airbyte destination connector
    if (!cfg.srcOutputFile) {
      await logImageVersion(ImageType.DST, cfg.dst?.image);
      await runDstSync(context.tmpDir, cfg);
    }

    logger.info('Airbyte CLI completed.');
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
