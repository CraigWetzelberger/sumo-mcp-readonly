import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import { SumoClient } from './sumo/client.js';
import { registerSearchLogsTool } from './tools/search-logs.js';
import { registerFindErrorsTool } from './tools/find-errors.js';
import { registerSearchCorrelationIdTool } from './tools/search-correlation-id.js';
import { registerGetSearchStatusTool } from './tools/get-search-status.js';
import { registerCancelSearchTool } from './tools/cancel-search.js';

export interface ServerComponents {
  server: McpServer;
  sumoClient: SumoClient;
}

export function createServer(config: Config): ServerComponents {
  const server = new McpServer({
    name: 'sumo-mcp',
    version: '1.0.0',
  });

  const sumoClient = new SumoClient({
    baseUrl: config.sumoApiBaseUrl,
    accessId: config.sumoAccessId,
    accessKey: config.sumoAccessKey,
    timeoutSeconds: config.sumoQueryTimeoutSeconds,
    maxResults: config.sumoMaxResultCount,
  });

  // Register all tools
  registerSearchLogsTool(server, sumoClient, config);
  registerFindErrorsTool(server, sumoClient, config);
  registerSearchCorrelationIdTool(server, sumoClient, config);
  registerGetSearchStatusTool(server, sumoClient);
  registerCancelSearchTool(server, sumoClient);

  return { server, sumoClient };
}
