import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SumoClient } from '../sumo/client.js';
import type { Config } from '../config.js';
import { executeSearch } from '../sumo/search-jobs.js';
import { enforceTimeRangeLimit, clampResultLimit } from '../security/limits.js';
import { auditLog } from '../logging.js';
import type { SumoMessage } from '../sumo/types.js';

export interface NormalizedMessage {
  timestamp: string | null;
  raw: string | null;
  sourceCategory: string | null;
  sourceName: string | null;
  sourceHost: string | null;
  collector: string | null;
  fields: Record<string, string>;
}

function normalizeMessage(msg: SumoMessage): NormalizedMessage {
  const { map } = msg;
  const knownFields = [
    '_messagetime',
    '_raw',
    '_sourceCategory',
    '_sourceName',
    '_sourceHost',
    '_collector',
    '_messageid',
    '_sourceid',
    '_collectorId',
    '_blockid',
    '_format',
    '_size',
    '_receipttime',
    '_messagecount',
    '_source',
  ];

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (!knownFields.includes(key)) {
      fields[key] = value;
    }
  }

  return {
    timestamp: map._messagetime
      ? new Date(Number(map._messagetime)).toISOString()
      : null,
    raw: map._raw ?? null,
    sourceCategory: map._sourceCategory ?? null,
    sourceName: map._sourceName ?? null,
    sourceHost: map._sourceHost ?? null,
    collector: map._collector ?? null,
    fields,
  };
}

export function registerSearchLogsTool(
  server: McpServer,
  sumoClient: SumoClient,
  config: Config,
): void {
  server.registerTool(
    'sumo_search_logs',
    {
      title: 'Sumo Logic Log Search',
      description:
        'Run a Sumo Logic log query. Provide either startTime+endTime or lastMinutes, but not both. Defaults to the last 15 minutes.',
      inputSchema: {
        query: z.string().describe('Sumo Logic search query'),
        startTime: z
          .string()
          .optional()
          .describe('Start time in ISO-8601 format (UTC)'),
        endTime: z
          .string()
          .optional()
          .describe('End time in ISO-8601 format (UTC)'),
        lastMinutes: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Search the last N minutes (alternative to startTime/endTime)'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum number of results to return'),
        includeMessages: z
          .boolean()
          .default(true)
          .describe('Include raw log messages in results'),
        includeRecords: z
          .boolean()
          .default(true)
          .describe('Include aggregate records in results'),
      },
    },
    async (inputs) => {
      const startMs = Date.now();
      try {
        // Validate time range params
        const hasAbsoluteTime = inputs.startTime !== undefined || inputs.endTime !== undefined;
        const hasRelativeTime = inputs.lastMinutes !== undefined;

        if (hasAbsoluteTime && hasRelativeTime) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error:
                    'Cannot specify both startTime/endTime and lastMinutes. Use one or the other.',
                }),
              },
            ],
            isError: true,
          };
        }

        if (hasAbsoluteTime && (!inputs.startTime || !inputs.endTime)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Both startTime and endTime must be provided together.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Calculate effective time range
        let startTime: Date;
        let endTime: Date;

        if (inputs.startTime && inputs.endTime) {
          startTime = new Date(inputs.startTime);
          endTime = new Date(inputs.endTime);

          if (isNaN(startTime.getTime())) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid startTime format. Use ISO-8601.' }) }],
              isError: true,
            };
          }
          if (isNaN(endTime.getTime())) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid endTime format. Use ISO-8601.' }) }],
              isError: true,
            };
          }
          if (startTime >= endTime) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'startTime must be before endTime.',
                  }),
                },
              ],
              isError: true,
            };
          }
        } else if (inputs.lastMinutes) {
          endTime = new Date();
          startTime = new Date(endTime.getTime() - inputs.lastMinutes * 60 * 1000);
        } else {
          // Default: last 15 minutes
          endTime = new Date();
          startTime = new Date(endTime.getTime() - 15 * 60 * 1000);
        }

        // Enforce time range limit
        try {
          enforceTimeRangeLimit(startTime, endTime, config.sumoMaxQueryRangeMinutes);
        } catch {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Time range exceeds the configured maximum of ${config.sumoMaxQueryRangeMinutes} minutes.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const effectiveLimit = clampResultLimit(inputs.limit, config.sumoMaxResultCount);

        // Execute the search
        const result = await executeSearch(
          sumoClient,
          {
            query: inputs.query,
            from: String(startTime.getTime()),
            to: String(endTime.getTime()),
            timeZone: 'UTC',
          },
          {
            includeMessages: inputs.includeMessages,
            includeRecords: inputs.includeRecords,
            maxResults: effectiveLimit,
            timeoutMs: config.sumoQueryTimeoutSeconds * 1000,
          },
        );

        const elapsedMs = Date.now() - startMs;
        const normalizedMessages = result.messages.map(normalizeMessage);

        const response = {
          summary: `Found ${result.messageCount} messages and ${result.recordCount} records in ${elapsedMs}ms`,
          query: inputs.query,
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
          ...(result.truncated && {
            truncationNote: `Results limited to ${effectiveLimit}. Full result set has ${Math.max(result.messageCount, result.recordCount)} items.`,
          }),
          messages: normalizedMessages,
          records: result.records.map((r) => r.map),
          warnings: result.warnings,
          elapsedMs,
        };

        auditLog({
          tool: 'sumo_search_logs',
          query: inputs.query,
          timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
          resultCount: result.messageCount + result.recordCount,
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
          tool: 'sumo_search_logs',
          query: inputs.query,
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
