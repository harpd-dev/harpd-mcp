import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadAiToolsIndex } from '../client.js';
import { registerDiscoveryTool } from './discovery-index.js';

export function registerGetAiTools(server: McpServer): void {
  registerDiscoveryTool(server, {
    toolName: 'get_ai_tools',
    title: 'Get AI tools from the Harpd Discovery Index',
    slice:
      'Return AI tooling products from the Harpd AI Tools Index (693 records, Discovery Index slice where category is "agents" or "ai-media").',
    datasetKey: 'ai-tools-index',
    loader: loadAiToolsIndex,
    extraDescription:
      'Use this to retrieve the current AI tools dataset: name, domain, URL, category, title, description, discovery source and observation timestamp.',
  });
}
