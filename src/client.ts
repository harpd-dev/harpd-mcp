/**
 * Harpd dataset client.
 *
 * Responsibilities:
 *  1. Fetch Harpd's open datasets from a configurable base (raw GitHub by
 *     default, `file://` or any HTTP(S) base via `HARPD_DATA_BASE`).
 *  2. Keep a small on-disk TTL cache so a long-lived MCP server does not
 *     re-download multi-hundred-KB JSON files on every tool call.
 *  3. Attach mandatory provenance to every record and every envelope through
 *     the shared `withProvenance()` helper.
 *
 * Domain rule encoded here and surfaced on every result: `rankPoints` are
 * promotional placement bought with Credits on Harpd Rank. They are NOT an
 * editorial quality score and must never be presented as one.
 */

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import type {
  CategoriesDataset,
  DiscoveryIndexDataset,
  EvidenceDataset,
  HarpdProduct,
  Manifest,
  MarketIndexDataset,
  PeriodScopedRankingsDataset,
  ProductsDataset,
  Provenance,
  ProvenanceEvidence,
  RankingsDataset,
  ResearchDataset,
} from './types.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** Default raw base: the public GitHub mirror of Harpd's open datasets. */
export const DEFAULT_DATA_BASE =
  'https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/';

export const HARPD_SITE = 'https://harpd.com/';
export const HARPD_DATA_PAGE = 'https://harpd.com/data/';
export const HARPD_RANK_METHODOLOGY = 'https://harpd.com/rank/methodology/';
export const HARPD_RANK_HISTORY = 'https://harpd.com/rank/history/';
export const HARPD_EVIDENCE_PAGE = 'https://harpd.com/evidence/';
export const HARPD_DISCOVERY_PAGE = 'https://harpd.com/discovery/';
export const ATTRIBUTION = 'Harpd (https://harpd.com)';
export const LICENSE = 'CC BY 4.0';
export const SOURCE_NAME = 'Harpd' as const;

/** The single most important caveat in this whole server. */
export const RANK_POINTS_DISCLAIMER =
  'rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score, and a higher rankPoints value does not mean a better product.';

/** Why history tools cannot return a real multi-month time series. */
export const HISTORY_LIMITATION =
  'This repository publishes three live board snapshots (overall / monthly / weekly), each scoped to its current period window. It does NOT contain a multi-month historical time series, so no month-over-month trend can be derived from it. Harpd states that historical archives live at ' +
  HARPD_RANK_HISTORY +
  '. Anything beyond the periods listed in this response would have to be fabricated, so it is not returned.';

/* ------------------------------------------------------------------ *
 * Dataset registry
 * ------------------------------------------------------------------ */

export type DatasetKey =
  | 'manifest'
  | 'products'
  | 'rankings-overall'
  | 'rankings-monthly'
  | 'rankings-weekly'
  | 'categories'
  | 'ai-market-index'
  | 'ai-agent-index'
  | 'developer-tools-index'
  | 'ai-tools-index'
  | 'research-index'
  | 'evidence';

interface DatasetDefinition {
  id: string;
  key: DatasetKey;
  path: string;
  canonicalUrl: string;
  citationUrl: string;
  license: string;
  attribution: string;
  methodologyUrl?: string;
  /** Pull the dataset-level data timestamp out of whichever field this file uses. */
  updatedAt: (data: unknown) => string;
  notes?: string[];
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const pickTimestamp = (data: unknown): string => {
  const record = asRecord(data);
  const meta = asRecord(record.meta);
  return asString(
    record.lastUpdated ?? record.generatedAt ?? meta.generatedAt ?? record.updatedAt,
    '',
  );
};

export const DATASET_REGISTRY: Record<DatasetKey, DatasetDefinition> = {
  manifest: {
    id: 'manifest',
    key: 'manifest',
    path: 'data/manifest.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    updatedAt: (data) => asString(asRecord(data).updatedAt),
  },
  products: {
    id: 'products',
    key: 'products',
    path: 'data/products/products.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    methodologyUrl: HARPD_RANK_METHODOLOGY,
    updatedAt: pickTimestamp,
    notes: [RANK_POINTS_DISCLAIMER],
  },
  'rankings-overall': {
    id: 'rankings-overall',
    key: 'rankings-overall',
    path: 'data/rankings/overall.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    methodologyUrl: HARPD_RANK_METHODOLOGY,
    updatedAt: pickTimestamp,
    notes: [RANK_POINTS_DISCLAIMER],
  },
  'rankings-monthly': {
    id: 'rankings-monthly',
    key: 'rankings-monthly',
    path: 'data/rankings/monthly.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    methodologyUrl: HARPD_RANK_METHODOLOGY,
    updatedAt: pickTimestamp,
    notes: [RANK_POINTS_DISCLAIMER],
  },
  'rankings-weekly': {
    id: 'rankings-weekly',
    key: 'rankings-weekly',
    path: 'data/rankings/weekly.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    methodologyUrl: HARPD_RANK_METHODOLOGY,
    updatedAt: pickTimestamp,
    notes: [RANK_POINTS_DISCLAIMER],
  },
  categories: {
    id: 'categories',
    key: 'categories',
    path: 'data/rankings/categories.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    methodologyUrl: HARPD_RANK_METHODOLOGY,
    updatedAt: pickTimestamp,
    notes: [RANK_POINTS_DISCLAIMER],
  },
  'ai-market-index': {
    id: 'ai-market-index',
    key: 'ai-market-index',
    path: 'data/research/ai-market-index.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    methodologyUrl: HARPD_RANK_METHODOLOGY,
    updatedAt: pickTimestamp,
    notes: [
      RANK_POINTS_DISCLAIMER,
      'productShare and pointsShare describe the composition of the Harpd board. pointsShare is a share of promotional placement, not of market quality.',
    ],
  },
  'ai-agent-index': {
    id: 'ai-agent-index',
    key: 'ai-agent-index',
    path: 'data/research/ai-agent-index.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    updatedAt: pickTimestamp,
    notes: [
      'Coverage view sliced from the Harpd Product Discovery Index by product category. This is a coverage list, NOT a ranking.',
    ],
  },
  'developer-tools-index': {
    id: 'developer-tools-index',
    key: 'developer-tools-index',
    path: 'data/research/developer-tools-index.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    updatedAt: pickTimestamp,
    notes: [
      'Coverage view sliced from the Harpd Product Discovery Index by product category. This is a coverage list, NOT a ranking.',
    ],
  },
  'ai-tools-index': {
    id: 'ai-tools-index',
    key: 'ai-tools-index',
    path: 'data/research/ai-tools-index.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    updatedAt: pickTimestamp,
    notes: [
      'Coverage view sliced from the Harpd Product Discovery Index by product category. This is a coverage list, NOT a ranking.',
    ],
  },
  'research-index': {
    id: 'research-index',
    key: 'research-index',
    path: 'data/research/research.json',
    canonicalUrl: HARPD_DATA_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    updatedAt: pickTimestamp,
    notes: [
      'One record per published monthly research report. Reports exist only for closed months with enough ranked products in the family scope.',
    ],
  },
  evidence: {
    id: 'evidence',
    key: 'evidence',
    path: 'data/evidence/evidence.json',
    canonicalUrl: HARPD_EVIDENCE_PAGE,
    citationUrl: HARPD_DATA_PAGE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    updatedAt: pickTimestamp,
  },
};

/* ------------------------------------------------------------------ *
 * Base URL resolution
 * ------------------------------------------------------------------ */

/** Resolve the configured data base, always with a trailing slash. */
export function dataBase(): string {
  const raw = process.env.HARPD_DATA_BASE?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_DATA_BASE;
  return base.endsWith('/') ? base : `${base}/`;
}

/** Build the full source URL for a repository-relative dataset path. */
export function resolveSourceUrl(datasetPath: string): string {
  return `${dataBase()}${datasetPath.replace(/^\/+/, '')}`;
}

function isFileUrl(url: string): boolean {
  return url.startsWith('file://');
}

function fileUrlToPath(url: string): string {
  let rest = url.slice('file://'.length);
  // file://host/path -> /path (we only support empty/localhost authority)
  if (!rest.startsWith('/')) {
    const slash = rest.indexOf('/');
    rest = slash === -1 ? '/' : rest.slice(slash);
  }
  return decodeURIComponent(rest);
}

/* ------------------------------------------------------------------ *
 * TTL cache
 * ------------------------------------------------------------------ */

interface CacheEnvelope {
  url: string;
  fetchedAt: number;
  body: unknown;
}

export interface LoadResult<T> {
  data: T;
  definition: DatasetDefinition;
  sourceUrl: string;
  fetchedAt: string;
  fromCache: boolean;
  stale: boolean;
  warnings: string[];
}

function cacheDir(): string {
  return process.env.HARPD_CACHE_DIR?.trim() || path.join(os.homedir(), '.cache', 'harpd-mcp');
}

function cacheTtlMs(): number {
  const raw = Number(process.env.HARPD_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 60 * 60 * 1000;
}

function cachePathFor(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 20);
  return path.join(cacheDir(), `${hash}.json`);
}

async function readCache(url: string): Promise<CacheEnvelope | null> {
  try {
    const raw = await fs.readFile(cachePathFor(url), 'utf8');
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(url: string, body: unknown): Promise<string[]> {
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    const envelope: CacheEnvelope = { url, fetchedAt: Date.now(), body };
    await fs.writeFile(cachePathFor(url), JSON.stringify(envelope), 'utf8');
    return [];
  } catch (error) {
    return [`Could not write the local cache (${(error as Error).message}); data was served fresh but will be re-fetched next call.`];
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'harpd-mcp' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return (await response.json()) as unknown;
}

/**
 * Load a dataset, preferring the on-disk TTL cache.
 *
 * `file://` bases bypass the cache entirely so that local/offline runs are
 * deterministic and always reflect the file on disk.
 */
export async function loadDataset<T = unknown>(key: DatasetKey): Promise<LoadResult<T>> {
  const definition = DATASET_REGISTRY[key];
  const url = resolveSourceUrl(definition.path);
  const warnings: string[] = [];

  if (isFileUrl(url)) {
    const filePath = fileUrlToPath(url);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new Error(
        `Could not read local dataset "${filePath}" (${(error as Error).message}). ` +
          `Check that HARPD_DATA_BASE points at a harpd-ai-datasets checkout.`,
      );
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch (error) {
      throw new Error(`Local dataset "${filePath}" is not valid JSON: ${(error as Error).message}`);
    }
    return {
      data: data as T,
      definition,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      stale: false,
      warnings,
    };
  }

  const cached = await readCache(url);
  const ttl = cacheTtlMs();
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return {
      data: cached.body as T,
      definition,
      sourceUrl: url,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      fromCache: true,
      stale: false,
      warnings,
    };
  }

  try {
    const body = await fetchJson(url);
    warnings.push(...(await writeCache(url, body)));
    return {
      data: body as T,
      definition,
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      stale: false,
      warnings,
    };
  } catch (error) {
    if (cached) {
      warnings.push(
        `Live fetch failed (${(error as Error).message}). Served the cached copy from ${new Date(cached.fetchedAt).toISOString()}, which may be stale.`,
      );
      return {
        data: cached.body as T,
        definition,
        sourceUrl: url,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        fromCache: true,
        stale: true,
        warnings,
      };
    }
    throw new Error(
      `Could not load "${definition.path}" from ${url} (${(error as Error).message}). ` +
        `No cached copy is available. Set HARPD_DATA_BASE to a reachable mirror or a file:// checkout.`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

/** Evidence claims covering a dataset, keyed by the Evidence Graph's dataset id. */
let evidenceIndexPromise: Promise<Map<string, { claimIds: string[]; methodologyUrl: string | null }>> | null =
  null;

/**
 * The Harpd Evidence Graph keys its claims by Harpd's own dataset ids, which do
 * not always match the file names in this repository. The mappings below are
 * taken from the Evidence Graph's own dataset descriptions — nothing here is
 * guessed:
 *
 *   - "rank"       — "One record per approved product on Harpd Rank: rank
 *                     position, Rank Points (promotional placement), category,
 *                     verification state and per-record updatedAt." That is
 *                     exactly the record shape of the three board files.
 *   - "products"   — "Product entities in the Harpd dataset: name, slug,
 *                     category, capabilities, verification state, profile URL."
 *   - "categories" — "Harpd categories with product counts and board URLs."
 *   - "research"   — "One record per published monthly research report..."
 *
 * Any dataset with no unambiguous counterpart is left unmapped, so its
 * provenance carries an empty claimIds list and says so rather than attaching
 * a claim that may not apply.
 */
const EVIDENCE_DATASET_ALIASES: Partial<Record<DatasetKey, string[]>> = {
  'rankings-overall': ['rank'],
  'rankings-monthly': ['rank'],
  'rankings-weekly': ['rank'],
  products: ['products'],
  categories: ['categories'],
  'research-index': ['research'],
};

async function evidenceIndex(): Promise<Map<string, { claimIds: string[]; methodologyUrl: string | null }>> {
  if (!evidenceIndexPromise) {
    evidenceIndexPromise = (async () => {
      const index = new Map<string, { claimIds: string[]; methodologyUrl: string | null }>();
      try {
        const { data } = await loadDataset<EvidenceDataset>('evidence');
        for (const claim of data.claims ?? []) {
          if (!claim || typeof claim.datasetId !== 'string') continue;
          const entry = index.get(claim.datasetId) ?? { claimIds: [], methodologyUrl: null };
          entry.claimIds.push(claim.id);
          if (typeof claim.methodologyUrl === 'string' && claim.methodologyUrl.length > 0) {
            entry.methodologyUrl = claim.methodologyUrl;
          }
          index.set(claim.datasetId, entry);
        }
      } catch {
        // Evidence is a bonus link, never a hard dependency. Degrade silently.
      }
      return index;
    })();
  }
  return evidenceIndexPromise;
}

/** All Evidence Graph dataset ids that cover a repository dataset. */
function evidenceIdsFor(key: DatasetKey): string[] {
  const definition = DATASET_REGISTRY[key];
  return [definition.id, ...(EVIDENCE_DATASET_ALIASES[key] ?? [])];
}

/** Reset memoised state. Used by tests. */
export function resetClientCaches(): void {
  evidenceIndexPromise = null;
  manifestPromise = null;
}

/** Citation string for a dataset. */
export function citationFor(definition: DatasetDefinition, updatedAt: string): string {
  const date = updatedAt ? updatedAt.slice(0, 10) : 'n.d.';
  return `Harpd. "${definition.id} dataset." ${HARPD_DATA_PAGE} Accessed: ${date}. License: ${definition.license}.`;
}

/** Input to `withProvenance`. */
export interface ProvenanceContext {
  /** Dataset key used to resolve dataset path / license / attribution. */
  key: DatasetKey;
  /** The exact URL the record was read from. */
  sourceUrl: string;
  /** Dataset-level data timestamp. */
  updatedAt: string;
  /** Per-record timestamp, when the record carries one. */
  recordUpdatedAt?: string;
  /** Extra notes appended to the mandatory disclaimers. */
  notes?: string[];
  /** Override the methodology URL (e.g. a claim-specific methodology). */
  methodologyUrl?: string | null;
  /** Override claim ids (e.g. when the evidence tool already knows them). */
  claimIds?: string[];
  /** Override the canonical dataset URL. */
  canonicalUrl?: string;
  /** Override the citation URL. */
  citationUrl?: string;
  /** Override the license. */
  license?: string;
  /** Override the attribution. */
  attribution?: string;
}

/** Build a provenance envelope. Prefer `withProvenance` for record wrapping. */
export async function buildProvenance(ctx: ProvenanceContext): Promise<Provenance> {
  const definition = DATASET_REGISTRY[ctx.key];
  const index = await evidenceIndex();

  const matched = evidenceIdsFor(ctx.key)
    .map((id) => index.get(id))
    .filter((entry): entry is { claimIds: string[]; methodologyUrl: string | null } => entry !== undefined);

  const indexedClaimIds = matched.flatMap((entry) => entry.claimIds);
  const indexedMethodology = matched.find((entry) => entry.methodologyUrl)?.methodologyUrl ?? null;

  const claimIds = ctx.claimIds ?? indexedClaimIds;
  const methodologyUrl =
    ctx.methodologyUrl !== undefined
      ? ctx.methodologyUrl
      : indexedMethodology ?? definition.methodologyUrl ?? null;

  const updatedAt = ctx.updatedAt || new Date(0).toISOString();

  const evidence: ProvenanceEvidence = {
    claimIds,
    methodologyUrl,
    datasetUrl: ctx.canonicalUrl ?? definition.canonicalUrl,
    citation: citationFor(definition, updatedAt),
  };
  if (claimIds.length === 0) {
    evidence.note =
      'No entry in the Harpd Evidence Graph covers this dataset by name, so no claim id is attached. ' +
      'The methodology URL is the published method behind it. Call get_evidence to inspect every published claim.';
  }

  const notes = [...(definition.notes ?? []), ...(ctx.notes ?? [])];

  const provenance: Provenance = {
    source: SOURCE_NAME,
    sourceUrl: ctx.sourceUrl,
    dataset: definition.path,
    datasetId: definition.id,
    updatedAt,
    license: ctx.license ?? definition.license,
    attribution: ctx.attribution ?? definition.attribution,
    canonicalUrl: ctx.canonicalUrl ?? definition.canonicalUrl,
    citationUrl: ctx.citationUrl ?? definition.citationUrl,
    evidence,
    notes,
  };
  if (ctx.recordUpdatedAt) provenance.recordUpdatedAt = ctx.recordUpdatedAt;
  const effectiveMethodology = methodologyUrl ?? definition.methodologyUrl;
  if (effectiveMethodology) provenance.methodologyUrl = effectiveMethodology;

  return provenance;
}

/**
 * THE shared provenance wrapper. Every tool result — per record and per
 * envelope — goes through this. Nothing is ever returned bare.
 */
export function withProvenance<T>(
  entity: T,
  ctx: ProvenanceContext,
  entityKey: 'product',
): Promise<{ product: T; provenance: Provenance }>;
export function withProvenance<T>(
  entity: T,
  ctx: ProvenanceContext,
  entityKey?: 'entity',
): Promise<{ entity: T; provenance: Provenance }>;
export async function withProvenance<T>(
  entity: T,
  ctx: ProvenanceContext,
  entityKey: 'product' | 'entity' = 'entity',
): Promise<{ product?: T; entity?: T; provenance: Provenance }> {
  const provenance = await buildProvenance(ctx);
  return entityKey === 'product' ? { product: entity, provenance } : { entity, provenance };
}

/** Convenience wrapper for product/ranking rows. */
export function withProductProvenance(
  product: HarpdProduct,
  ctx: Omit<ProvenanceContext, 'recordUpdatedAt'>,
): Promise<{ product: HarpdProduct; provenance: Provenance }> {
  return withProvenance<HarpdProduct>(product, { ...ctx, recordUpdatedAt: product.updatedAt }, 'product');
}

/* ------------------------------------------------------------------ *
 * Typed loaders
 * ------------------------------------------------------------------ */

export const loadProducts = () => loadDataset<ProductsDataset>('products');
export const loadOverallRankings = () => loadDataset<RankingsDataset>('rankings-overall');
export const loadMonthlyRankings = () => loadDataset<PeriodScopedRankingsDataset>('rankings-monthly');
export const loadWeeklyRankings = () => loadDataset<PeriodScopedRankingsDataset>('rankings-weekly');
export const loadCategories = () => loadDataset<CategoriesDataset>('categories');
export const loadMarketIndex = () => loadDataset<MarketIndexDataset>('ai-market-index');
export const loadAgentsIndex = () => loadDataset<DiscoveryIndexDataset>('ai-agent-index');
export const loadDeveloperToolsIndex = () => loadDataset<DiscoveryIndexDataset>('developer-tools-index');
export const loadAiToolsIndex = () => loadDataset<DiscoveryIndexDataset>('ai-tools-index');
export const loadResearch = () => loadDataset<ResearchDataset>('research-index');
export const loadEvidence = () => loadDataset<EvidenceDataset>('evidence');

let manifestPromise: Promise<Manifest | null> | null = null;

/** Load the manifest, tolerating absence (it is an enrichment, not a dependency). */
export async function loadManifestSafe(): Promise<Manifest | null> {
  if (!manifestPromise) {
    manifestPromise = loadDataset<Manifest>('manifest')
      .then((result) => result.data)
      .catch(() => null);
  }
  return manifestPromise;
}

/* ------------------------------------------------------------------ *
 * Shared helpers used by tools
 * ------------------------------------------------------------------ */

/** Normalise a free-text query for matching. */
export function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/** Does `haystack` contain `needle`, case-insensitively? */
export function contains(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export interface Paginated<T> {
  items: T[];
  pagination: {
    total: number;
    count: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

/** Slice a list and describe the slice. */
export function paginate<T>(items: T[], offset: number, limit: number): Paginated<T> {
  const total = items.length;
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(1, Math.floor(limit));
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  const hasMore = safeOffset + slice.length < total;
  return {
    items: slice,
    pagination: {
      total,
      count: slice.length,
      offset: safeOffset,
      limit: safeLimit,
      hasMore,
      nextOffset: hasMore ? safeOffset + slice.length : null,
    },
  };
}

/**
 * Order products by rankPoints, descending, and be explicit that this is an
 * ordering by promotional placement rather than by quality.
 */
export function orderByRankPoints(products: HarpdProduct[]): HarpdProduct[] {
  return [...products].sort((a, b) => b.rankPoints - a.rankPoints || a.name.localeCompare(b.name));
}

/** Order products by board position (rank ascending). */
export function orderByRank(products: HarpdProduct[]): HarpdProduct[] {
  return [...products].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
