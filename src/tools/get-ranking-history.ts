import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildProvenance, normalise, withProvenance } from '../client.js';
import {
  HISTORY_LIMITATION,
  RANK_POINTS_DISCLAIMER,
} from '../client.js';
import type { HarpdProduct } from '../types.js';
import { BOARD_NAMES, boardPeriodSummary, loadBoards } from './boards.js';
import type { BoardSnapshot } from './boards.js';
import { MAX_PAGE_SIZE, errorResult, jsonResult, messageOf, notFoundResult } from './shared.js';

const MAX_TOP = 50;

export const getRankingHistoryInputSchema = z.object({
  productId: z.string().min(1).max(128).optional().describe('Harpd product id to locate across boards.'),
  productSlug: z.string().min(1).max(128).optional().describe('Harpd product slug to locate across boards.'),
  top: z
    .number()
    .int()
    .min(0)
    .max(MAX_TOP)
    .default(0)
    .describe(
      `Also return the top N rows of each board so boards can be compared side by side (0-${MAX_TOP}, default 0 = off).`,
    ),
  boards: z
    .array(z.enum(BOARD_NAMES))
    .min(1)
    .max(BOARD_NAMES.length)
    .default([...BOARD_NAMES])
    .describe('Which published boards to include. Defaults to all three.'),
});

type GetRankingHistoryInput = z.infer<typeof getRankingHistoryInputSchema>;

interface BoardPosition {
  board: string;
  dataset: string;
  datasetId: string;
  sourceUrl: string;
  updatedAt: string;
  periodKey: string;
  rank: number;
  rankPoints: number;
  verified: boolean;
}

function findProduct(products: HarpdProduct[], id?: string, slug?: string): HarpdProduct | undefined {
  if (id) {
    const wanted = normalise(id);
    const hit = products.find((product) => normalise(product.id) === wanted);
    if (hit) return hit;
  }
  if (slug) {
    const wanted = normalise(slug);
    const hit = products.find((product) => normalise(product.slug) === wanted);
    if (hit) return hit;
  }
  return undefined;
}

export function registerGetRankingHistory(server: McpServer): void {
  server.registerTool(
    'get_ranking_history',
    {
      title: 'Compare Harpd board snapshots (NOT a time series)',
      description:
        'Compare the three published Harpd Rank board snapshots (overall / monthly / weekly) for one product, or side by side at board level. ' +
        'HONEST SCOPE WARNING: this repository publishes three LIVE period-scoped snapshots, each covering its current window. It does NOT contain a multi-month historical time series, so this tool cannot and will not return month-over-month trends. It returns the periods the datasets really expose plus an explicit statement of the limitation. ' +
        'CRITICAL: rankPoints are promotional placement bought with Credits on Harpd Rank, NOT an editorial quality score. Movement between boards reflects promotional placement, not a change in product quality.',
      inputSchema: getRankingHistoryInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetRankingHistoryInput) => {
      try {
        const snapshots = await loadBoards(input.boards);
        const primary = snapshots[0]!;

        const boards = snapshots.map(boardPeriodSummary);
        const distinctPeriods = Array.from(
          new Set(
            snapshots
              .flatMap((snapshot) => [snapshot.periodKey, snapshot.monthKey, snapshot.weekKey])
              .filter((value): value is string => typeof value === 'string' && value.length > 0),
          ),
        );

        const granularity = {
          kind: 'period-scoped live board snapshots',
          snapshots: snapshots.length,
          boards: snapshots.map((snapshot) => snapshot.board),
          distinctPeriods,
          finest: 'week',
          coarsest: 'month',
          historicalTimeSeriesAvailable: false,
          explanation:
            'Each snapshot covers exactly one period window. There is no file in this repository that holds more than one period per board.',
        };

        const envelopeProvenance = await buildProvenance({
          key: primary.datasetKey,
          sourceUrl: primary.sourceUrl,
          updatedAt: primary.updatedAt,
        });

        const disclaimers = [
          RANK_POINTS_DISCLAIMER,
          HISTORY_LIMITATION,
          'Board-to-board differences are differences between period windows and promotional placement, not evidence of quality change.',
        ];

        /* ---- single product across boards ---- */
        if (input.productId || input.productSlug) {
          const positions: Array<{
            product: HarpdProduct;
            boards: Record<string, BoardPosition | null>;
            provenance: unknown;
          }> = [];
          const seen = new Set<string>();

          for (const snapshot of snapshots) {
            const product = findProduct(snapshot.products, input.productId, input.productSlug);
            if (!product || seen.has(product.id)) continue;
            seen.add(product.id);

            const wrapped = await withProvenance<HarpdProduct>(
              product,
              {
                key: snapshot.datasetKey,
                sourceUrl: snapshot.sourceUrl,
                updatedAt: snapshot.updatedAt,
                notes: [
                  'Position taken from the board snapshot for the period shown. It is not a trend data point.',
                ],
              },
              'product',
            );

            const boardMap: Record<string, BoardPosition | null> = {};
            for (const other of snapshots) {
              const inBoard = findProduct(other.products, product.id, product.slug);
              boardMap[other.board] = inBoard
                ? {
                    board: other.board,
                    dataset: other.dataset,
                    datasetId: other.datasetKey,
                    sourceUrl: other.sourceUrl,
                    updatedAt: other.updatedAt,
                    periodKey: other.periodKey,
                    rank: inBoard.rank,
                    rankPoints: inBoard.rankPoints,
                    verified: inBoard.verified,
                  }
                : null;
            }

            positions.push({ product, boards: boardMap, provenance: wrapped.provenance });
          }

          if (positions.length === 0) {
            return notFoundResult({
              tool: 'get_ranking_history',
              message:
                'That product is not present on any of the requested Harpd Rank boards, so there is no position to report. No history is inferred.',
              selector: { productId: input.productId ?? null, productSlug: input.productSlug ?? null },
              boards,
              granularity,
              limitation: HISTORY_LIMITATION,
              provenance: envelopeProvenance,
            });
          }

          return jsonResult({
            tool: 'get_ranking_history',
            found: true,
            query: {
              productId: input.productId ?? null,
              productSlug: input.productSlug ?? null,
              boards: input.boards,
              top: input.top,
            },
            granularity,
            limitation: HISTORY_LIMITATION,
            boards,
            positions,
            rankPointsDisclaimer: RANK_POINTS_DISCLAIMER,
            provenance: envelopeProvenance,
            disclaimers,
          });
        }

        /* ---- board-level comparison ---- */
        const topByBoard: Record<string, unknown> = {};
        if (input.top > 0) {
          for (const snapshot of snapshots) {
            const slice = [...snapshot.products]
              .sort((a, b) => a.rank - b.rank)
              .slice(0, Math.min(input.top, MAX_PAGE_SIZE));
            topByBoard[snapshot.board] = await Promise.all(
              slice.map((product) =>
                withProvenance<HarpdProduct>(
                  product,
                  { key: snapshot.datasetKey, sourceUrl: snapshot.sourceUrl, updatedAt: snapshot.updatedAt },
                  'product',
                ),
              ),
            );
          }
        }

        return jsonResult({
          tool: 'get_ranking_history',
          found: true,
          query: { boards: input.boards, top: input.top },
          granularity,
          limitation: HISTORY_LIMITATION,
          boards,
          topByBoard,
          rankPointsDisclaimer: RANK_POINTS_DISCLAIMER,
          provenance: envelopeProvenance,
          disclaimers,
          hint:
            input.top === 0
              ? 'Pass productId or productSlug to compare one product across boards, or top > 0 to compare the head of each board.'
              : null,
        });
      } catch (error) {
        return errorResult(`get_ranking_history failed: ${messageOf(error)}`, {
          tool: 'get_ranking_history',
        });
      }
    },
  );
}

export type { BoardSnapshot };
