import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOOL_NAMES } from '../src/index';
import {
  assertProvenance,
  call,
  collectProvenance,
  collectResultEntries,
  connect,
  expectRejected,
  type Harness,
} from './harness';

let harness: Harness;

beforeAll(async () => {
  harness = await connect();
});

afterAll(async () => {
  await harness.close();
});

describe('tool discovery', () => {
  it('exposes exactly the 11 documented tools', async () => {
    const { tools } = await harness.client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
    expect(tools).toHaveLength(11);
  });

  it('gives every tool a non-trivial description and an input schema', async () => {
    const { tools } = await harness.client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} description`).toBeTypeOf('string');
      expect(tool.description!.length, `${tool.name} description length`).toBeGreaterThan(80);
      expect(tool.inputSchema, `${tool.name} inputSchema`).toBeTypeOf('object');
    }
  });

  it('encodes the rankPoints rule in every ranking-related tool description', async () => {
    const { tools } = await harness.client.listTools();
    const rankingTools = [
      'search_products',
      'get_product',
      'get_products',
      'get_rankings',
      'get_category_ranking',
      'get_ranking_history',
      'get_research',
      'get_evidence',
    ];
    for (const name of rankingTools) {
      const tool = tools.find((entry) => entry.name === name);
      expect(tool, `${name} is registered`).toBeDefined();
      expect(tool!.description, `${name} must mention rankPoints`).toMatch(/rankPoints/);
      expect(tool!.description, `${name} must say rankPoints are not a quality score`).toMatch(
        /NOT an editorial quality score/,
      );
    }
  });

  it('states the history limitation in get_ranking_history', async () => {
    const { tools } = await harness.client.listTools();
    const tool = tools.find((entry) => entry.name === 'get_ranking_history')!;
    expect(tool.description).toMatch(/does NOT contain a multi-month historical time series/);
  });

  it('exposes pagination limits in the input schemas', async () => {
    const { tools } = await harness.client.listTools();
    for (const name of ['get_products', 'search_products', 'get_rankings']) {
      const tool = tools.find((entry) => entry.name === name)!;
      const properties = (tool.inputSchema as any).properties ?? {};
      expect(properties.limit, `${name}.limit`).toBeDefined();
      expect(properties.offset, `${name}.offset`).toBeDefined();
      expect(properties.limit.maximum, `${name}.limit maximum`).toBe(200);
      expect(properties.offset.minimum, `${name}.offset minimum`).toBe(0);
    }
  });
});

describe('input validation', () => {
  it('rejects a page size above the 200 cap', async () => {
    await expectRejected(harness.client, 'get_products', { limit: 5000 });
  });

  it('rejects a page size below 1', async () => {
    await expectRejected(harness.client, 'get_products', { limit: 0 });
  });

  it('rejects a negative offset', async () => {
    await expectRejected(harness.client, 'get_products', { offset: -1 });
  });

  it('rejects a non-integer limit', async () => {
    await expectRejected(harness.client, 'get_products', { limit: 10.5 });
  });

  it('rejects an unknown sort mode', async () => {
    await expectRejected(harness.client, 'search_products', { sort: 'by-vibes' });
  });

  it('rejects an unknown board name', async () => {
    await expectRejected(harness.client, 'get_rankings', { board: 'yearly' });
  });

  it('rejects a malformed monthKey', async () => {
    await expectRejected(harness.client, 'get_research', { monthKey: 'August 2026' });
  });

  it('rejects get_product with no selector at all', async () => {
    const { isError, payload } = await call(harness.client, 'get_product', {});
    expect(isError).toBe(true);
    expect(payload.error).toMatch(/at least one of/);
  });

  it('rejects get_products when minRankPoints exceeds maxRankPoints', async () => {
    const { isError, payload } = await call(harness.client, 'get_products', {
      minRankPoints: 100,
      maxRankPoints: 10,
    });
    expect(isError).toBe(true);
    expect(payload.error).toMatch(/minRankPoints/);
  });
});

describe('search_products', () => {
  it('returns products with provenance and pagination', async () => {
    const { isError, payload } = await call(harness.client, 'search_products', {
      query: 'coding',
      limit: 3,
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(true);
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.results.length).toBeLessThanOrEqual(3);
    expect(payload.pagination).toMatchObject({ offset: 0, limit: 3 });
    for (const entry of payload.results) {
      expect(entry.product).toBeTypeOf('object');
      expect(entry.product.id).toBeTypeOf('string');
      expect(entry.product.rankPoints).toBeTypeOf('number');
      assertProvenance(entry.provenance, `results[${entry.product.id}]`);
    }
    expect(payload.disclaimers.join(' ')).toMatch(/promotional placement/);
  });

  it('returns a valid empty result rather than crashing for nonsense queries', async () => {
    const { isError, payload } = await call(harness.client, 'search_products', {
      query: 'zzzz-no-such-product-zzzz',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.results).toEqual([]);
    // The envelope must still be provenanced even when empty.
    assertProvenance(payload.provenance, '$.provenance');
  });

  it('flags rankPoints ordering explicitly', async () => {
    const { payload } = await call(harness.client, 'search_products', {
      category: 'developer',
      sort: 'rankPoints',
      limit: 5,
    });
    expect(payload.disclaimers.join(' ')).toMatch(/ordered by rankPoints/);
    const points = payload.results.map((entry: any) => entry.product.rankPoints);
    expect([...points].sort((a: number, b: number) => b - a)).toEqual(points);
  });

  it('filters by exact category slug', async () => {
    const { payload } = await call(harness.client, 'search_products', {
      category: 'developer',
      limit: 10,
    });
    expect(payload.results.length).toBeGreaterThan(0);
    for (const entry of payload.results) {
      expect(entry.product.category).toBe('developer');
    }
  });
});

describe('get_product', () => {
  it('resolves a real product by id with full provenance', async () => {
    const { isError, payload } = await call(harness.client, 'get_product', {
      id: 'imgkit-86d32f3e',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(true);
    expect(payload.product.id).toBe('imgkit-86d32f3e');
    expect(payload.product.name).toBe('imgkit');
    assertProvenance(payload.provenance, '$.provenance');
    expect(payload.provenance.recordUpdatedAt).toBe(payload.product.updatedAt);
  });

  it('resolves a product by name', async () => {
    const { payload } = await call(harness.client, 'get_product', { name: 'GitHub Copilot' });
    expect(payload.found).toBe(true);
    expect(payload.product.name.toLowerCase()).toContain('copilot');
  });

  it('returns a graceful not-found instead of crashing', async () => {
    const { isError, payload } = await call(harness.client, 'get_product', {
      id: 'definitely-not-a-real-product-id',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.message).toMatch(/No product/);
    assertProvenance(payload.provenance, '$.provenance');
    expect(payload.hint).toMatch(/search_products/);
  });
});

describe('get_products pagination boundaries', () => {
  it('returns a first page of the requested size', async () => {
    const { payload } = await call(harness.client, 'get_products', { limit: 200, offset: 0 });
    expect(payload.pagination.limit).toBe(200);
    expect(payload.pagination.count).toBe(200);
    expect(payload.pagination.total).toBeGreaterThanOrEqual(1122);
    expect(payload.pagination.hasMore).toBe(true);
    expect(payload.pagination.nextOffset).toBe(200);
  });

  it('walks to the end of the catalog without duplicating records', async () => {
    const total = 1122;
    const seen = new Set<string>();
    let offset = 0;
    let pages = 0;
    while (offset < total) {
      const { payload } = await call(harness.client, 'get_products', { limit: 200, offset });
      for (const entry of payload.results) seen.add(entry.product.id);
      offset = payload.pagination.nextOffset ?? offset + payload.pagination.count;
      pages += 1;
      if (pages > 10) break;
    }
    expect(pages).toBe(6);
    expect(seen.size).toBe(1122);
  });

  it('returns an empty final page past the end', async () => {
    const { isError, payload } = await call(harness.client, 'get_products', {
      limit: 20,
      offset: 100_000,
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.results).toEqual([]);
    expect(payload.pagination.hasMore).toBe(false);
    expect(payload.pagination.nextOffset).toBeNull();
  });

  it('accepts the maximum page size', async () => {
    const { isError, payload } = await call(harness.client, 'get_products', { limit: 200 });
    expect(isError).toBe(false);
    expect(payload.results.length).toBe(200);
  });
});

describe('get_rankings', () => {
  it('reads the overall board with period metadata', async () => {
    const { payload } = await call(harness.client, 'get_rankings', { board: 'overall', limit: 5 });
    expect(payload.board.board).toBe('overall');
    expect(payload.board.dataset).toBe('data/rankings/overall.json');
    expect(payload.board.recordCount).toBe(1122);
    expect(payload.board.periodKey).toMatch(/^\d{4}-\d{2}$/);
    expect(payload.results[0].product.rank).toBe(1);
    assertProvenance(payload.provenance, '$.provenance');
  });

  it('reads the monthly and weekly boards', async () => {
    const monthly = await call(harness.client, 'get_rankings', { board: 'monthly', limit: 2 });
    expect(monthly.payload.board.periodKey).toMatch(/^\d{4}-\d{2}$/);
    expect(monthly.payload.board.dataset).toBe('data/rankings/monthly.json');

    const weekly = await call(harness.client, 'get_rankings', { board: 'weekly', limit: 2 });
    expect(weekly.payload.board.periodKey).toMatch(/^\d{4}-W\d{2}$/);
    expect(weekly.payload.board.dataset).toBe('data/rankings/weekly.json');
  });

  it('never presents a rankPoints ordering as a quality ranking', async () => {
    const { payload } = await call(harness.client, 'get_rankings', {
      board: 'overall',
      sort: 'rankPoints',
      limit: 3,
    });
    const text = JSON.stringify(payload);
    expect(text).toContain('NOT an editorial quality score');
    expect(payload.disclaimers.join(' ')).toMatch(/ordered by rankPoints/);
  });
});

describe('get_category_ranking', () => {
  it('returns a valid category board with its metadata', async () => {
    const { isError, payload } = await call(harness.client, 'get_category_ranking', {
      category: 'developer',
      limit: 5,
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(true);
    expect(payload.category.slug).toBe('developer');
    expect(payload.category.name).toBe('Developer');
    expect(payload.categoryStats.boardUrl).toMatch(/^https:\/\/harpd\.com\/rank\/category\//);
    for (const entry of payload.results) {
      expect(entry.product.category).toBe('developer');
    }
  });

  it('returns a graceful not-found listing valid slugs for an invalid category', async () => {
    const { isError, payload } = await call(harness.client, 'get_category_ranking', {
      category: 'not-a-real-category',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.message).toMatch(/not one of the published Harpd category boards/);
    expect(Array.isArray(payload.availableCategories)).toBe(true);
    expect(payload.availableCategories.length).toBe(28);
    expect(payload.availableCategories.map((entry: any) => entry.slug)).toContain('developer');
    assertProvenance(payload.provenance, '$.provenance');
  });

  it('accepts a category by display name', async () => {
    const { payload } = await call(harness.client, 'get_category_ranking', {
      category: 'AI Media',
      limit: 2,
    });
    expect(payload.found).toBe(true);
    expect(payload.category.slug).toBe('ai-media');
  });
});

describe('get_ranking_history', () => {
  it('reports only the periods that really exist and states the limitation', async () => {
    const { payload } = await call(harness.client, 'get_ranking_history', {
      productId: 'imgkit-86d32f3e',
    });
    expect(payload.granularity.historicalTimeSeriesAvailable).toBe(false);
    expect(payload.granularity.snapshots).toBe(3);
    expect(payload.granularity.distinctPeriods.length).toBeGreaterThan(0);
    expect(payload.limitation).toMatch(/does NOT contain a multi-month historical time series/);
    expect(payload.limitation).toMatch(/fabricated/);
    expect(payload.boards).toHaveLength(3);
    expect(payload.boards.map((board: any) => board.dataset)).toEqual([
      'data/rankings/overall.json',
      'data/rankings/monthly.json',
      'data/rankings/weekly.json',
    ]);
  });

  it('compares one product across all three boards', async () => {
    const { payload } = await call(harness.client, 'get_ranking_history', {
      productId: 'imgkit-86d32f3e',
    });
    expect(payload.positions).toHaveLength(1);
    const position = payload.positions[0];
    expect(position.product.id).toBe('imgkit-86d32f3e');
    expect(Object.keys(position.boards).sort()).toEqual(['monthly', 'overall', 'weekly']);
    for (const board of Object.values<any>(position.boards)) {
      expect(board.rank).toBeTypeOf('number');
      expect(board.rankPoints).toBeTypeOf('number');
      expect(board.periodKey).toBeTruthy();
    }
  });

  it('is honest when the product is on no board', async () => {
    const { isError, payload } = await call(harness.client, 'get_ranking_history', {
      productId: 'no-such-product-anywhere',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.message).toMatch(/No history is inferred/);
    assertProvenance(payload.provenance, '$.provenance');
  });

  it('can compare the head of each board', async () => {
    const { payload } = await call(harness.client, 'get_ranking_history', { top: 3 });
    for (const board of ['overall', 'monthly', 'weekly']) {
      expect(payload.topByBoard[board]).toHaveLength(3);
      expect(payload.topByBoard[board][0].product.rank).toBe(1);
      assertProvenance(payload.topByBoard[board][0].provenance, `topByBoard.${board}[0]`);
    }
  });
});

describe('discovery index tools', () => {
  const cases = [
    { tool: 'get_ai_agents', dataset: 'data/research/ai-agent-index.json', total: 334 },
    { tool: 'get_ai_tools', dataset: 'data/research/ai-tools-index.json', total: 693 },
    { tool: 'get_developer_tools', dataset: 'data/research/developer-tools-index.json', total: 1918 },
  ];

  for (const testCase of cases) {
    it(`${testCase.tool} returns records from ${testCase.dataset}`, async () => {
      const { isError, payload } = await call(harness.client, testCase.tool, { limit: 3 });
      expect(isError).toBe(false);
      expect(payload.found).toBe(true);
      expect(payload.results).toHaveLength(3);
      expect(payload.slice.dataset).toBe(testCase.dataset);
      expect(payload.slice.recordCount).toBe(testCase.total);
      for (const entry of payload.results) {
        expect(entry.entity.id).toBeTypeOf('string');
        expect(entry.entity.observed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        assertProvenance(entry.provenance, `${testCase.tool}.${entry.entity.id}`);
      }
      expect(payload.disclaimers.join(' ')).toMatch(/not a ranking/i);
    });
  }

  it('filters AI agents by category and confidence', async () => {
    const { payload } = await call(harness.client, 'get_ai_agents', {
      category: 'agents',
      minConfidence: 0.5,
      limit: 5,
    });
    for (const entry of payload.results) {
      expect(entry.entity.category).toBe('agents');
      expect(entry.entity.category_confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('filters developer tools by domain', async () => {
    // Discover a domain that really exists, then filter on it.
    const sample = await call(harness.client, 'get_developer_tools', { limit: 5 });
    const domain = sample.payload.results[0].entity.domain as string;
    expect(domain).toBeTruthy();

    const { payload } = await call(harness.client, 'get_developer_tools', { domain, limit: 5 });
    expect(payload.found).toBe(true);
    for (const entry of payload.results) {
      expect(entry.entity.domain.endsWith(domain)).toBe(true);
    }
  });

  it('returns a valid empty result for a domain that is not covered', async () => {
    const { isError, payload } = await call(harness.client, 'get_developer_tools', {
      domain: 'definitely-not-a-real-domain-xyz.test',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.results).toEqual([]);
    assertProvenance(payload.provenance, '$.provenance');
  });
});

describe('get_research', () => {
  it('returns the published research reports', async () => {
    const { payload } = await call(harness.client, 'get_research', { section: 'reports' });
    expect(payload.found).toBe(true);
    expect(payload.reports.results).toHaveLength(5);
    expect(payload.reports.availableMonths).toContain('2026-08');
    for (const entry of payload.reports.results) {
      expect(entry.entity.url).toMatch(/^https:\/\/harpd\.com\/research\//);
      assertProvenance(entry.provenance, `reports.${entry.entity.family}`);
    }
  });

  it('filters reports by family', async () => {
    const { payload } = await call(harness.client, 'get_research', {
      section: 'reports',
      family: 'ai-market-index',
    });
    expect(payload.reports.results).toHaveLength(1);
    expect(payload.reports.results[0].entity.family).toBe('ai-market-index');
  });

  it('returns the AI market index with the rank-points caveat', async () => {
    const { payload } = await call(harness.client, 'get_research', { section: 'market-index' });
    expect(payload.marketIndex.results.length).toBeGreaterThan(0);
    expect(payload.marketIndex.totalProducts).toBe(1122);
    for (const entry of payload.marketIndex.results) {
      expect(entry.entity.category).toBeTypeOf('string');
      expect(entry.entity.productShare).toBeTypeOf('number');
      assertProvenance(entry.provenance, `marketIndex.${entry.entity.category}`);
    }
    expect(payload.disclaimers.join(' ')).toMatch(/promotional placement/);
  });

  it('returns both sections when asked for all', async () => {
    const { payload } = await call(harness.client, 'get_research', { section: 'all' });
    expect(payload.reports).toBeDefined();
    expect(payload.marketIndex).toBeDefined();
  });

  it('returns a valid empty result for a month with no reports', async () => {
    const { isError, payload } = await call(harness.client, 'get_research', {
      section: 'reports',
      monthKey: '1999-01',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    expect(payload.reports.results).toEqual([]);
  });
});

describe('get_evidence', () => {
  it('returns the evidence graph claims with their chain metadata', async () => {
    const { isError, payload } = await call(harness.client, 'get_evidence', { limit: 10 });
    expect(isError).toBe(false);
    expect(payload.found).toBe(true);
    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.evidenceGraph.chain).toEqual([
      'CLAIM',
      'EVIDENCE',
      'DATASET',
      'METHODOLOGY',
      'SOURCE',
      'TIMESTAMP',
    ]);
    expect(payload.evidenceGraph.counts.claims).toBe(5);
    for (const entry of payload.results) {
      expect(entry.entity.id).toBeTypeOf('string');
      expect(entry.entity.claimType).toBeTypeOf('string');
      expect(entry.provenance.evidence.claimIds).toContain(entry.entity.id);
      assertProvenance(entry.provenance, `evidence.${entry.entity.id}`);
    }
  });

  it('finds evidence for a product and includes the claims Harpd does NOT make', async () => {
    const { payload } = await call(harness.client, 'get_evidence', {
      productName: 'GitHub Copilot',
    });
    expect(payload.found).toBe(true);
    expect(payload.productEvidence.length).toBeGreaterThan(0);
    const entry = payload.productEvidence[0];
    expect(entry.product.name.toLowerCase()).toContain('copilot');
    assertProvenance(entry.provenance, 'productEvidence[0]');
    expect(entry.notClaimed.length).toBeGreaterThan(0);
    const notClaimed = entry.notClaimed.map((item: any) => item.statement).join(' ');
    expect(notClaimed).toMatch(/higher-ranked product on Harpd Rank is a better product/);
    expect(entry.rankPointsNote).toMatch(/promotional placement/);
  });

  it('filters by claim id and returns the graph when asked', async () => {
    const { payload } = await call(harness.client, 'get_evidence', {
      claimId: 'pricing:list-prices-verified',
      includeGraph: true,
    });
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].entity.id).toBe('pricing:list-prices-verified');
    expect(payload.graph.nodes.length).toBeGreaterThan(0);
    expect(payload.graph.edges.length).toBeGreaterThan(0);
  });

  it('returns a valid empty result for an unknown claim', async () => {
    const { isError, payload } = await call(harness.client, 'get_evidence', {
      claimId: 'no-such-claim',
    });
    expect(isError).toBe(false);
    expect(payload.found).toBe(false);
    assertProvenance(payload.provenance, '$.provenance');
  });

  it('surfaces the rankPoints rule as a published notClaimed entry', async () => {
    const { payload } = await call(harness.client, 'get_evidence', { limit: 1 });
    const statements = payload.evidenceGraph.notClaimed.map((item: any) => item.why).join(' ');
    expect(statements).toMatch(/Rank Points are promotional placement bought with Credits/);
  });
});

describe('provenance coverage', () => {
  // get_product returns one record at the top level; get_ranking_history
  // returns per-board comparisons rather than a flat results array.
  const expectsResultArray = new Set([
    'search_products',
    'get_products',
    'get_rankings',
    'get_category_ranking',
    'get_ai_agents',
    'get_ai_tools',
    'get_developer_tools',
    'get_research',
    'get_evidence',
  ]);

  const toolCalls: Array<[string, Record<string, unknown>]> = [
    ['search_products', { query: 'ai', limit: 3 }],
    ['get_product', { id: 'imgkit-86d32f3e' }],
    ['get_products', { limit: 3 }],
    ['get_rankings', { board: 'overall', limit: 3 }],
    ['get_category_ranking', { category: 'agents', limit: 3 }],
    ['get_ranking_history', { productId: 'imgkit-86d32f3e', top: 2 }],
    ['get_ai_agents', { limit: 3 }],
    ['get_ai_tools', { limit: 3 }],
    ['get_developer_tools', { limit: 3 }],
    ['get_research', { section: 'all' }],
    ['get_evidence', { limit: 3, includeGraph: true }],
  ];

  for (const [tool, args] of toolCalls) {
    it(`${tool} returns a provenance block on the envelope and on every record`, async () => {
      const { isError, payload } = await call(harness.client, tool, args);
      expect(isError).toBe(false);

      // The envelope itself is always provenanced — never a bare payload.
      expect(payload.provenance, `${tool} envelope provenance`).toBeTypeOf('object');
      assertProvenance(payload.provenance, `${tool} $.provenance`);

      const findings = collectProvenance(payload);
      expect(findings.length, `${tool} provenance blocks`).toBeGreaterThan(0);
      for (const finding of findings) {
        assertProvenance(finding.provenance, `${tool} ${finding.path}`);
      }

      // Tools that expose a `results` array must prove each record individually.
      if (expectsResultArray.has(tool)) {
        const entries = collectResultEntries(payload);
        expect(entries.length, `${tool} result entries`).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(
            entry.product !== undefined || entry.entity !== undefined,
            `${tool} result entry must carry product or entity`,
          ).toBe(true);
          expect(entry.provenance, `${tool} result entry must carry provenance`).toBeTypeOf('object');
        }
      }

      // No empty provenance objects anywhere in the payload.
      expect(JSON.stringify(payload)).not.toMatch(/"provenance":\{\}/);
    });
  }

  it('wraps every record in product or entity, never a bare name', async () => {
    for (const [tool, args] of toolCalls) {
      const { payload } = await call(harness.client, tool, args);
      const entries = collectResultEntries(payload);
      for (const entry of entries) {
        const record = entry.product ?? entry.entity;
        expect(record, `${tool} record`).toBeTypeOf('object');
        expect(Object.keys(entry).sort(), `${tool} entry keys`).toEqual(
          expect.arrayContaining(['provenance']),
        );
      }
    }
  });

  it('uses the configured data base for every sourceUrl', async () => {
    const base = process.env.HARPD_DATA_BASE!;
    const { payload } = await call(harness.client, 'get_products', { limit: 5 });
    for (const finding of collectProvenance(payload)) {
      expect(finding.provenance.sourceUrl.startsWith(base)).toBe(true);
    }
  });

  it('points every canonical and citation URL at harpd.com over https', async () => {
    for (const [tool, args] of toolCalls) {
      const { payload } = await call(harness.client, tool, args);
      for (const finding of collectProvenance(payload)) {
        expect(finding.provenance.canonicalUrl).toMatch(/^https:\/\/harpd\.com\//);
        expect(finding.provenance.citationUrl).toMatch(/^https:\/\/harpd\.com\//);
        expect(finding.provenance.sourceUrl).toMatch(/^(https?|file):\/\//);
      }
    }
  });
});
