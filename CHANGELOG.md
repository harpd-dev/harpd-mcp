# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-09-16

First release. A read-only MCP server over stdio that exposes Harpd's open AI
datasets to AI agents.

### Added

- **11 MCP tools**, all with Zod input validation and a 200-record page cap:
  - `search_products` — free-text / category search over the 1,122-product catalog.
  - `get_product` — one product by id, slug or name.
  - `get_products` — paginated catalog listing with category, verification,
    product-type and rankPoints-range filters.
  - `get_rankings` — a Harpd Rank board (overall / monthly / weekly) with its
    published period metadata.
  - `get_category_ranking` — one of the 28 category boards, with board stats.
  - `get_ranking_history` — cross-board comparison that reports the periods that
    genuinely exist and states the granularity limitation.
  - `get_ai_agents` — the 334-record AI-agent Discovery Index slice.
  - `get_ai_tools` — the 693-record AI-tools Discovery Index slice.
  - `get_developer_tools` — the 1,918-record developer-tools Discovery Index slice.
  - `get_research` — monthly research reports plus the AI Market Index.
  - `get_evidence` — the Harpd Evidence Graph: claims, chain, rules and the
    statements Harpd explicitly does not make.
- **Mandatory provenance on every result.** A shared `withProvenance()` /
  `withProductProvenance()` helper in `src/client.ts` attaches `source`,
  `sourceUrl`, `dataset` path, `datasetId`, `updatedAt`, `recordUpdatedAt`,
  `license`, `attribution`, `canonicalUrl`, `citationUrl`, `methodologyUrl`,
  `evidence` and `notes` to every envelope and every record. No code path
  returns a bare record.
- **Runtime dataset loading** with an on-disk TTL cache, a stale-cache fallback
  when a live fetch fails, and a `HARPD_DATA_BASE` override supporting
  `https://`, `http://` and `file://` bases.
- **Evidence Graph linkage.** Claims are attached to datasets where the graph
  describes that dataset; datasets with no unambiguous counterpart carry an
  empty `claimIds` list and a note saying so, rather than borrowing a claim.
- **Graceful not-found handling.** An unknown product or category returns a
  structured `found: false` payload listing the valid options instead of an
  error.
- **Runnable examples** in `examples/`, including `raw-stdio.mjs`, a
  zero-dependency script that speaks raw JSON-RPC over stdio and proves the
  server works without any MCP client library.
- **84 tests** across 2 files, run against the real datasets over a `file://`
  base: tool discovery, input validation, result shape, not-found paths,
  pagination boundaries, provenance coverage and URL well-formedness.
- Repository hygiene: MIT `LICENSE`, `CITATION.cff`, `CONTRIBUTING.md`,
  `SECURITY.md`, `docs/tools.md`, ESLint flat config and a GitHub Actions
  workflow running install → lint → build → test.

### Notes

- The data served by this server is published by Harpd under **CC BY 4.0** and
  is not covered by this repository's MIT licence.
- `rankPoints` are promotional placement bought with Credits on Harpd Rank, not
  an editorial quality score. This rule is encoded in the tool descriptions, the
  server instructions and the returned disclaimers.
- The dataset repository contains three live period-scoped board snapshots, not
  a multi-month history. `get_ranking_history` reports that limitation rather
  than deriving a trend.

[Unreleased]: https://github.com/harpd-dev/harpd-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/harpd-dev/harpd-mcp/releases/tag/v0.1.0
