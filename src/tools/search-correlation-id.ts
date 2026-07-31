import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SumoClient } from '../sumo/client.js';
import type { Config } from '../config.js';
import { executeSearch } from '../sumo/search-jobs.js';
import { buildCorrelationIdQuery } from '../query/builders.js';
import { clampResultLimit } from '../security/limits.js';
import { auditLog } from '../logging.js';
import type { SumoMessage } from '../sumo/types.js';

interface NormalizedMessage {
  timestamp: string | null;
  raw: string | null;
  sourceCategory: string | null;
  sourceName: string | null;
  sourceHost: string | null;
  fields: Record<string, string>;
}

function normalizeMessage(msg: SumoMessage): NormalizedMessage {
  const { map } = msg;
  const skipFields = new Set([
    '_messagetime', '_raw', '_sourceCategory', '_sourceName', '_sourceHost',
    '_collector', '_messageid', '_sourceid', '_collectorId', '_blockid',
    '_format', '_size', '_receipttime', '_messagecount', '_source',
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
    sourceName: map._sourceName ?? null,
    sourceHost: map._sourceHost ?? null,
    fields,
  };
}

export function registerSearchCorrelationIdTool(
  server: McpServer,
  sumoClient: SumoClient,
  config: Config,
): void {
  server.registerTool(
    'sumo_search_correlation_id',
    {
      title: 'Search by Correlation ID',
      description:
        'Search for a trace ID, request ID, correlation ID, transaction ID, or similar identifier across logs. The ID is safely escaped as a literal search term.',
      inputSchema: {
        correlationId: z
          .string()
          .min(1)
          .describe('The correlation/trace/request ID to search for'),
        sourceCategory: z
          .string()
          .optional()
          .describe('Source category to search (uses default if omitted)'),
        lastMinutes: z
          .number()
          .int()
          .positive()
          .default(60)
          .describe('Search the last N minutes (default: 60)'),
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

        const query = buildCorrelationIdQuery({
          correlationId: inputs.correlationId,
          sourceCategory,
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
            includeRecords: false,
            maxResults: effectiveLimit,
            timeoutMs: config.sumoQueryTimeoutSeconds * 1000,
          },
        );

        const elapsedMs = Date.now() - startMs;

        // Messages from Sumo are ordered by latest _messageTime by default;
        // reverse to show chronological order for trace reconstruction
        const normalizedMessages = result.messages.map(normalizeMessage).reverse();

        const response = {
          summary: `Found ${result.messageCount} events for correlation ID "${inputs.correlationId}" in the last ${inputs.lastMinutes} minutes`,
          generatedQuery: query,
          correlationId: inputs.correlationId,
          timeRange: {
            start: startTime.toISOString(),
            end: endTime.toISOString(),
          },
          status: result.status,
          counts: { messages: result.messageCount },
          truncated: result.truncated,
          messages: normalizedMessages,
          warnings: result.warnings,
          elapsedMs,
        };

        auditLog({
          tool: 'sumo_search_correlation_id',
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
          tool: 'sumo_search_correlation_id',
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
