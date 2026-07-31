import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SumoClient } from '../sumo/client.js';
import { auditLog } from '../logging.js';

export function registerGetSearchStatusTool(
  server: McpServer,
  sumoClient: SumoClient,
): void {
  server.registerTool(
    'sumo_get_search_status',
    {
      title: 'Get Search Job Status',
      description:
        'Get the current status of a Sumo Logic search job started by this MCP server process.',
      inputSchema: {
        jobId: z
          .string()
          .min(1)
          .describe('The search job ID (returned by previous search operations)'),
      },
    },
    async (inputs) => {
      const startMs = Date.now();

      if (!sumoClient.isOwnedJob(inputs.jobId)) {
        const elapsedMs = Date.now() - startMs;
        auditLog({
          tool: 'sumo_get_search_status',
          elapsedMs,
          outcome: 'error',
          error: 'Job ID not in registry',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Job ID "${inputs.jobId}" not found in this session's registry. Only jobs created by this server process can be queried.`,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const status = await sumoClient.getJobStatus(inputs.jobId);
        const elapsedMs = Date.now() - startMs;

        const response = {
          jobId: inputs.jobId,
          state: status.state,
          messageCount: status.messageCount,
          recordCount: status.recordCount,
          pendingWarnings: status.pendingWarnings,
          pendingErrors: status.pendingErrors,
          elapsedMs,
        };

        auditLog({
          tool: 'sumo_get_search_status',
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
          tool: 'sumo_get_search_status',
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
