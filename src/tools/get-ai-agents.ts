import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadAgentsIndex } from '../client.js';
import { registerDiscoveryTool } from './discovery-index.js';

export function registerGetAiAgents(server: McpServer): void {
  registerDiscoveryTool(server, {
    toolName: 'get_ai_agents',
    title: 'Get AI agents from the Harpd Discovery Index',
    slice:
      'Return AI-agent products from the Harpd AI Agent Index (334 records, Discovery Index slice where category = "agents").',
    datasetKey: 'ai-agent-index',
    loader: loadAgentsIndex,
    extraDescription:
      'Use this to find AI agent products, their domains, one-line titles and where they were discovered. Some records also appear on the Harpd Rank board (on_rank_board).',
  });
}
