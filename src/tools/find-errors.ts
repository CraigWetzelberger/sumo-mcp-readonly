import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SumoClient } from '../sumo/client.js';
import type { Config } from '../config.js';
import { executeSearch } from '../sumo/search-jobs.js';
import { buildErrorQuery } from '../query/builders.js';
import { clampResultLimit } from '../security/limits.js';
import { auditLog } from '../logging.js';
import type { SumoMessage } from '../sumo/types.js';

interface NormalizedMessage {
  timestamp: string | null;
  raw: string | null;
  sourceCategory: string | null;
  sourceHost: string | null;
  fields: Record<string, string>;
}

function normalizeMessage(msg: SumoMessage): NormalizedMessage {
  const { map } = msg;
  const skipFields = new Set([
    '_messagetime', '_raw', '_sourceCategory', '_sourceHost',
    '_sourceName', '_collector', '_messageid', '_sourceid',
    '_collectorId', '_blockid', '_format', '_size',
    '_receipttime', '_messagecount', '_source',
  ]);

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (!skipFields.has(key)) {
      fields[key] = value;
    }
  }

  return {
    timestamp: map._messagetime
      ? new Date(Number(map._messagetime)).toISOString()
      : null,
    raw: map._raw ?? null,
    sourceCategory: map._sourceCategory ?? null,
    sourceHost: map._sourceHost ?? null,
    fields,
  };
}

export function registerFindErrorsTool(
  server: McpServer,
  sumoClient: SumoClient,
  config: Config,
): void {
  server.registerTool(
    'sumo_find_errors',
    {
      title: 'Find Errors in Sumo Logic',
      description:
        'Search for recent errors using an opinionated query that looks for ERROR, exception, failure, fatal, and stack traces.',
      inputSchema: {
        sourceCategory: z
          .string()
          .optional()
          .describe('Source category to search (uses default if omitted)'),
        service: z
          .string()
          .optional()
          .describe('Service name to filter by'),
        lastMinutes: z
          .number()
          .int()
          .positive()
          .default(30)
          .describe('Search the last N minutes (default: 30)'),
        text: z
          .string()
          .optional()
          .describe('Additional text to filter for'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of results'),
      },
    },
    async (inputs) => {
      const startMs = Date.now();
      try {
        const sourceCategory =
          inputs.sourceCategory ?? config.sumoDefaultSourceCategory ?? undefined;

        const query = buildErrorQuery({
          sourceCategory,
          service: inputs.service,
          text: inputs.text,
        });

        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - inputs.lastMinutes * 60 * 1000);
        const effectiveLimit = clampResultLimit(inputs.limit, config.sumoMaxResultCount);

        const result = await executeSearch(
          sumoClient,
          {
            query,
            from: String(startTime.getTime()),
            to: String(endTime.getTime()),
            timeZone: 'UTC',
          },
          {
            includeMessages: true,
            includeRecords: true,
            maxResults: effectiveLimit,
            timeoutMs: config.sumoQueryTimeoutSeconds * 1000,
          },
        );

        const elapsedMs = Date.now() - startMs;

        const response = {
          summary: `Found ${result.messageCount} error events in the last ${inputs.lastMinutes} minutes`,
          generatedQuery: query,
          timeRange: {
            start: startTime.toISOString(),
            end: endTime.toISOString(),
          },
          status: result.status,
          counts: {
            messages: result.messageCount,
            records: result.recordCount,
          },
          truncated: result.truncated,
          messages: result.messages.map(normalizeMessage),
          records: result.records.map((r) => r.map),
          warnings: result.warnings,
          elapsedMs,
        };

        auditLog({
          tool: 'sumo_find_errors',
          query,
          timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
          resultCount: result.messageCount,
          elapsedMs,
          outcome: 'success',
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        const elapsedMs = Date.now() - startMs;
        const errorMessage = err instanceof Error ? err.message : String(err);

        auditLog({
          tool: 'sumo_find_errors',
          elapsedMs,
          outcome: 'error',
          error: errorMessage,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
          isError: true,
        };
      }
    },
  );
}
