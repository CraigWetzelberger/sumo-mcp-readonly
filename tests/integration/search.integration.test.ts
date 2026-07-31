/**
 * Integration test for Sumo Logic MCP server.
 *
 * This test ONLY runs when real Sumo Logic credentials are available
 * in the environment. It is excluded from the default test run.
 *
 * To run:
 *   SUMO_ACCESS_ID=... SUMO_ACCESS_KEY=... SUMO_API_BASE_URL=... npm run test:integration
 */
import { describe, it, expect } from 'vitest';
import { SumoClient } from '../../src/sumo/client.js';
import { executeSearch } from '../../src/sumo/search-jobs.js';
import { loadConfig } from '../../src/config.js';

const hasCredentials =
  process.env.SUMO_ACCESS_ID &&
  process.env.SUMO_ACCESS_KEY &&
  process.env.SUMO_API_BASE_URL;

describe.skipIf(!hasCredentials)('Integration: Sumo Logic Search Job API', () => {
  it('creates, polls, and retrieves results from a simple search', async () => {
    const config = loadConfig();
    const client = new SumoClient({
      baseUrl: config.sumoApiBaseUrl,
      accessId: config.sumoAccessId,
      accessKey: config.sumoAccessKey,
      timeoutSeconds: config.sumoQueryTimeoutSeconds,
      maxResults: config.sumoMaxResultCount,
    });

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 1 * 60 * 1000); // Last 1 minute

    const result = await executeSearch(
      client,
      {
        query: '* | count',
        from: startTime.toISOString(),
        to: endTime.toISOString(),
        timeZone: 'UTC',
      },
      {
        includeMessages: false,
        includeRecords: true,
        maxResults: 10,
        timeoutMs: 60000,
        pollIntervalMs: 2000,
      },
    );

    // Verify the search completed
    expect(result.status).toBe('DONE GATHERING RESULTS');
    expect(result.recordCount).toBeGreaterThanOrEqual(0);

    // Verify job was registered and cleaned up
    expect(result.jobId).toBeTruthy();
  }, 90000); // 90 second timeout for integration test
});
