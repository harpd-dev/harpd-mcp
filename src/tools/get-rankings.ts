import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildProvenance, normalise, paginate, withProductProvenance } from '../client.js';
import type { HarpdProduct } from '../types.js';
import { BOARD_NAMES, boardPeriodSummary, loadBoard } from './boards.js';
import {
  MAX_PAGE_SIZE,
  envelope,
  errorResult,
  jsonResult,
  limitField,
  messageOf,
  offsetField,
  productSortField,
  rankDisclaimers,
} from './shared.js';

export const getRankingsInputSchema = z.object({
  board: z
    .enum(BOARD_NAMES)
    .default('overall')
    .describe(
      'Which published Harpd Rank board to read: "overall" (all-time board, scoped to the current month), "monthly" (current-month window) or "weekly" (current-week window).',
    ),
  category: z.string().min(1).max(64).optional().describe('Restrict to one exact Harpd category slug.'),
  sort: productSortField,
  limit: limitField,
  offset: offsetField,
});

type GetRankingsInput = z.infer<typeof getRankingsInputSchema>;

export function registerGetRankings(server: McpServer): void {
  server.registerTool(
    'get_rankings',
    {
      title: 'Get a Harpd Rank board',
      description:
        'Read one of the three published Harpd Rank boards (overall / monthly / weekly) with its period metadata. ' +
        'CRITICAL: rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score, and a higher rankPoints value does NOT mean a better product. ' +
        'Ordering by "rankPoints" orders by promotional placement. Ordering by "rank" follows the published board position, which is also derived from promotional placement. ' +
        'The board is a live snapshot for its period, not a historical time series. Every record carries full provenance.',
      inputSchema: getRankingsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetRankingsInput) => {
      try {
        const snapshot = await loadBoard(input.board);
        let items: HarpdProduct[] = snapshot.products;

        if (input.category) {
          const wanted = normalise(input.category);
          items = items.filter((product) => product.category?.toLowerCase() === wanted);
        }

        const sorted = [...items].sort((a, b) => {
          if (input.sort === 'rankPoints') {
            return b.rankPoints - a.rankPoints || a.name.localeCompare(b.name);
          }
          if (input.sort === 'name') return a.name.localeCompare(b.name);
          return a.rank - b.rank || a.name.localeCompare(b.name);
        });

        const page = paginate(sorted, input.offset, input.limit);
        const results = await Promise.all(
          page.items.map((product) =>
            withProductProvenance(product, {
              key: snapshot.datasetKey,
              sourceUrl: snapshot.sourceUrl,
              updatedAt: snapshot.updatedAt,
            }),
          ),
        );

        return jsonResult(
          envelope({
            tool: 'get_rankings',
            query: {
              board: input.board,
              category: input.category ?? null,
              sort: input.sort,
            },
            pagination: page.pagination,
            provenance: await buildProvenance({
              key: snapshot.datasetKey,
              sourceUrl: snapshot.sourceUrl,
              updatedAt: snapshot.updatedAt,
            }),
            results,
            disclaimers: [
              ...rankDisclaimers(true),
              ...(input.sort === 'rankPoints'
                ? ['This result set is ordered by rankPoints, i.e. by promotional placement, not by quality.']
                : []),
              `This board is a live snapshot scoped to ${snapshot.periodKey || 'its published period'}, not a historical time series.`,
              `Page size is capped at ${MAX_PAGE_SIZE} records.`,
            ],
            extra: { board: boardPeriodSummary(snapshot) },
          }),
        );
      } catch (error) {
        return errorResult(`get_rankings failed: ${messageOf(error)}`, { tool: 'get_rankings' });
      }
    },
  );
}
