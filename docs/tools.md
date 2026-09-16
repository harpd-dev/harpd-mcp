# Tool reference — harpd-mcp

All 11 tools exposed by `harpd-mcp`, with their input schemas, output fields and
provenance guarantees.

Every tool returns a single JSON text block. Every payload — the envelope **and**
each record inside it — carries a `provenance` block. Nothing is ever returned
as a bare `{ name }`.

---

## Contents

- [Response envelope](#response-envelope)
- [Provenance block](#provenance-block)
- [The two domain rules](#the-two-domain-rules)
- [Tool index](#tool-index)
- [Per-tool reference](#per-tool-reference)
  - [`search_products`](#search_products)
  - [`get_product`](#get_product)
  - [`get_products`](#get_products)
  - [`get_rankings`](#get_rankings)
  - [`get_category_ranking`](#get_category_ranking)
  - [`get_ranking_history`](#get_ranking_history)
  - [`get_ai_agents`](#get_ai_agents)
  - [`get_ai_tools`](#get_ai_tools)
  - [`get_developer_tools`](#get_developer_tools)
  - [`get_research`](#get_research)
  - [`get_evidence`](#get_evidence)

---

## Response envelope

List-shaped tools return:

```jsonc
{
  "tool": "search_products",
  "found": true,
  "query": { /* the normalised inputs, for reproducibility */ },
  "pagination": {
    "total": 13,        // records matching the filter
    "count": 2,         // records in this page
    "offset": 0,
    "limit": 2,
    "hasMore": true,
    "nextOffset": 2     // null on the last page
  },
  "count": 2,
  "results": [ /* ProvenancedProduct[] or ProvenancedEntity[] */ ],
  "provenance": { /* Provenance — the envelope-level block */ },
  "disclaimers": [ /* machine-readable caveats */ ]
}
```

Single-entity tools (`get_product`) return the record at the top level:

```jsonc
{ "tool": "get_product", "found": true, "product": { }, "provenance": { } }
```

## Provenance block

| Field | Type | Meaning |
|---|---|---|
| `source` | `"Harpd"` | Always the literal string `Harpd`. |
| `sourceUrl` | string | The exact URL the record was read from at runtime. |
| `dataset` | string | Repository-relative dataset path, e.g. `data/products/products.json`. |
| `datasetId` | string | Manifest dataset id, e.g. `products`. |
| `updatedAt` | string | Dataset-level data timestamp, as published. |
| `recordUpdatedAt` | string? | The record's own timestamp, when it carries one. |
| `license` | string | `CC BY 4.0`. |
| `attribution` | string | `Harpd (https://harpd.com)`. |
| `canonicalUrl` | string | Canonical Harpd page, always `https://harpd.com/...`. |
| `citationUrl` | string | Citation target. |
| `methodologyUrl` | string? | Published methodology behind the dataset. |
| `evidence` | object | `{ claimIds, methodologyUrl, datasetUrl, citation, note? }`. Always present. |
| `notes` | string[] | Machine-readable caveats. Includes the rankPoints rule for ranking datasets. |

`evidence.claimIds` lists ids from the Harpd Evidence Graph that cover the
dataset. Where the graph does not describe a dataset by name, the list is empty
and `evidence.note` says so rather than attaching a claim that may not apply.
Use [`get_evidence`](#get_evidence) to inspect every published claim.

## The two domain rules

These are enforced in the tool descriptions, in the returned payloads and in the
server's `instructions` string. They are not stylistic.

1. **`rankPoints` are promotional placement bought with Credits on Harpd Rank.
   They are NOT an editorial quality score.** Any tool that orders by
   `rankPoints` says so in its description and adds
   `Ordered by rankPoints (promotional placement bought with Credits). This is
   not a quality ranking.` to `disclaimers`.

2. **There is no multi-month ranking history in this repository.** Harpd
   publishes three live period-scoped board snapshots (overall / monthly /
   weekly). `get_ranking_history` returns the periods the datasets actually
   expose plus an explicit statement of the limitation. It never fabricates a
   trend line.

---

## Tool index

| Tool | Input | Returns | Provenance dataset(s) |
|---|---|---|---|
| `search_products` | `query`, `category`, `verified`, `sort`, `limit`, `offset` | Provenanced products | `data/products/products.json` |
| `get_product` | `id`, `slug`, `name` | One provenanced product | `data/products/products.json` |
| `get_products` | `category`, `verified`, `productType`, `minRankPoints`, `maxRankPoints`, `sort`, `limit`, `offset` | Provenanced products | `data/products/products.json` |
| `get_rankings` | `board`, `category`, `sort`, `limit`, `offset` | Provenanced products + board period | `data/rankings/{overall,monthly,weekly}.json` |
| `get_category_ranking` | `category` *(required)*, `sort`, `limit`, `offset` | Provenanced products + category board | `data/rankings/categories.json` + `data/products/products.json` |
| `get_ranking_history` | `productId`, `productSlug`, `top`, `boards` | Board periods + per-board positions | `data/rankings/{overall,monthly,weekly}.json` |
| `get_ai_agents` | `query`, `category`, `domain`, `onRankBoard`, `minConfidence`, `limit`, `offset` | Provenanced discovery records | `data/research/ai-agent-index.json` |
| `get_ai_tools` | *(same as `get_ai_agents`)* | Provenanced discovery records | `data/research/ai-tools-index.json` |
| `get_developer_tools` | *(same as `get_ai_agents`)* | Provenanced discovery records | `data/research/developer-tools-index.json` |
| `get_research` | `section`, `family`, `monthKey`, `category`, `limit`, `offset` | Provenanced reports + market index rows | `data/research/research.json`, `data/research/ai-market-index.json` |
| `get_evidence` | `claimId`, `query`, `productName`, `datasetId`, `claimType`, `includeGraph`, `limit`, `offset` | Provenanced claims + graph metadata | `data/evidence/evidence.json` |

**Shared limits.** `limit` is `1..200` (default `20`). `offset` is `>= 0`
(default `0`). Both are enforced by the Zod input schema, so out-of-range values
are rejected before any tool handler runs.

---

## Per-tool reference

### `search_products`

Search the product catalog by free text, category and verification state.

| Input | Type | Required | Notes |
|---|---|---|---|
| `query` | string, 1–200 | no | Matched against name, slug, description, productType, website, category name. |
| `category` | string, 1–64 | no | Exact category slug. |
| `verified` | boolean | no | Harpd verification state. |
| `sort` | `relevance` \| `rank` \| `rankPoints` \| `name` | no | Default `relevance`. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

**Output fields** — envelope: `tool`, `found`, `query`, `pagination`, `count`,
`results`, `provenance`, `disclaimers`, `catalog`. Each `results[]` entry:
`{ product, provenance }`.

**Provenance fields** — full [provenance block](#provenance-block) on the
envelope and on every record. `notes` includes the rankPoints rule and, when a
query was supplied, the record's relevance score.

**Example response** (real output, local dataset, `limit: 2`):

```jsonc
{
  "tool": "search_products",
  "found": true,
  "query": { "query": "coding", "category": null, "verified": null, "sort": "rank" },
  "pagination": { "total": 13, "count": 2, "offset": 0, "limit": 2, "hasMore": true, "nextOffset": 2 },
  "count": 2,
  "results": [
    {
      "product": {
        "id": "github-copilot",
        "name": "GitHub Copilot",
        "slug": "github-copilot",
        "url": "https://harpd.com/rank/github-copilot/",
        "category": "developer",
        "categoryName": "Developer",
        "rank": 11,
        "rankPoints": 0,
        "verified": false,
        "updatedAt": "2026-08-27T06:26:17.618Z",
        "website": "https://github.com/features/copilot",
        "description": "An AI coding assistant available across GitHub and supported development environments.",
        "productType": "Coding assistant"
      },
      "provenance": {
        "source": "Harpd",
        "sourceUrl": "file:///…/data/products/products.json",
        "dataset": "data/products/products.json",
        "datasetId": "products",
        "updatedAt": "2026-09-15T03:58:43.395Z",
        "license": "CC BY 4.0",
        "attribution": "Harpd (https://harpd.com)",
        "canonicalUrl": "https://harpd.com/data/",
        "citationUrl": "https://harpd.com/data/",
        "evidence": {
          "claimIds": [],
          "methodologyUrl": "https://harpd.com/rank/methodology/",
          "datasetUrl": "https://harpd.com/data/",
          "citation": "Harpd. \"products dataset.\" https://harpd.com/data/ Accessed: 2026-09-15. License: CC BY 4.0.",
          "note": "No entry in the Harpd Evidence Graph covers this dataset by name, so no claim id is attached. The methodology URL is the published method behind it. Call get_evidence to inspect every published claim."
        },
        "notes": [
          "rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score, and a higher rankPoints value does not mean a better product.",
          "Matched the query with relevance score 18."
        ],
        "recordUpdatedAt": "2026-08-27T06:26:17.618Z",
        "methodologyUrl": "https://harpd.com/rank/methodology/"
      }
    }
  ],
  "provenance": { "…": "same shape, envelope level" },
  "disclaimers": [
    "rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score, and a higher rankPoints value does not mean a better product.",
    "Page size is capped at 200 records; use offset to page through the full set."
  ],
  "catalog": { "totalProducts": 1122, "filteredTotal": 13, "datasetGeneratedAt": "2026-09-16T10:37:21.210Z" }
}
```

---

### `get_product`

| Input | Type | Required | Notes |
|---|---|---|---|
| `id` | string, 1–128 | no | Exact product id, e.g. `imgkit-86d32f3e`. |
| `slug` | string, 1–128 | no | Exact slug. |
| `name` | string, 1–200 | no | Exact, then case-insensitive, then substring. |

At least one selector is required; otherwise the tool returns an `isError` result
naming the requirement.

**Output fields** — `tool`, `found`, `product`, `provenance`, `disclaimers`.

**Not found** is a normal result, not an error:

```jsonc
{
  "found": false,
  "tool": "get_product",
  "message": "No product in the Harpd product catalog matches that selector. The catalog is not exhaustive: many AI products exist that Harpd has not listed.",
  "selector": { "id": "definitely-not-a-real-product-id", "slug": null, "name": null },
  "provenance": { /* still present */ },
  "hint": "Use search_products with a free-text query to find the correct id or slug."
}
```

**Provenance fields** — full block, plus `recordUpdatedAt` set from the
product's own `updatedAt`.

---

### `get_products`

| Input | Type | Required | Notes |
|---|---|---|---|
| `category` | string, 1–64 | no | Exact category slug. |
| `verified` | boolean | no | |
| `productType` | string, 1–120 | no | Substring match, e.g. `Design platform`. |
| `minRankPoints` | integer, >= 0 | no | |
| `maxRankPoints` | integer, >= 0 | no | |
| `sort` | `rank` \| `rankPoints` \| `name` | no | Default `rank`. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

Returns `isError` when `minRankPoints > maxRankPoints`.

**Output fields** — as [`search_products`](#search_products), with `catalog`
instead of relevance notes.

**Provenance fields** — full block per record and per envelope. Sorting by
`rankPoints` appends the promotional-placement disclaimer.

---

### `get_rankings`

| Input | Type | Required | Notes |
|---|---|---|---|
| `board` | `overall` \| `monthly` \| `weekly` | no | Default `overall`. |
| `category` | string, 1–64 | no | |
| `sort` | `rank` \| `rankPoints` \| `name` | no | Default `rank`. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

**Output fields** — the standard envelope plus a `board` object:

```jsonc
"board": {
  "board": "overall",
  "dataset": "data/rankings/overall.json",
  "datasetId": "rankings-overall",
  "sourceUrl": "…",
  "updatedAt": "2026-09-15T03:58:43.395Z",
  "scope": "overall",
  "periodKey": "2026-09",
  "periodStart": "2026-09-01T00:00:00.000Z",
  "periodEnd": "2026-10-01T00:00:00.000Z",
  "monthKey": "2026-09",
  "weekKey": "2026-W38",
  "recordCount": 1122,
  "note": null
}
```

**Provenance fields** — full block. `evidence.claimIds` contains the ranking
claims (`rank:points-rule`, `rank:dataset-coverage`) because the Evidence Graph
describes that dataset as *"rank position, Rank Points (promotional placement),
category, verification state and per-record updatedAt"* — the exact shape of the
board files.

---

### `get_category_ranking`

| Input | Type | Required | Notes |
|---|---|---|---|
| `category` | string, 1–64 | **yes** | One of the 28 published slugs. Accepts the display name too. |
| `sort` | `rank` \| `rankPoints` \| `name` | no | Default `rank`. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

**Output fields** — envelope plus `category` (the board record),
`categoryProvenance` (provenance for that board record) and `categoryStats`
(`productCount`, `rankedProductCount`, `totalRankPoints`, `state`,
`topRankOpen`, `boardUrl`).

**Invalid category** is a normal result listing the valid slugs:

```jsonc
{
  "found": false,
  "message": "\"not-a-real-category\" is not one of the published Harpd category boards.",
  "availableCategories": [ { "slug": "seo", "name": "SEO", "url": "…", "productCount": 60 }, /* …28 total */ ],
  "provenance": { /* still present */ },
  "hint": "Call get_category_ranking again with one of the slugs in availableCategories."
}
```

**Provenance fields** — products carry `data/products/products.json`
provenance; the board record carries `data/rankings/categories.json`
provenance.

---

### `get_ranking_history`

| Input | Type | Required | Notes |
|---|---|---|---|
| `productId` | string, 1–128 | no | Locate this product across boards. |
| `productSlug` | string, 1–128 | no | |
| `top` | integer, 0–50 | no | Also return the head of each board. Default 0. |
| `boards` | array of `overall`/`monthly`/`weekly` | no | Default all three. |

**Output fields**

| Field | Meaning |
|---|---|
| `granularity.kind` | `"period-scoped live board snapshots"` |
| `granularity.snapshots` | Number of boards read (3). |
| `granularity.distinctPeriods` | The period keys that actually exist, e.g. `["2026-09","2026-W38"]`. |
| `granularity.historicalTimeSeriesAvailable` | Always `false`. |
| `granularity.explanation` | Why no trend can be derived. |
| `limitation` | Full statement of the limitation, including the archive URL Harpd publishes. |
| `boards[]` | Per-board `{ board, dataset, periodKey, periodStart, periodEnd, recordCount, … }`. |
| `positions[]` | Per product: `{ product, boards: { overall: { rank, rankPoints, periodKey, dataset, … } \| null }, provenance }`. |
| `topByBoard` | Present when `top > 0`. Provenanced products per board. |
| `rankPointsDisclaimer` | The rankPoints rule. |
| `disclaimers[]` | Includes the limitation and a note that board-to-board differences reflect period windows and promotional placement, not quality change. |

**Honest scope.** The tool returns only the periods present in the files. It does
not synthesise earlier periods, interpolate, or extrapolate. A product absent
from every requested board returns `found: false` with the message *"No history
is inferred."*

**Provenance fields** — envelope provenance from the first requested board; each
`positions[].provenance` from the board the record was read from.

---

### `get_ai_agents` / `get_ai_tools` / `get_developer_tools`

All three share one input schema and one implementation.

| Input | Type | Required | Notes |
|---|---|---|---|
| `query` | string, 1–200 | no | Matched against name, domain, title, description. |
| `category` | string, 1–64 | no | e.g. `agents`, `developer`, `ai-media`. |
| `domain` | string, 1–253 | no | Exact or suffix match. |
| `onRankBoard` | boolean | no | Whether the record also appears on the Rank board. |
| `minConfidence` | number, 0–1 | no | `category_confidence` floor. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

| Tool | Dataset | Records |
|---|---|---|
| `get_ai_agents` | `data/research/ai-agent-index.json` | 334 |
| `get_ai_tools` | `data/research/ai-tools-index.json` | 693 |
| `get_developer_tools` | `data/research/developer-tools-index.json` | 1918 |

**Output fields** — envelope plus `slice`:

```jsonc
"slice": {
  "datasetId": "ai-agent-index",
  "dataset": "data/research/ai-agent-index.json",
  "derivedFrom": "Harpd Product Discovery Index (discovery-index.json)",
  "sliceDefinition": { "category": ["agents"] },
  "recordCount": 334,
  "filteredTotal": 334,
  "sourceUrl": "https://harpd.com/discovery/",
  "disclosure": "Coverage view sliced from the Harpd Product Discovery Index by product category. Not a ranking."
}
```

**Provenance fields** — full block per record. Each record's `entity` includes
`observed_at`, `discovered_from`, `category_confidence`, `on_rank_board` and
`profile_url`. `disclaimers` always states this is a coverage list, not a
ranking.

---

### `get_research`

| Input | Type | Required | Notes |
|---|---|---|---|
| `section` | `reports` \| `market-index` \| `all` | no | Default `reports`. |
| `family` | string, 1–120 | no | e.g. `ai-market-index`. |
| `monthKey` | string, `^\d{4}-\d{2}$` | no | e.g. `2026-08`. |
| `category` | string, 1–64 | no | Market index filter. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

**Output fields**

- `reports` — `{ dataset, pagination, count, results, provenance, availableFamilies, availableMonths, note }`
- `marketIndex` — `{ dataset, pagination, count, results, provenance, totalProducts, totalRankPoints, categoryCount, disclosure }`
- Envelope-level `provenance`, `pagination`, `count`, `found`, `disclaimers`.

**Provenance fields** — reports carry `data/research/research.json`
provenance; market index rows carry `data/research/ai-market-index.json`
provenance and a note that `pointsShare` is a share of promotional placement,
not of quality.

---

### `get_evidence`

| Input | Type | Required | Notes |
|---|---|---|---|
| `claimId` | string, 1–200 | no | Exact claim id. |
| `query` | string, 1–200 | no | Matched against claim text, ids, source and methodology URLs. |
| `productName` | string, 1–200 | no | Resolves a catalog product and attaches the evidence covering it. |
| `datasetId` | string, 1–120 | no | Evidence Graph dataset id, e.g. `rank`. |
| `claimType` | `MEASURED` \| `OBSERVED` \| `CALCULATED` \| `MODELED` \| `EDITORIAL` \| `USER_SUBMITTED` | no | |
| `includeGraph` | boolean | no | Default `false`. |
| `limit` | integer, 1–200 | no | Default 20. |
| `offset` | integer, >= 0 | no | Default 0. |

**Output fields**

| Field | Meaning |
|---|---|
| `results[]` | `{ entity: EvidenceClaim, provenance }`. |
| `evidenceGraph` | `dataset`, `name`, `description`, `canonical`, `schemaVersion`, `chain`, `claimTypes`, `counts`, `rules`, `notClaimed`, `datasets`. |
| `graph` | Present when `includeGraph: true` — the nodes and edges touching the matched claims. |
| `productEvidence[]` | Present when `productName` is set: `{ product, provenance, claims[], notClaimed[], rankPointsNote }`. |

**Provenance fields** — full block per claim, with `evidence.claimIds` set to
that claim's id and `evidence.methodologyUrl` set to the claim's own methodology
URL. This is the one tool where claims are the subject rather than a link.

`notClaimed` is always returned. It is the honest counterpart to the claims: the
statements Harpd explicitly refuses to make, including *"That a higher-ranked
product on Harpd Rank is a better product."*
