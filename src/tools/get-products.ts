import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildProvenance, loadProducts, normalise, paginate, withProductProvenance } from '../client.js';
import type { HarpdProduct } from '../types.js';
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

export const getProductsInputSchema = z.object({
  category: z.string().min(1).max(64).optional().describe('Exact Harpd category slug.'),
  verified: z.boolean().optional().describe('Filter by Harpd verification state.'),
  productType: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe('Substring match against the free-text productType field, e.g. "Design platform".'),
  minRankPoints: z.number().int().min(0).optional().describe('Only products with rankPoints >= this value.'),
  maxRankPoints: z.number().int().min(0).optional().describe('Only products with rankPoints <= this value.'),
  sort: productSortField,
  limit: limitField,
  offset: offsetField,
});

type GetProductsInput = z.infer<typeof getProductsInputSchema>;

function sortProducts(products: HarpdProduct[], sort: 'rank' | 'rankPoints' | 'name'): HarpdProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'rankPoints':
      return copy.sort((a, b) => b.rankPoints - a.rankPoints || a.name.localeCompare(b.name));
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'rank':
    default:
      return copy.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }
}

export function registerGetProducts(server: McpServer): void {
  server.registerTool(
    'get_products',
    {
      title: 'List Harpd AI products (paginated)',
      description:
        'Page through the full Harpd open product catalog (1,122 records) with filters on category, verification state, product type and rankPoints range. ' +
        'Use this to enumerate or bulk-export products; use search_products for free-text lookup. ' +
        'IMPORTANT: rankPoints are promotional placement bought with Credits on Harpd Rank, NOT an editorial quality score. ' +
        'Sorting by "rankPoints" orders by promotional placement, not by merit. ' +
        'Page size is capped at 200. Every record carries full provenance.',
      inputSchema: getProductsInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetProductsInput) => {
      try {
        if (
          typeof input.minRankPoints === 'number' &&
          typeof input.maxRankPoints === 'number' &&
          input.minRankPoints > input.maxRankPoints
        ) {
          return errorResult('minRankPoints must be less than or equal to maxRankPoints.', {
            tool: 'get_products',
          });
        }

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
        if (input.productType) {
          const wanted = normalise(input.productType);
          items = items.filter((product) => (product.productType ?? '').toLowerCase().includes(wanted));
        }
        if (typeof input.minRankPoints === 'number') {
          items = items.filter((product) => product.rankPoints >= input.minRankPoints!);
        }
        if (typeof input.maxRankPoints === 'number') {
          items = items.filter((product) => product.rankPoints <= input.maxRankPoints!);
        }

        const sorted = sortProducts(items, input.sort);
        const page = paginate(sorted, input.offset, input.limit);
        const results = await Promise.all(
          page.items.map((product) =>
            withProductProvenance(product, { key: 'products', sourceUrl, updatedAt }),
          ),
        );

        return jsonResult(
          envelope({
            tool: 'get_products',
            query: {
              category: input.category ?? null,
              verified: input.verified ?? null,
              productType: input.productType ?? null,
              minRankPoints: input.minRankPoints ?? null,
              maxRankPoints: input.maxRankPoints ?? null,
              sort: input.sort,
            },
            pagination: page.pagination,
            provenance: await buildProvenance({ key: 'products', sourceUrl, updatedAt }),
            results,
            disclaimers: [
              ...rankDisclaimers(true),
              ...(input.sort === 'rankPoints'
                ? ['This result set is ordered by rankPoints, i.e. by promotional placement, not by quality.']
                : []),
              `Page size is capped at ${MAX_PAGE_SIZE} records. Follow pagination.nextOffset to continue.`,
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
        return errorResult(`get_products failed: ${messageOf(error)}`, { tool: 'get_products' });
      }
    },
  );
}
