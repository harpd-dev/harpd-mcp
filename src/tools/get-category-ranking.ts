import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  buildProvenance,
  loadCategories,
  loadProducts,
  normalise,
  paginate,
  withProductProvenance,
  withProvenance,
} from '../client.js';
import type { CategoryBoard, HarpdProduct } from '../types.js';
import {
  MAX_PAGE_SIZE,
  envelope,
  errorResult,
  jsonResult,
  limitField,
  messageOf,
  notFoundResult,
  offsetField,
  productSortField,
  rankDisclaimers,
} from './shared.js';

export const getCategoryRankingInputSchema = z.object({
  category: z
    .string()
    .min(1)
    .max(64)
    .describe(
      'Harpd category slug, e.g. "developer", "agents", "ai-media", "seo". Must be one of the 28 published category boards.',
    ),
  sort: productSortField,
  limit: limitField,
  offset: offsetField,
});

type GetCategoryRankingInput = z.infer<typeof getCategoryRankingInputSchema>;

export function registerGetCategoryRanking(server: McpServer): void {
  server.registerTool(
    'get_category_ranking',
    {
      title: 'Get a Harpd category board',
      description:
        'Read one of the 28 published Harpd Rank category boards: the board metadata (product counts, state, board URL) plus the products listed in that category. ' +
        'CRITICAL: rankPoints are promotional placement bought with Credits on Harpd Rank, NOT an editorial quality score. ' +
        'A category board being "topRankOpen" or a product having high rankPoints says nothing about product quality. ' +
        'An unknown category returns a structured found:false result listing the valid slugs, not an error. ' +
        'Every record carries full provenance.',
      inputSchema: getCategoryRankingInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetCategoryRankingInput) => {
      try {
        const wanted = normalise(input.category);
        const [categoriesResult, productsResult] = await Promise.all([loadCategories(), loadProducts()]);

        const categoriesData = categoriesResult.data;
        const productsData = productsResult.data;
        const boards: CategoryBoard[] = Array.isArray(categoriesData.categories)
          ? categoriesData.categories
          : [];

        const board = boards.find(
          (entry) => normalise(entry.slug) === wanted || normalise(entry.name) === wanted,
        );

        if (!board) {
          return notFoundResult({
            tool: 'get_category_ranking',
            message: `"${input.category}" is not one of the published Harpd category boards.`,
            availableCategories: boards.map((entry) => ({
              slug: entry.slug,
              name: entry.name,
              url: entry.url,
              productCount: entry.productCount,
            })),
            provenance: await buildProvenance({
              key: 'categories',
              sourceUrl: categoriesResult.sourceUrl,
              updatedAt: categoriesData.lastUpdated ?? categoriesData.generatedAt ?? '',
            }),
            hint: 'Call get_category_ranking again with one of the slugs in availableCategories.',
          });
        }

        const categoryUpdatedAt = categoriesData.lastUpdated ?? categoriesData.generatedAt ?? '';
        const boardWrapped = await withProvenance<CategoryBoard>(
          board,
          { key: 'categories', sourceUrl: categoriesResult.sourceUrl, updatedAt: categoryUpdatedAt },
          'entity',
        );

        const productsUpdatedAt = productsData.lastUpdated ?? productsData.generatedAt ?? '';
        const inCategory: HarpdProduct[] = (Array.isArray(productsData.products)
          ? productsData.products
          : []
        ).filter((product) => normalise(product.category) === normalise(board.slug));

        const sorted = [...inCategory].sort((a, b) => {
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
              key: 'products',
              sourceUrl: productsResult.sourceUrl,
              updatedAt: productsUpdatedAt,
            }),
          ),
        );

        return jsonResult({
          ...envelope({
            tool: 'get_category_ranking',
            query: { category: board.slug, sort: input.sort },
            pagination: page.pagination,
            provenance: await buildProvenance({
              key: 'products',
              sourceUrl: productsResult.sourceUrl,
              updatedAt: productsUpdatedAt,
            }),
            results,
            disclaimers: [
              ...rankDisclaimers(true),
              ...(input.sort === 'rankPoints'
                ? ['This result set is ordered by rankPoints, i.e. by promotional placement, not by quality.']
                : []),
              `Page size is capped at ${MAX_PAGE_SIZE} records.`,
            ],
            extra: {
              category: boardWrapped.entity,
              categoryProvenance: boardWrapped.provenance,
              categoryStats: {
                productCount: board.productCount,
                rankedProductCount: board.rankedProductCount,
                totalRankPoints: board.totalRankPoints,
                state: board.state,
                topRankOpen: board.topRankOpen,
                boardUrl: board.url,
              },
            },
          }),
        });
      } catch (error) {
        return errorResult(`get_category_ranking failed: ${messageOf(error)}`, {
          tool: 'get_category_ranking',
        });
      }
    },
  );
}
