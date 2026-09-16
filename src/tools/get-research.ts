import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  buildProvenance,
  loadMarketIndex,
  loadResearch,
  normalise,
  paginate,
  withProvenance,
} from '../client.js';
import type { MarketIndexEntry, ResearchRecord } from '../types.js';
import {
  MAX_PAGE_SIZE,
  errorResult,
  jsonResult,
  limitField,
  messageOf,
  offsetField,
  rankDisclaimers,
} from './shared.js';

export const getResearchInputSchema = z.object({
  section: z
    .enum(['reports', 'market-index', 'all'])
    .default('reports')
    .describe(
      '"reports" = the published monthly research reports; "market-index" = category-level product counts and rank-point distribution; "all" = both.',
    ),
  family: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe(
      'Filter reports by research family, e.g. "ai-agent-index", "ai-market-index", "ai-tools-index", "developer-tools-index", "ai-tools-trends".',
    ),
  monthKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'monthKey must look like "2026-08".')
    .optional()
    .describe('Filter reports by month key, e.g. "2026-08".'),
  category: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('Filter the market index by exact category slug.'),
  limit: limitField,
  offset: offsetField,
});

type GetResearchInput = z.infer<typeof getResearchInputSchema>;

export function registerGetResearch(server: McpServer): void {
  server.registerTool(
    'get_research',
    {
      title: 'Get Harpd research reports and the AI market index',
      description:
        'Read Harpd research output: the published monthly research reports (5 records, one per family/month) and the AI Market Index (27 category rows with product counts, product share and rank-point share). ' +
        'IMPORTANT: pointsShare is a share of rankPoints, and rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score. pointsShare is not a share of quality or of market merit. ' +
        'Reports exist only for closed months with enough ranked products in the family scope. Every record carries full provenance.',
      inputSchema: getResearchInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (input: GetResearchInput) => {
      try {
        const wantsReports = input.section === 'reports' || input.section === 'all';
        const wantsMarket = input.section === 'market-index' || input.section === 'all';

        const payload: Record<string, unknown> = {
          tool: 'get_research',
          query: {
            section: input.section,
            family: input.family ?? null,
            monthKey: input.monthKey ?? null,
            category: input.category ?? null,
          },
        };

        let primaryProvenance: Awaited<ReturnType<typeof buildProvenance>> | null = null;
        let primaryPagination: ReturnType<typeof paginate>['pagination'] | null = null;
        let primaryCount = 0;

        if (wantsReports) {
          const { data, definition, sourceUrl } = await loadResearch();
          const updatedAt = data.lastUpdated ?? data.generatedAt ?? '';
          let reports: ResearchRecord[] = Array.isArray(data.research) ? data.research : [];

          if (input.family) {
            const wanted = normalise(input.family);
            reports = reports.filter((record) => normalise(record.family) === wanted);
          }
          if (input.monthKey) {
            reports = reports.filter((record) => record.monthKey === input.monthKey);
          }

          reports = [...reports].sort(
            (a, b) => b.monthKey.localeCompare(a.monthKey) || a.family.localeCompare(b.family),
          );

          const page = paginate(reports, input.offset, input.limit);
          const results = await Promise.all(
            page.items.map((record) =>
              withProvenance<ResearchRecord>(
                record,
                { key: 'research-index', sourceUrl, updatedAt },
                'entity',
              ),
            ),
          );

          payload.reports = {
            dataset: definition.path,
            pagination: page.pagination,
            count: results.length,
            results,
            provenance: await buildProvenance({ key: 'research-index', sourceUrl, updatedAt }),
            availableFamilies: Array.from(
              new Set((data.research ?? []).map((record) => record.family)),
            ).sort(),
            availableMonths: Array.from(
              new Set((data.research ?? []).map((record) => record.monthKey)),
            ).sort(),
            note: data.note ?? null,
          };

          primaryProvenance = await buildProvenance({ key: 'research-index', sourceUrl, updatedAt });
          primaryPagination = page.pagination;
          primaryCount = results.length;
        }

        if (wantsMarket) {
          const { data, definition, sourceUrl } = await loadMarketIndex();
          const updatedAt = data.lastUpdated ?? data.generatedAt ?? '';
          let entries: MarketIndexEntry[] = Array.isArray(data.categories) ? data.categories : [];

          if (input.category) {
            const wanted = normalise(input.category);
            entries = entries.filter((entry) => normalise(entry.category) === wanted);
          }
          entries = [...entries].sort((a, b) => b.productCount - a.productCount);

          const page = paginate(entries, input.offset, input.limit);
          const results = await Promise.all(
            page.items.map((entry) =>
              withProvenance<MarketIndexEntry>(
                entry,
                {
                  key: 'ai-market-index',
                  sourceUrl,
                  updatedAt,
                  notes: [
                    'pointsShare is a share of rankPoints (promotional placement), not of quality.',
                  ],
                },
                'entity',
              ),
            ),
          );

          payload.marketIndex = {
            dataset: definition.path,
            pagination: page.pagination,
            count: results.length,
            results,
            provenance: await buildProvenance({ key: 'ai-market-index', sourceUrl, updatedAt }),
            totalProducts: data.totalProducts ?? null,
            totalRankPoints: data.totalRankPoints ?? null,
            categoryCount: data.categoryCount ?? null,
            disclosure: data.disclosure ?? null,
          };

          if (!primaryProvenance) {
            primaryProvenance = await buildProvenance({ key: 'ai-market-index', sourceUrl, updatedAt });
            primaryPagination = page.pagination;
            primaryCount = results.length;
          }
        }

        payload.found = primaryCount > 0;
        payload.count = primaryCount;
        payload.pagination = primaryPagination;
        payload.provenance = primaryProvenance;
        payload.disclaimers = [
          ...rankDisclaimers(true),
          'Research reports exist only for closed months with enough ranked products in the family scope; absence of a month is not a data error.',
          `Page size is capped at ${MAX_PAGE_SIZE} records.`,
        ];

        return jsonResult(payload);
      } catch (error) {
        return errorResult(`get_research failed: ${messageOf(error)}`, { tool: 'get_research' });
      }
    },
  );
}
