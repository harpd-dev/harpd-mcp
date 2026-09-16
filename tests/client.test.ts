import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DATASET_REGISTRY,
  RANK_POINTS_DISCLAIMER,
  buildProvenance,
  dataBase,
  loadProducts,
  paginate,
  resetClientCaches,
  resolveSourceUrl,
  withProvenance,
  withProductProvenance,
} from '../src/client';
import { assertProvenance } from './harness';

const ORIGINAL_BASE = process.env.HARPD_DATA_BASE;

beforeEach(() => {
  process.env.HARPD_DATA_BASE = ORIGINAL_BASE;
  resetClientCaches();
});

afterEach(() => {
  process.env.HARPD_DATA_BASE = ORIGINAL_BASE;
});

describe('data base resolution', () => {
  it('defaults to the published raw GitHub mirror', () => {
    delete process.env.HARPD_DATA_BASE;
    expect(dataBase()).toBe(
      'https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/',
    );
  });

  it('honours the HARPD_DATA_BASE override and normalises the trailing slash', () => {
    process.env.HARPD_DATA_BASE = 'https://example.test/harpd';
    expect(dataBase()).toBe('https://example.test/harpd/');
  });

  it('supports file:// bases', () => {
    process.env.HARPD_DATA_BASE = 'file:///tmp/harpd-data';
    expect(dataBase()).toBe('file:///tmp/harpd-data/');
    expect(resolveSourceUrl('data/products/products.json')).toBe(
      'file:///tmp/harpd-data/data/products/products.json',
    );
  });

  it('ignores a blank override', () => {
    process.env.HARPD_DATA_BASE = '   ';
    expect(dataBase()).toBe('https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/');
  });
});

describe('dataset registry', () => {
  it('registers every dataset the tools read', () => {
    expect(Object.keys(DATASET_REGISTRY).sort()).toEqual([
      'ai-agent-index',
      'ai-market-index',
      'ai-tools-index',
      'categories',
      'developer-tools-index',
      'evidence',
      'manifest',
      'products',
      'rankings-monthly',
      'rankings-overall',
      'rankings-weekly',
      'research-index',
    ]);
  });

  it('points every dataset path at a real file path shape', () => {
    for (const definition of Object.values(DATASET_REGISTRY)) {
      expect(definition.path).toMatch(/^data\/.+\.json$/);
      expect(definition.canonicalUrl).toMatch(/^https:\/\/harpd\.com\//);
      expect(definition.citationUrl).toMatch(/^https:\/\/harpd\.com\//);
      expect(definition.license).toBe('CC BY 4.0');
      expect(definition.attribution).toContain('Harpd');
    }
  });
});

describe('file:// loader', () => {
  it('reads the real local dataset offline', async () => {
    const { data, definition, sourceUrl, fromCache } = await loadProducts();
    expect(definition.path).toBe('data/products/products.json');
    expect(Array.isArray(data.products)).toBe(true);
    expect(data.products.length).toBe(1122);
    expect(data.count).toBe(1122);
    expect(sourceUrl.startsWith('file://')).toBe(true);
    // file:// reads bypass the TTL cache so results are deterministic.
    expect(fromCache).toBe(false);
  });

  it('fails with an actionable message when the base is missing', async () => {
    process.env.HARPD_DATA_BASE = 'file:///tmp/definitely-not-here-harpd/';
    await expect(loadProducts()).rejects.toThrow(/Could not read local dataset/);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, index) => index);

  it('describes the first page', () => {
    expect(paginate(items, 0, 10)).toEqual({
      items: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      pagination: { total: 25, count: 10, offset: 0, limit: 10, hasMore: true, nextOffset: 10 },
    });
  });

  it('describes a middle page', () => {
    const page = paginate(items, 10, 10);
    expect(page.items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(page.pagination.nextOffset).toBe(20);
    expect(page.pagination.hasMore).toBe(true);
  });

  it('describes a short final page', () => {
    const page = paginate(items, 20, 10);
    expect(page.items).toHaveLength(5);
    expect(page.pagination.hasMore).toBe(false);
    expect(page.pagination.nextOffset).toBeNull();
  });

  it('returns an empty page past the end without throwing', () => {
    const page = paginate(items, 999, 10);
    expect(page.items).toEqual([]);
    expect(page.pagination.count).toBe(0);
    expect(page.pagination.hasMore).toBe(false);
  });

  it('clamps a negative offset and a zero limit defensively', () => {
    expect(paginate(items, -5, 0).pagination.offset).toBe(0);
    expect(paginate(items, -5, 0).pagination.limit).toBe(1);
  });
});

describe('withProvenance', () => {
  it('wraps an entity and produces a complete provenance block', async () => {
    const { data, sourceUrl } = await loadProducts();
    const product = data.products[0]!;

    const wrapped = await withProductProvenance(product, {
      key: 'products',
      sourceUrl,
      updatedAt: data.lastUpdated,
    });

    expect(wrapped.product).toBe(product);
    assertProvenance(wrapped.provenance, 'wrapped.provenance');
    expect(wrapped.provenance.dataset).toBe('data/products/products.json');
    expect(wrapped.provenance.recordUpdatedAt).toBe(product.updatedAt);
    expect(wrapped.provenance.notes).toContain(RANK_POINTS_DISCLAIMER);
  });

  it('uses the "entity" key by default', async () => {
    const wrapped = await withProvenance({ id: 'x' }, {
      key: 'evidence',
      sourceUrl: 'file:///tmp/evidence.json',
      updatedAt: '2026-09-16',
    });
    expect(wrapped.entity).toEqual({ id: 'x' });
    expect(wrapped).not.toHaveProperty('product');
    assertProvenance(wrapped.provenance, 'wrapped.provenance');
  });

  it('always emits an evidence object, even with no matching claim', async () => {
    const provenance = await buildProvenance({
      key: 'products',
      sourceUrl: 'file:///tmp/products.json',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    expect(provenance.evidence).toBeTypeOf('object');
    expect(provenance.evidence.claimIds).toEqual([]);
    expect(provenance.evidence.note).toMatch(/No entry in the Harpd Evidence Graph/);
    expect(provenance.evidence.methodologyUrl).toBe('https://harpd.com/rank/methodology/');
    expect(provenance.source).toBe('Harpd');
    expect(provenance.license).toBe('CC BY 4.0');
  });

  it('links the Evidence Graph claims that really cover a dataset', async () => {
    // The Evidence Graph keys the ranking claims by dataset id "rank", which
    // the three board files are mapped to from the graph's own description.
    const provenance = await buildProvenance({
      key: 'rankings-overall',
      sourceUrl: 'file:///tmp/overall.json',
      updatedAt: '2026-09-15T00:00:00.000Z',
    });
    expect(provenance.evidence.claimIds).toContain('rank:points-rule');
    expect(provenance.evidence.claimIds).toContain('rank:dataset-coverage');
    expect(provenance.evidence.methodologyUrl).toBe('https://harpd.com/rank/methodology/');
  });

  it('does not attach claims to datasets the graph does not describe', async () => {
    // The graph has no description matching the Discovery Index slices, so they
    // must stay unmapped rather than borrowing an unrelated claim.
    for (const key of ['ai-agent-index', 'ai-tools-index', 'developer-tools-index'] as const) {
      const provenance = await buildProvenance({
        key,
        sourceUrl: `file:///tmp/${key}.json`,
        updatedAt: '2026-09-09T00:00:00.000Z',
      });
      expect(provenance.evidence.claimIds, `${key} claimIds`).toEqual([]);
      expect(provenance.evidence.note, `${key} note`).toMatch(/No entry in the Harpd Evidence Graph/);
    }
  });

  it('lets a caller override the methodology and claim ids', async () => {
    const provenance = await buildProvenance({
      key: 'evidence',
      sourceUrl: 'file:///tmp/evidence.json',
      updatedAt: '2026-09-16',
      methodologyUrl: 'https://harpd.com/methodology/custom/',
      claimIds: ['custom:claim'],
    });
    expect(provenance.evidence.methodologyUrl).toBe('https://harpd.com/methodology/custom/');
    expect(provenance.evidence.claimIds).toEqual(['custom:claim']);
  });
});
