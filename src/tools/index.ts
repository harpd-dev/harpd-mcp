import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerGetAiAgents } from './get-ai-agents.js';
import { registerGetAiTools } from './get-ai-tools.js';
import { registerGetCategoryRanking } from './get-category-ranking.js';
import { registerGetDeveloperTools } from './get-developer-tools.js';
import { registerGetEvidence } from './get-evidence.js';
import { registerGetProduct } from './get-product.js';
import { registerGetProducts } from './get-products.js';
import { registerGetRankingHistory } from './get-ranking-history.js';
import { registerGetRankings } from './get-rankings.js';
import { registerGetResearch } from './get-research.js';
import { registerSearchProducts } from './search-products.js';

/** The 11 tool names this server exposes, in registration order. */
export const TOOL_NAMES = [
  'search_products',
  'get_product',
  'get_products',
  'get_rankings',
  'get_category_ranking',
  'get_ranking_history',
  'get_ai_agents',
  'get_ai_tools',
  'get_developer_tools',
  'get_research',
  'get_evidence',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Register all Harpd tools on an existing server instance. */
export function registerTools(server: McpServer): void {
  registerSearchProducts(server);
  registerGetProduct(server);
  registerGetProducts(server);
  registerGetRankings(server);
  registerGetCategoryRanking(server);
  registerGetRankingHistory(server);
  registerGetAiAgents(server);
  registerGetAiTools(server);
  registerGetDeveloperTools(server);
  registerGetResearch(server);
  registerGetEvidence(server);
}
