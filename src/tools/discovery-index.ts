/**
 * Shared implementation for the three Discovery Index tools:
 * `get_ai_agents`, `get_ai_tools` and `get_developer_tools`.
 *
 * All three read the same `{meta, records}` shape and are coverage slices of
 * the Harpd Product Discovery Index. They are explicitly NOT rankings.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  buildProvenance,
  contains,
  normalise,
  paginate,
  withProvenance,
} from '../client.js';
import type { DiscoveryIndexDataset, DiscoveryRecord } from '../types.js';
import type { DatasetKey, LoadResult } from '../client.js';
import {
  COVERAGE_NOTE,
  MAX_PAGE_SIZE,
  envelope,
  errorResult,
  jsonResult,
  limitField,
  messageOf,
  offsetField,
} from './shared.js';

export const discoveryInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Free-text query matched against name, domain, title and description.'),
  category: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Exact Discovery Index category, e.g. "agents", "developer", "ai-media".'),
  domain: z
    .string()
    .min(1)
    .max(253)
    .optional()
    .describe('Exact or suffix domain match, e.g. "uneed.best".'),
  onRankBoard: z
    .boolean()
    .optional()
    .describe('Filter on whether the record also appears on the Harpd Rank board.'),
  minConfidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Only records whose category_confidence is >= this value (0-1).'),
  limit: limitField,
  offset: offsetField,
});

export type DiscoveryInput = z.infer<typeof discoveryInputSchema>;

function relevance(record: DiscoveryRecord, query: string): number {
  let score = 0;
  if (normalise(record.name) === query) score += 100;
  if (contains(record.name, query)) score += 50;
  if (contains(record.domain, query)) score += 30;
  if (contains(record.title, query)) score += 15;
  if (contains(record.description, query)) score += 8;
  if (contains(record.category, query)) score += 5;
  return score;
}

export interface DiscoveryToolConfig {
  toolName: string;
  title: string;
  /** One-line description of the slice, used in the tool description. */
  slice: string;
  datasetKey: DatasetKey;
  loader: () => Promise<LoadResult<DiscoveryIndexDataset>>;
  /** Extra note appended to the tool description. */
  extraDescription?: string;
}

export function registerDiscoveryTool(server: McpServer, config: DiscoveryToolConfig): void {
  server.registerTool(
    config.toolName,
    {
      title: config.title,
      description:
        `${config.slice} ` +
        'This is a COVERAGE list derived from the Harpd Product Discovery Index, NOT a ranking: records carry no rank and no rankPoints, and their order implies nothing about quality. ' +
        'Each record includes its observed_at timestamp, discovery source and profile URL. ' +
        (config.extraDescription ? `${config.extraDescription} ` : '') +
        'Every record carries full provenance (source, dataset path, sourceUrl, updatedAt, license, attribution).',
      inputSchema: discoveryInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: DiscoveryInput) => {
      try {
        const { data, definition, sourceUrl } = await config.loader();
        const meta = data.meta;
        const updatedAt = meta?.generatedAt ?? '';
        let records: DiscoveryRecord[] = Array.isArray(data.records) ? data.records : [];

        if (input.category) {
          const wanted = normalise(input.category);
          records = records.filter((record) => normalise(record.category) === wanted);
        }
        if (input.domain) {
          const wanted = normalise(input.domain);
          records = records.filter(
            (record) =>
              normalise(record.domain) === wanted || normalise(record.domain).endsWith(`.${wanted}`),
          );
        }
        if (typeof input.onRankBoard === 'boolean') {
          records = records.filter((record) => Boolean(record.on_rank_board) === input.onRankBoard);
        }
        if (typeof input.minConfidence === 'number') {
          records = records.filter(
            (record) => Number(record.category_confidence) >= input.minConfidence!,
          );
        }

        let scored = records.map((record) => ({ record, score: 0 }));
        if (input.query) {
          const query = normalise(input.query);
          scored = scored
            .map((entry) => ({ record: entry.record, score: relevance(entry.record, query) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name));
        } else {
          scored.sort((a, b) => a.record.name.localeCompare(b.record.name));
        }

        const page = paginate(scored, input.offset, input.limit);
        const results = await Promise.all(
          page.items.map((entry) =>
            withProvenance<DiscoveryRecord>(
              entry.record,
              {
                key: config.datasetKey,
                sourceUrl,
                updatedAt,
                notes: [
                  'Coverage record from the Harpd Product Discovery Index. No rank or rankPoints is attached.',
                ],
              },
              'entity',
            ),
          ),
        );

        return jsonResult(
          envelope({
            tool: config.toolName,
            query: {
              query: input.query ?? null,
              category: input.category ?? null,
              domain: input.domain ?? null,
              onRankBoard: input.onRankBoard ?? null,
              minConfidence: input.minConfidence ?? null,
            },
            pagination: page.pagination,
            provenance: await buildProvenance({ key: config.datasetKey, sourceUrl, updatedAt }),
            results,
            disclaimers: [
              COVERAGE_NOTE,
              'This slice is not a ranking. Ordering is alphabetical or by text relevance only.',
              `Page size is capped at ${MAX_PAGE_SIZE} records.`,
            ],
            extra: {
              slice: {
                datasetId: meta?.datasetId ?? definition.id,
                dataset: definition.path,
                derivedFrom: meta?.derivedFrom ?? null,
                sliceDefinition: meta?.sliceDefinition ?? null,
                recordCount: meta?.recordCount ?? records.length,
                filteredTotal: page.pagination.total,
                sourceUrl: meta?.sourceUrl ?? null,
                disclosure: meta?.disclosure ?? null,
              },
            },
          }),
        );
      } catch (error) {
        return errorResult(`${config.toolName} failed: ${messageOf(error)}`, {
          tool: config.toolName,
        });
      }
    },
  );
}
