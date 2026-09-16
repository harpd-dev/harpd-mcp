import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadDeveloperToolsIndex } from '../client.js';
import { registerDiscoveryTool } from './discovery-index.js';

export function registerGetDeveloperTools(server: McpServer): void {
  registerDiscoveryTool(server, {
    toolName: 'get_developer_tools',
    title: 'Get developer tools from the Harpd Discovery Index',
    slice:
      'Return developer-tool products from the Harpd Developer Tools Index (1,918 records, Discovery Index slice where category = "developer").',
    datasetKey: 'developer-tools-index',
    loader: loadDeveloperToolsIndex,
    extraDescription:
      'Use this to find developer tools, SDKs, infra and dev platforms by name, domain or description.',
  });
}
