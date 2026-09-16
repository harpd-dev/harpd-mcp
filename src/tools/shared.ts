/**
 * Shared building blocks for every Harpd MCP tool: pagination fields,
 * response envelopes and the mandatory disclaimers.
 */

import { z } from 'zod';

import { RANK_POINTS_DISCLAIMER } from '../client.js';
import type { Pagination, Provenance } from '../types.js';

/** Hard cap on page size, enforced by Zod. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 20;

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE)
  .describe(`Maximum number of records to return (1-${MAX_PAGE_SIZE}, default ${DEFAULT_PAGE_SIZE}).`);

export const offsetField = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe('Number of records to skip before the page starts. Must be >= 0.');

export const paginationShape = {
  limit: limitField,
  offset: offsetField,
};

/** Sort modes shared by product-listing tools. */
export const productSortField = z
  .enum(['rank', 'rankPoints', 'name'])
  .default('rank')
  .describe(
    'Ordering of the returned records. "rank" = board position ascending. "rankPoints" = descending by promotional placement, which is NOT a quality ordering. "name" = alphabetical.',
  );

export const RANK_POINTS_SORT_NOTE =
  'Ordered by rankPoints (promotional placement bought with Credits). This is not a quality ranking.';

export const COVERAGE_NOTE =
  'This dataset is a coverage slice of the Harpd Product Discovery Index, not a ranking. No ordering here implies quality.';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

/** Serialise a payload as the single text content block of a tool result. */
export function jsonResult(payload: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** A structured, non-crashing error result. */
export function errorResult(message: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }, null, 2) }],
    structuredContent: { error: message, ...extra },
  };
}

/**
 * A graceful "nothing matched" result. Deliberately NOT an error: an agent
 * asking for a product that does not exist should get a usable answer.
 */
export function notFoundResult(payload: Record<string, unknown>): ToolResult {
  return jsonResult({ found: false, ...payload });
}

export interface EnvelopeOptions {
  tool: string;
  query: Record<string, unknown>;
  pagination: Pagination;
  provenance: Provenance;
  results: unknown[];
  extra?: Record<string, unknown>;
  disclaimers?: string[];
}

/** The standard Harpd response envelope: provenance + pagination + results. */
export function envelope(options: EnvelopeOptions): Record<string, unknown> {
  const disclaimers = options.disclaimers ?? [];
  return {
    tool: options.tool,
    found: options.results.length > 0,
    query: options.query,
    pagination: options.pagination,
    count: options.results.length,
    results: options.results,
    provenance: options.provenance,
    disclaimers,
    ...(options.extra ?? {}),
  };
}

/** Disclaimers that must ride along with any rankPoints-bearing payload. */
export function rankDisclaimers(includeRankPoints: boolean): string[] {
  return includeRankPoints ? [RANK_POINTS_DISCLAIMER] : [];
}

/** Format an unknown thrown value as a message. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
