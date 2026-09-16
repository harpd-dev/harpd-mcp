import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  buildProvenance,
  contains,
  loadProducts,
  normalise,
  paginate,
  withProductProvenance,
} from '../client.js';
import type { HarpdProduct } from '../types.js';
import {
  MAX_PAGE_SIZE,
  envelope,
  errorResult,
  jsonResult,
  limitField,
  messageOf,
  offsetField,
  rankDisclaimers,
} from './shared.js';

export const searchProductsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Free-text query matched against product name, slug, description, product type, website and category name.',
    ),
  category: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Exact Harpd category slug, e.g. "developer", "agents", "ai-media".'),
  verified: z.boolean().optional().describe('Filter by Harpd verification state.'),
  sort: z
    .enum(['relevance', 'rank', 'rankPoints', 'name'])
    .default('relevance')
    .describe(
      'Ordering. "rank" = board position ascending. "rankPoints" = descending by promotional placement bought with Credits, which is NOT a quality ordering. "relevance" only applies when `query` is set.',
    ),
  limit: limitField,
  offset: offsetField,
});

type SearchProductsInput = z.infer<typeof searchProductsInputSchema>;

function relevance(product: HarpdProduct, query: string): number {
  let score = 0;
  const name = product.name?.toLowerCase() ?? '';
  if (name === query) score += 100;
  if (name.startsWith(query)) score += 40;
  if (contains(product.name, query)) score += 50;
  if (contains(product.slug, query)) score += 20;
  if (contains(product.categoryName, query)) score += 15;
  if (contains(product.category, query)) score += 10;
  if (contains(product.productType, query)) score += 10;
  if (contains(product.website, query)) score += 5;
  if (contains(product.description, query)) score += 8;
  return score;
}

export function registerSearchProducts(server: McpServer): void {
  server.registerTool(
    'search_products',
    {
      title: 'Search Harpd AI products',
      description:
        'Search the Harpd open product catalog (1,122 AI products) by free text, category and verification state. ' +
        'Returns each product with its board position (rank) and its rankPoints. ' +
        'IMPORTANT: rankPoints are promotional placement bought with Credits on Harpd Rank, NOT an editorial quality score. ' +
        'Ordering by rankPoints orders by promotional placement, not by merit. ' +
        'Every record carries full provenance (source, dataset path, updatedAt, license, attribution, evidence).',
      inputSchema: searchProductsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: SearchProductsInput) => {
      try {
        const { data, sourceUrl } = await loadProducts();
        const updatedAt = data.lastUpdated ?? data.generatedAt ?? '';
        let items: HarpdProduct[] = Array.isArray(data.products) ? data.products : [];

        if (input.category) {
          const wanted = normalise(input.category);
          items = items.filter((product) => product.category?.toLowerCase() === wanted);
        }
        if (typeof input.verified === 'boolean') {
          items = items.filter((product) => product.verified === input.verified);
        }

        let scored: Array<{ product: HarpdProduct; score: number }> = items.map((product) => ({
          product,
          score: 0,
        }));

        if (input.query) {
          const query = normalise(input.query);
          scored = scored
            .map((entry) => ({ product: entry.product, score: relevance(entry.product, query) }))
            .filter((entry) => entry.score > 0);
        }

        switch (input.sort) {
          case 'name':
            scored.sort((a, b) => a.product.name.localeCompare(b.product.name));
            break;
          case 'rankPoints':
            scored.sort(
              (a, b) =>
                b.product.rankPoints - a.product.rankPoints || a.product.name.localeCompare(b.product.name),
            );
            break;
          case 'rank':
            scored.sort(
              (a, b) => a.product.rank - b.product.rank || a.product.name.localeCompare(b.product.name),
            );
            break;
          case 'relevance':
          default:
            if (input.query) {
              scored.sort(
                (a, b) => b.score - a.score || a.product.rank - b.product.rank,
              );
            } else {
              scored.sort((a, b) => a.product.rank - b.product.rank);
            }
            break;
        }

        const page = paginate(scored, input.offset, input.limit);
        const results = await Promise.all(
          page.items.map((entry) =>
            withProductProvenance(entry.product, {
              key: 'products',
              sourceUrl,
              updatedAt,
              notes: entry.score > 0 ? [`Matched the query with relevance score ${entry.score}.`] : [],
            }),
          ),
        );

        return jsonResult(
          envelope({
            tool: 'search_products',
            query: {
              query: input.query ?? null,
              category: input.category ?? null,
              verified: input.verified ?? null,
              sort: input.sort,
            },
            pagination: page.pagination,
            provenance: await buildProvenance({ key: 'products', sourceUrl, updatedAt }),
            results,
            disclaimers: [
              ...rankDisclaimers(true),
              ...(input.sort === 'rankPoints'
                ? ['This result set is ordered by rankPoints, i.e. by promotional placement.']
                : []),
              `Page size is capped at ${MAX_PAGE_SIZE} records; use offset to page through the full set.`,
            ],
            extra: {
              catalog: {
                totalProducts: data.count ?? items.length,
                filteredTotal: page.pagination.total,
                datasetGeneratedAt: data.generatedAt ?? null,
              },
            },
          }),
        );
      } catch (error) {
        return errorResult(`search_products failed: ${messageOf(error)}`, { tool: 'search_products' });
      }
    },
  );
}
