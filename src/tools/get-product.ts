import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildProvenance, loadProducts, normalise, withProductProvenance } from '../client.js';
import type { HarpdProduct } from '../types.js';
import { errorResult, jsonResult, messageOf, notFoundResult } from './shared.js';

export const getProductInputSchema = z.object({
  id: z.string().min(1).max(128).optional().describe('Exact Harpd product id, e.g. "imgkit-86d32f3e".'),
  slug: z.string().min(1).max(128).optional().describe('Exact Harpd product slug.'),
  name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Product name. Matched exactly first, then case-insensitively, then as a substring.'),
});

type GetProductInput = z.infer<typeof getProductInputSchema>;

function resolve(products: HarpdProduct[], input: GetProductInput): HarpdProduct | undefined {
  if (input.id) {
    const wanted = normalise(input.id);
    const exact = products.find((product) => normalise(product.id) === wanted);
    if (exact) return exact;
  }
  if (input.slug) {
    const wanted = normalise(input.slug);
    const exact = products.find((product) => normalise(product.slug) === wanted);
    if (exact) return exact;
  }
  if (input.name) {
    const wanted = normalise(input.name);
    const exact = products.find((product) => normalise(product.name) === wanted);
    if (exact) return exact;
    const partial = products.find((product) => normalise(product.name).includes(wanted));
    if (partial) return partial;
  }
  return undefined;
}

export function registerGetProduct(server: McpServer): void {
  server.registerTool(
    'get_product',
    {
      title: 'Get one Harpd AI product',
      description:
        'Look up a single product in the Harpd open product catalog by id, slug or name. ' +
        'Returns the product record plus mandatory provenance (source, dataset path, sourceUrl, updatedAt, license, attribution, evidence links). ' +
        'A product that does not exist returns a structured found:false result rather than an error. ' +
        'NOTE: rankPoints are promotional placement bought with Credits, NOT an editorial quality score.',
      inputSchema: getProductInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetProductInput) => {
      try {
        if (!input.id && !input.slug && !input.name) {
          return errorResult(
            'get_product requires at least one of: id, slug, name.',
            { tool: 'get_product' },
          );
        }

        const { data, sourceUrl } = await loadProducts();
        const updatedAt = data.lastUpdated ?? data.generatedAt ?? '';
        const products = Array.isArray(data.products) ? data.products : [];
        const product = resolve(products, input);

        if (!product) {
          return notFoundResult({
            tool: 'get_product',
            message:
              'No product in the Harpd product catalog matches that selector. The catalog is not exhaustive: many AI products exist that Harpd has not listed.',
            selector: { id: input.id ?? null, slug: input.slug ?? null, name: input.name ?? null },
            provenance: await buildProvenance({ key: 'products', sourceUrl, updatedAt }),
            hint: 'Use search_products with a free-text query to find the correct id or slug.',
          });
        }

        const wrapped = await withProductProvenance(product, {
          key: 'products',
          sourceUrl,
          updatedAt,
        });

        return jsonResult({
          tool: 'get_product',
          found: true,
          ...wrapped,
          disclaimers: [
            'rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score.',
          ],
        });
      } catch (error) {
        return errorResult(`get_product failed: ${messageOf(error)}`, { tool: 'get_product' });
      }
    },
  );
}
