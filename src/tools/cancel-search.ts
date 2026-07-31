import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SumoClient } from '../sumo/client.js';
import { auditLog } from '../logging.js';

export function registerCancelSearchTool(
  server: McpServer,
  sumoClient: SumoClient,
): void {
  server.registerTool(
    'sumo_cancel_search',
    {
      title: 'Cancel Search Job',
      description:
        'Cancel a running Sumo Logic search job started by this MCP server process.',
      inputSchema: {
        jobId: z
          .string()
          .min(1)
          .describe('The search job ID to cancel'),
      },
    },
    async (inputs) => {
      const startMs = Date.now();

      if (!sumoClient.isOwnedJob(inputs.jobId)) {
        const elapsedMs = Date.now() - startMs;
        auditLog({
          tool: 'sumo_cancel_search',
          elapsedMs,
          outcome: 'error',
          error: 'Job ID not in registry',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Job ID "${inputs.jobId}" not found in this session's registry. Only jobs created by this server process can be cancelled.`,
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        await sumoClient.deleteJob(inputs.jobId);
        const elapsedMs = Date.now() - startMs;

        auditLog({
          tool: 'sumo_cancel_search',
          elapsedMs,
          outcome: 'success',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                jobId: inputs.jobId,
                message: `Search job ${inputs.jobId} has been cancelled and removed from the registry.`,
              }),
            },
          ],
        };
      } catch (err) {
        const elapsedMs = Date.now() - startMs;
        const errorMessage = err instanceof Error ? err.message : String(err);

        auditLog({
          tool: 'sumo_cancel_search',
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
