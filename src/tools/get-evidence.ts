import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  buildProvenance,
  contains,
  loadEvidence,
  loadProducts,
  normalise,
  paginate,
  withProvenance,
} from '../client.js';
import { RANK_POINTS_DISCLAIMER } from '../client.js';
import type { EvidenceClaim, EvidenceDataset, HarpdProduct } from '../types.js';
import {
  MAX_PAGE_SIZE,
  errorResult,
  jsonResult,
  limitField,
  messageOf,
  offsetField,
} from './shared.js';

export const CLAIM_TYPES = [
  'MEASURED',
  'OBSERVED',
  'CALCULATED',
  'MODELED',
  'EDITORIAL',
  'USER_SUBMITTED',
] as const;

export const getEvidenceInputSchema = z.object({
  claimId: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Exact claim id from the Harpd Evidence Graph, e.g. "pricing:list-prices-verified".'),
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Free-text query matched against claim text, claim dataset id, source name/url and methodology URL.',
    ),
  productName: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      'Product name (or part of it). Resolves the product in the Harpd catalog and returns the evidence that actually covers it, plus the claims Harpd explicitly does NOT make about it.',
    ),
  datasetId: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe('Only claims that resolve to this Harpd dataset id, e.g. "rank", "products".'),
  claimType: z.enum(CLAIM_TYPES).optional().describe('Only claims of this evidence type.'),
  includeGraph: z
    .boolean()
    .default(false)
    .describe('Also return the Evidence Graph nodes and edges for the matched claims.'),
  limit: limitField,
  offset: offsetField,
});

type GetEvidenceInput = z.infer<typeof getEvidenceInputSchema>;

function matchesClaim(claim: EvidenceClaim, query: string): boolean {
  return (
    contains(claim.claim, query) ||
    contains(claim.id, query) ||
    contains(claim.datasetId, query) ||
    contains(claim.datasetUrl, query) ||
    contains(claim.methodologyUrl, query) ||
    contains(claim.source?.name, query) ||
    contains(claim.source?.url, query) ||
    contains(claim.claimType, query)
  );
}

function findProducts(products: HarpdProduct[], name: string): HarpdProduct[] {
  const wanted = normalise(name);
  const exact = products.filter((product) => normalise(product.name) === wanted);
  if (exact.length > 0) return exact.slice(0, 3);
  return products
    .filter((product) => normalise(product.name).includes(wanted))
    .slice(0, 3);
}

export function registerGetEvidence(server: McpServer): void {
  server.registerTool(
    'get_evidence',
    {
      title: 'Get Harpd evidence claims for a dataset or product',
      description:
        'Query the Harpd Evidence Graph: every published Harpd claim resolved to its evidence, dataset, methodology, source and data timestamp, including the claims Harpd explicitly does NOT make. ' +
        'Use this to check whether a statement about Harpd data is actually supported before repeating it. ' +
        'IMPORTANT: the graph itself records that rankPoints are promotional placement bought with Credits, and that "a higher-ranked product is a better product" is NOT a supported claim. rankPoints are NOT an editorial quality score. ' +
        'Claims that fail the evidence chain are returned with their violations rather than hidden. Every record carries full provenance.',
      inputSchema: getEvidenceInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetEvidenceInput) => {
      try {
        const { data, definition, sourceUrl } = await loadEvidence();
        const evidence: EvidenceDataset = data;
        const updatedAt = evidence.lastUpdated ?? '';
        const allClaims: EvidenceClaim[] = Array.isArray(evidence.claims) ? evidence.claims : [];

        let claims = [...allClaims];

        if (input.claimId) {
          const wanted = normalise(input.claimId);
          claims = claims.filter((claim) => normalise(claim.id) === wanted);
        }
        if (input.datasetId) {
          const wanted = normalise(input.datasetId);
          claims = claims.filter((claim) => normalise(claim.datasetId) === wanted);
        }
        if (input.claimType) {
          claims = claims.filter((claim) => claim.claimType === input.claimType);
        }
        if (input.query) {
          const query = normalise(input.query);
          claims = claims.filter((claim) => matchesClaim(claim, query));
        }
        if (input.productName) {
          const query = normalise(input.productName);
          const byProduct = claims.filter(
            (claim) =>
              contains(claim.claim, query) ||
              contains(claim.source?.name, query) ||
              contains(claim.datasetId, query),
          );
          // A product lookup must still surface the claims Harpd makes about
          // the ranking surface, otherwise the answer is misleadingly empty.
          const rankSurface = claims.filter((claim) =>
            ['rank', 'products', 'categories', 'rank-open-data'].includes(claim.datasetId),
          );
          const merged = new Map<string, EvidenceClaim>();
          for (const claim of [...byProduct, ...rankSurface]) merged.set(claim.id, claim);
          claims = [...merged.values()];
        }

        const page = paginate(claims, input.offset, input.limit);
        const results = await Promise.all(
          page.items.map((claim) =>
            withProvenance<EvidenceClaim>(
              claim,
              {
                key: 'evidence',
                sourceUrl,
                updatedAt,
                methodologyUrl: claim.methodologyUrl ?? null,
                claimIds: [claim.id],
                notes: [
                  `claimType=${claim.claimType}; supported=${String(claim.supported)}; confidence=${claim.confidence}.`,
                  ...(claim.violations?.length
                    ? [`This claim carries ${claim.violations.length} recorded violation(s).`]
                    : []),
                ],
              },
              'entity',
            ),
          ),
        );

        const graphNodes = evidence.graph?.nodes ?? [];
        const graphEdges = evidence.graph?.edges ?? [];
        const matchedIds = new Set(page.items.map((claim) => claim.id));
        const graph = input.includeGraph
          ? {
              nodes: graphNodes.filter((node) =>
                [...matchedIds].some((id) => node.id === `claim:${id}` || node.id.includes(id)),
              ),
              edges: graphEdges.filter((edge) =>
                [...matchedIds].some((id) => edge.from.includes(id) || edge.to.includes(id)),
              ),
            }
          : undefined;

        const payload: Record<string, unknown> = {
          tool: 'get_evidence',
          found: results.length > 0,
          query: {
            claimId: input.claimId ?? null,
            query: input.query ?? null,
            productName: input.productName ?? null,
            datasetId: input.datasetId ?? null,
            claimType: input.claimType ?? null,
            includeGraph: input.includeGraph,
          },
          pagination: page.pagination,
          count: results.length,
          results,
          provenance: await buildProvenance({ key: 'evidence', sourceUrl, updatedAt }),
          evidenceGraph: {
            dataset: definition.path,
            name: evidence.name,
            description: evidence.description,
            canonical: evidence.canonical,
            schemaVersion: evidence.schemaVersion,
            chain: evidence.chain,
            claimTypes: evidence.claimTypes,
            counts: evidence.counts,
            rules: evidence.rules,
            notClaimed: evidence.notClaimed,
            datasets: evidence.datasets,
          },
          disclaimers: [
            RANK_POINTS_DISCLAIMER,
            'A claim appearing here means Harpd resolved it to a dataset, methodology and timestamp. It is not an endorsement by any third party.',
            `Page size is capped at ${MAX_PAGE_SIZE} records.`,
          ],
        };

        if (graph) payload.graph = graph;

        if (input.productName) {
          const { data: productData, sourceUrl: productSourceUrl } = await loadProducts();
          const productsUpdatedAt = productData.lastUpdated ?? productData.generatedAt ?? '';
          const matchedProducts = findProducts(
            Array.isArray(productData.products) ? productData.products : [],
            input.productName,
          );

          payload.productEvidence = await Promise.all(
            matchedProducts.map(async (product) => {
              const wrapped = await withProvenance<HarpdProduct>(
                product,
                {
                  key: 'products',
                  sourceUrl: productSourceUrl,
                  updatedAt: productsUpdatedAt,
                },
                'product',
              );
              const applicable = allClaims.filter((claim) =>
                ['rank', 'products', 'categories', 'rank-open-data'].includes(claim.datasetId),
              );
              return {
                product: wrapped.product,
                provenance: wrapped.provenance,
                claims: applicable.map((claim) => ({
                  id: claim.id,
                  claimType: claim.claimType,
                  supported: claim.supported,
                  methodologyUrl: claim.methodologyUrl,
                  datasetId: claim.datasetId,
                  observedAt: claim.observedAt,
                })),
                notClaimed: evidence.notClaimed,
                rankPointsNote:
                  'The Harpd Evidence Graph records that rankPoints are promotional placement bought with Credits, and that "a higher-ranked product is a better product" is explicitly NOT a supported claim.',
              };
            }),
          );

          if (matchedProducts.length === 0) {
            payload.productEvidenceNote =
              'No product in the Harpd catalog matched that name, so no per-product evidence is attached. The dataset-level claims above still apply.';
          }
        }

        return jsonResult(payload);
      } catch (error) {
        return errorResult(`get_evidence failed: ${messageOf(error)}`, { tool: 'get_evidence' });
      }
    },
  );
}
