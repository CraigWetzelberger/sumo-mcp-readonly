#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, ConfigError } from './config.js';
import { createServer } from './server.js';
import { setLogLevel, logger } from './logging.js';

async function main(): Promise<void> {
  // Load and validate configuration
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`\nConfiguration Error:\n${err.message}\n\n`);
      process.stderr.write(
        'Ensure all required environment variables are set. See .env.example for reference.\n\n',
      );
    } else {
      process.stderr.write(
        `Unexpected error during configuration: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    process.exit(1);
  }

  // Configure logging
  setLogLevel(config.logLevel);
  logger.info('Starting sumo-mcp server', {
    apiBaseUrl: config.sumoApiBaseUrl,
    maxQueryRangeMinutes: config.sumoMaxQueryRangeMinutes,
    maxResultCount: config.sumoMaxResultCount,
    queryTimeoutSeconds: config.sumoQueryTimeoutSeconds,
  });

  // Create server with all tools
  const { server, sumoClient } = createServer(config);

  // Set up stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('sumo-mcp server connected via stdio transport');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down sumo-mcp server...');

    // Cancel all active jobs
    const activeJobs = sumoClient.getOwnedJobs();
    for (const jobId of activeJobs) {
      try {
        await sumoClient.deleteJob(jobId);
        logger.debug('Cancelled active job on shutdown', { jobId });
      } catch {
        // Best-effort cleanup
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
