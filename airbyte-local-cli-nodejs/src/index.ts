import {parseAndValidateInputs} from './command';
import {checkDockerInstalled, pullDockerImage, runCheckSrcConnection, runDstSync, runSrcSync} from './docker';
import {logger} from './logger';
import {AirbyteCliContext, ImageType} from './types';
import {
  cleanUp,
  createTmpDir,
  generateConfig,
  generateDstStreamPrefix,
  loadStateFile,
  logImageVersion,
  processSrcInputFile,
  setupStreams,
  writeCatalog,
  writeConfig,
} from './utils';

const ctx: AirbyteCliContext = {};

// Handle `Ctrl+C` (SIGINT) and `SIGTERM`
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    logger.info(`Received ${signal}. Cleaning up...`);
    void cleanUp(ctx).finally(() => {
      logger.info('Exit Airbyte CLI.');
      process.exit(1);
    });
  });
});

export async function main(): Promise<void> {
  try {
    // Parse and validate cli arguments
    const cfg = parseAndValidateInputs(process.argv);

    // Prerequisites check: docker
    await checkDockerInstalled();

    // Create temporary directory
    const tmpDir = createTmpDir();
    ctx.tmpDir = tmpDir;

    // Run generate config
    if (cfg.generateConfig) {
      await generateConfig(tmpDir, cfg);
      return;
    }

    // Generate dst stream prefix and load state file
    generateDstStreamPrefix(cfg);
    cfg.stateFile = loadStateFile(tmpDir, cfg?.stateFile, cfg?.connectionName);

    // Pull source docker image
    if (cfg.srcPull && cfg.src?.image) {
      await pullDockerImage(cfg.src.image);
    }
    // Pull destination docker image
    if (cfg.dstPull && cfg.dst?.image) {
      await pullDockerImage(cfg.dst.image);
    }

    // Write config and catalog to files
    writeConfig(tmpDir, cfg);
    await writeCatalog(tmpDir, cfg);

    // Check source connection
    if (cfg.srcCheckConnection && cfg.src?.image) {
      await runCheckSrcConnection(tmpDir, cfg.src.image);
    }

    // Run airbyte source connector
    // Run both src and dst
    if (!cfg.srcInputFile && !cfg.srcOutputFile) {
      await logImageVersion(ImageType.SRC, cfg.src?.image);
      await logImageVersion(ImageType.DST, cfg.dst?.image);

      // Set up writing stream between source and destination
      const streams = setupStreams();

      // run connectors in parallel
      const srcSyncPromise = runSrcSync(tmpDir, cfg, streams?.srcOutputStream);
      const dstSyncPromise = runDstSync(tmpDir, cfg, streams?.passThrough);
      await Promise.all([srcSyncPromise, dstSyncPromise]);
    }
    // If srcOutputFile is provided, run src only
    else if (cfg.srcOutputFile) {
      await logImageVersion(ImageType.SRC, cfg.src?.image);
      await runSrcSync(tmpDir, cfg);
    }
    // If srcInputFile is provided, run dst only
    else if (cfg.srcInputFile) {
      await processSrcInputFile(tmpDir, cfg);
      await logImageVersion(ImageType.DST, cfg.dst?.image);
      await runDstSync(tmpDir, cfg);
    }

    logger.info('Airbyte CLI completed.');
  } catch (error: any) {
    logger.error(error.message, 'Error');
    throw error;
  } finally {
    await cleanUp(ctx);
  }
}

main().catch((_error) => {
  logger.error('Exit Airbyte CLI with errors.');
  process.exit(1);
});
