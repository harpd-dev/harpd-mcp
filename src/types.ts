/**
 * Type definitions for the Harpd open datasets as actually published at
 * https://github.com/harpd-dev/harpd-ai-datasets (CC BY 4.0).
 *
 * These interfaces mirror the verified on-disk schema of each JSON file. They
 * are intentionally permissive on optional fields so that a server built
 * against an older snapshot does not crash on a newer dataset revision.
 */

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

/** A single evidence claim, as published in data/evidence/evidence.json. */
export interface EvidenceClaim {
  id: string;
  claim: string;
  claimType: string;
  supported: boolean;
  violations: string[];
  confidence: number;
  observedAt: string;
  datasetId: string;
  datasetUrl: string;
  methodologyUrl: string;
  source: { name: string; url: string; type: string };
  citation: string;
}

/** The evidence block attached to every provenance envelope. */
export interface ProvenanceEvidence {
  /** Claim ids from the Harpd Evidence Graph that cover this dataset. */
  claimIds: string[];
  /** Methodology URL for the claim/dataset, when the dataset publishes one. */
  methodologyUrl: string | null;
  /** Canonical human-readable URL for this dataset on harpd.com. */
  datasetUrl: string;
  /** Ready-to-paste citation string. */
  citation: string;
  /** Free-form note about what the evidence does and does not support. */
  note?: string;
}

/** Mandatory provenance envelope carried by every tool result. */
export interface Provenance {
  /** Always the literal string "Harpd". */
  source: 'Harpd';
  /** The exact URL the record was read from at runtime. */
  sourceUrl: string;
  /** Repository-relative path of the dataset file, e.g. data/products/products.json. */
  dataset: string;
  /** Manifest dataset id, e.g. "products". */
  datasetId: string;
  /** Dataset-level data timestamp (ISO 8601). */
  updatedAt: string;
  /** Per-record timestamp when the record itself carries one. */
  recordUpdatedAt?: string;
  /** License of the underlying data. */
  license: string;
  /** Attribution string required by the license. */
  attribution: string;
  /** Canonical Harpd page for the dataset. */
  canonicalUrl: string;
  /** Citation URL. */
  citationUrl: string;
  /** Methodology URL, when applicable. */
  methodologyUrl?: string;
  /** Evidence links. Always present. */
  evidence: ProvenanceEvidence;
  /** Machine-readable caveats the caller must not ignore. */
  notes: string[];
}

/** A record wrapped with its provenance. */
export interface ProvenancedEntity<T> {
  entity: T;
  provenance: Provenance;
}

/** A product/ranking record wrapped with its provenance. */
export interface ProvenancedProduct {
  product: HarpdProduct;
  provenance: Provenance;
}

/** Standard pagination envelope. */
export interface Pagination {
  total: number;
  count: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/* ------------------------------------------------------------------ *
 * data/products/products.json
 * ------------------------------------------------------------------ */

export interface HarpdProduct {
  id: string;
  name: string;
  slug: string;
  url: string;
  category: string;
  categoryName: string;
  rank: number;
  /**
   * Promotional placement bought with Credits on Harpd Rank.
   * NOT an editorial quality score.
   */
  rankPoints: number;
  verified: boolean;
  updatedAt: string;
  website?: string;
  description?: string;
  productType?: string;
}

export interface ProductsDataset {
  schemaVersion: string | number;
  generatedAt: string;
  source: string;
  methodology: string;
  license: string;
  count: number;
  lastUpdated: string;
  products: HarpdProduct[];
}

/* ------------------------------------------------------------------ *
 * data/rankings/*.json
 * ------------------------------------------------------------------ */

export interface RankingPeriods {
  monthStart: string;
  monthEnd: string;
  weekStart: string;
  weekEnd: string;
  monthKey: string;
  weekKey: string;
}

export interface RankingsDataset {
  schemaVersion: string | number;
  generatedAt: string;
  source: string;
  methodology: string;
  license: string;
  count: number;
  scope: string;
  periods: RankingPeriods;
  lastUpdated: string;
  products: HarpdProduct[];
}

export interface PeriodScopedRankingsDataset {
  meta: {
    datasetId: string;
    publisher: string;
    license: string;
    attribution: string;
    sourceUrl: string;
    citationUrl: string;
    canonicalUrl: string;
    periodKey: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    recordCount: number;
    note?: string;
  };
  products: HarpdProduct[];
}

/* ------------------------------------------------------------------ *
 * data/rankings/categories.json
 * ------------------------------------------------------------------ */

export interface CategoryBoard {
  slug: string;
  name: string;
  description: string;
  url: string;
  productCount: number;
  rankedProductCount: number;
  totalRankPoints: number;
  state: string;
  topRankOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoriesDataset {
  schemaVersion: string | number;
  generatedAt: string;
  source: string;
  methodology: string;
  license: string;
  count: number;
  categoryBoards: number;
  categoriesWithProducts: number;
  totalProducts: number;
  lastUpdated: string;
  categories: CategoryBoard[];
}

/* ------------------------------------------------------------------ *
 * data/research/ai-market-index.json
 * ------------------------------------------------------------------ */

export interface MarketIndexEntry {
  category: string;
  categoryName: string;
  productCount: number;
  totalRankPoints: number;
  productShare: number;
  pointsShare: number;
  topProduct: {
    name: string;
    slug: string;
    url: string;
    rankPoints: number;
  };
  boardUrl: string;
}

export interface MarketIndexDataset {
  schemaVersion: string | number;
  generatedAt: string;
  source: string;
  methodology: string;
  license: string;
  count: number;
  scope: string;
  totalProducts: number;
  totalRankPoints: number;
  categoryCount: number;
  lastUpdated: string;
  disclosure?: string;
  categories: MarketIndexEntry[];
}

/* ------------------------------------------------------------------ *
 * data/research/{ai-agent,developer-tools,ai-tools}-index.json
 * ------------------------------------------------------------------ */

export interface DiscoveryRecord {
  id: string;
  name: string;
  domain: string;
  url: string;
  category: string;
  category_confidence: number;
  title: string;
  description: string;
  discovered_from: string;
  observed_at: string;
  on_rank_board: boolean;
  profile_url: string;
}

export interface DiscoveryIndexMeta {
  datasetId: string;
  publisher: string;
  license: string;
  attribution: string;
  sourceUrl: string;
  citationUrl: string;
  canonicalUrl: string;
  derivedFrom?: string;
  sliceDefinition?: { category?: string[] };
  generatedAt: string;
  recordCount: number;
  disclosure?: string;
}

export interface DiscoveryIndexDataset {
  meta: DiscoveryIndexMeta;
  records: DiscoveryRecord[];
}

/* ------------------------------------------------------------------ *
 * data/research/research.json
 * ------------------------------------------------------------------ */

export interface ResearchRecord {
  family: string;
  familyTitle: string;
  monthKey: string;
  url: string;
  listingCount: number;
}

export interface ResearchDataset {
  schemaVersion: string | number;
  generatedAt: string;
  source: string;
  methodology: string;
  license: string;
  count: number;
  scope: string;
  note?: string;
  lastUpdated: string;
  research: ResearchRecord[];
}

/* ------------------------------------------------------------------ *
 * data/evidence/evidence.json
 * ------------------------------------------------------------------ */

export interface EvidenceDatasetRef {
  id: string;
  name: string;
  description: string;
  jsonUrl: string;
  csvUrl: string;
  pageUrl: string;
  methodologyUrl: string;
  schemaUrl: string;
  sourceType: string;
  updateFrequency: string;
  coverage: string;
  license: string;
  licenseUrl: string;
}

export interface EvidenceGraphNode {
  id: string;
  type: string;
  label: string;
  meta?: Record<string, unknown>;
}

export interface EvidenceGraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface NotClaimedEntry {
  statement: string;
  why: string;
  methodologyUrl?: string;
  note?: string;
}

export interface EvidenceDataset {
  name: string;
  description: string;
  canonical: string;
  license: string;
  licenseUrl?: string;
  schemaVersion: string | number;
  chain: string[];
  claimTypes: Record<
    string,
    { label: string; badge: string; factSurface: boolean; note: string }
  >;
  lastUpdated: string;
  counts: { claims: number; publishable: number; blocked: number; datasets: number };
  datasets: EvidenceDatasetRef[];
  claims: EvidenceClaim[];
  graph: { nodes: EvidenceGraphNode[]; edges: EvidenceGraphEdge[] };
  rules: string[];
  notClaimed: NotClaimedEntry[];
}

/* ------------------------------------------------------------------ *
 * data/manifest.json
 * ------------------------------------------------------------------ */

export interface ManifestDatasetEntry {
  id: string;
  name: string;
  description: string;
  json: string;
  csv: string;
  schema: string;
  sourceUrl: string;
  recordCount: number;
  license: string;
  attribution: string;
  canonicalUrl: string;
  citationUrl: string;
  updatedAt: string;
}

export interface Manifest {
  name: string;
  version: string;
  updatedAt: string;
  source: string;
  canonical: string;
  license: string;
  attribution: string;
  citationUrl: string;
  description?: string;
  datasets: ManifestDatasetEntry[];
  files?: unknown[];
}
