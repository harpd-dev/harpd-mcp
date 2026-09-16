# harpd-mcp

**Query Harpd's public AI product, ranking, research and evidence datasets directly from AI agents.**

[![Powered by Harpd Data](https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/assets/powered-by-harpd-data.svg)](https://harpd.com/data/)

[![CI](https://github.com/harpd-dev/harpd-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/harpd-dev/harpd-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Data: CC BY 4.0](https://img.shields.io/badge/Data-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![MCP](https://img.shields.io/badge/MCP-stdio-blue.svg)](https://modelcontextprotocol.io)

`harpd-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server.
It gives an AI agent 11 tools for reading Harpd's open datasets — 1,122 AI
products, three Rank boards, 28 category boards, three Discovery Index slices,
the AI Market Index, published research and the Evidence Graph — over **stdio**,
with **mandatory provenance on every single result**.

```bash
git clone https://github.com/harpd-dev/harpd-mcp && cd harpd-mcp
npm install && npm run build
node examples/raw-stdio.mjs   # zero-dependency proof it works
```

---

## The problem this solves

Harpd publishes its data openly at [harpd.com/data](https://harpd.com/data/) and
mirrors it to GitHub as raw JSON under CC BY 4.0. That is great for a developer
who already knows the repository exists.

It is useless to an AI agent. An agent asked *"which AI coding assistants are
listed, and can you back that up?"* cannot `curl` a URL it has never heard of.
In practice the agent either says it has no data, or — far worse — answers from
training-data recall and states a confident, unsourced, possibly stale fact about
a product.

`harpd-mcp` closes that gap. It turns the datasets into callable tools, so the
agent retrieves the current record instead of remembering one.

## Why it exists

Three design decisions separate this from "wrap a JSON file in a tool":

**1. Provenance is not optional.** Every response — the envelope *and* every
record inside it — carries a `provenance` block with `source`, `sourceUrl`,
`dataset` (the file path), `updatedAt`, `license`, `attribution` and `evidence`.
There is no code path that returns a bare `{ name }`. An agent that quotes Harpd
data can always say where it came from, when it was published, and under what
licence.

**2. The two domain rules are encoded, not documented.** They appear in the tool
descriptions the model actually reads, in the server `instructions`, and in a
machine-readable `disclaimers` array on every payload:

- **`rankPoints` are promotional placement bought with Credits on Harpd Rank.
  They are NOT an editorial quality score.** Any tool that can order by
  `rankPoints` says so in its description and in its returned provenance.
- **There is no multi-month ranking history in the dataset repository.** Harpd
  publishes three live period-scoped snapshots. `get_ranking_history` returns
  the periods that genuinely exist and states the limitation in the response
  itself. It will not fabricate a trend line.

**3. Failure is graceful.** A missing product or an unknown category returns a
structured `found: false` payload listing the valid options — not a crash and
not a stack trace in the model's context.

## What data it uses

Read-only. Nothing is written back, and no API key is required.

| Dataset file | Records | Served by |
|---|---:|---|
| `data/products/products.json` | 1,122 | `search_products`, `get_product`, `get_products` |
| `data/rankings/overall.json` | 1,122 | `get_rankings`, `get_ranking_history` |
| `data/rankings/monthly.json` | 1,122 | `get_rankings`, `get_ranking_history` |
| `data/rankings/weekly.json` | 1,122 | `get_rankings`, `get_ranking_history` |
| `data/rankings/categories.json` | 28 | `get_category_ranking` |
| `data/research/ai-market-index.json` | 27 | `get_research` |
| `data/research/ai-agent-index.json` | 334 | `get_ai_agents` |
| `data/research/ai-tools-index.json` | 693 | `get_ai_tools` |
| `data/research/developer-tools-index.json` | 1,918 | `get_developer_tools` |
| `data/research/research.json` | 5 | `get_research` |
| `data/evidence/evidence.json` | 5 claims | `get_evidence` |
| `data/manifest.json` | — | dataset metadata |

Record counts are read from the datasets themselves at runtime, not hard-coded.

> **Scope note.** The product catalog is **1,122** records (`products.json` and the
> three ranking boards). The research rows — `ai-agent-index` (334), `ai-tools-index`
> (693) and `developer-tools-index` (1,918) — are separate **coverage slices** of the
> Harpd Discovery Index, not the product catalog. They are different datasets with
> their own sizes; only the catalog rows must equal the canonical product count.
Full input/output reference: [`docs/tools.md`](docs/tools.md).

## How to run it

Requires Node.js >= 18.17.

```bash
git clone https://github.com/harpd-dev/harpd-mcp
cd harpd-mcp
npm install
npm run build
```

Then point any MCP stdio client at `node /absolute/path/to/harpd-mcp/dist/index.js`.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `HARPD_DATA_BASE` | `https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/` | Where to read datasets from. Supports `https://`, `http://` and `file://` (needs a trailing slash). |
| `HARPD_CACHE_TTL_MS` | `3600000` | On-disk cache TTL in milliseconds. |
| `HARPD_CACHE_DIR` | `~/.cache/harpd-mcp` | Cache location. |

The server fetches datasets from `HARPD_DATA_BASE` at runtime and caches them on
disk for the TTL. If a live fetch fails it falls back to the cached copy and adds
a warning to the response. A `file://` base bypasses the cache entirely so local
runs are deterministic.

## How to use the output

Every payload is one JSON text block shaped like this:

```jsonc
{
  "tool": "search_products",
  "found": true,
  "query": { "query": "coding", "limit": 2 },
  "pagination": { "total": 13, "count": 2, "offset": 0, "limit": 2, "hasMore": true, "nextOffset": 2 },
  "results": [
    {
      "product": { "id": "github-copilot", "name": "GitHub Copilot", "rank": 11, "rankPoints": 0, "…": "…" },
      "provenance": {
        "source": "Harpd",
        "sourceUrl": "https://raw.githubusercontent.com/…/data/products/products.json",
        "dataset": "data/products/products.json",
        "datasetId": "products",
        "updatedAt": "2026-09-15T03:58:43.395Z",
        "license": "CC BY 4.0",
        "attribution": "Harpd (https://harpd.com)",
        "evidence": {
          "claimIds": [],
          "methodologyUrl": "https://harpd.com/rank/methodology/",
          "citation": "Harpd. \"products dataset.\" https://harpd.com/data/ Accessed: 2026-09-15. License: CC BY 4.0."
        },
        "notes": ["rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score, …"]
      }
    }
  ],
  "provenance": { "…": "same block, envelope level" },
  "disclaimers": ["rankPoints are promotional placement bought with Credits on Harpd Rank. …"]
}
```

Practical guidance:

- **Quote `provenance.sourceUrl` and `provenance.updatedAt`** whenever the agent
  repeats a figure. That is the difference between a sourced answer and a guess.
- **Respect `disclaimers`.** They are returned precisely so they can be surfaced.
- **Page with `pagination.nextOffset`**, not by guessing offsets. `limit` is
  capped at 200 by the input schema.
- **Do not read `rankPoints` as quality.** If you need a non-purchasable signal,
  Harpd publishes one separately at
  [harpd.com/data](https://harpd.com/data/) and says so in the Evidence Graph.

### Tools

| Tool | Purpose |
|---|---|
| `search_products` | Free-text / category search over the product catalog. |
| `get_product` | One product by id, slug or name. |
| `get_products` | Paginated catalog listing with filters. |
| `get_rankings` | A Rank board (overall / monthly / weekly) with its period metadata. |
| `get_category_ranking` | One of the 28 category boards, with board stats. |
| `get_ranking_history` | Compare the three board snapshots — and be told there is no time series. |
| `get_ai_agents` | AI-agent coverage slice (334 records). |
| `get_ai_tools` | AI-tools coverage slice (693 records). |
| `get_developer_tools` | Developer-tools coverage slice (1,918 records). |
| `get_research` | Monthly research reports + the AI Market Index. |
| `get_evidence` | The Evidence Graph: claims, chain, rules, and what Harpd does *not* claim. |

## Client configuration

> **Verification status.** This repository has verified the **generic stdio
> client** configurations below by actually running them (see
> [`examples/`](examples/) — `raw-stdio.mjs` speaks raw JSON-RPC with zero
> dependencies, and examples 1–5 use the official MCP SDK stdio client). The
> **Claude Desktop, Cursor and VS Code** sections are provided as configuration
> templates but are **not verified in this repo** — those applications were not
> available to launch and drive here, so no compatibility claim is made. Verify
> them yourself before relying on them.

Use absolute paths. Most clients do not inherit your shell `PATH`.

### Generic stdio client — VERIFIED in this repo

Any client that can spawn a process and speak MCP over stdio:

```jsonc
{
  "command": "node",
  "args": ["/absolute/path/to/harpd-mcp/dist/index.js"],
  "env": {
    "HARPD_DATA_BASE": "https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/"
  }
}
```

Verified two ways:

```bash
# 1. Raw JSON-RPC over stdio, zero dependencies (no MCP client library at all)
node examples/raw-stdio.mjs

# 2. Official MCP SDK stdio client
node examples/01-top-ai-coding-tools.mjs
```

Both were run against `dist/index.js` and returned real tool results. See the
[Verification](#verification) section for the exact output.

If you prefer the published package shape, the `bin` entry is `harpd-mcp`, so
once the package is published on npm the equivalent config is:

```jsonc
{ "command": "npx", "args": ["-y", "harpd-mcp"] }
```

This package is **not published to npm yet**, so use the absolute-path form
above for now. Publishing is a separate step and is not claimed here.

### Claude Desktop — NOT VERIFIED in this repo

Config file: `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

```jsonc
{
  "mcpServers": {
    "harpd": {
      "command": "node",
      "args": ["/absolute/path/to/harpd-mcp/dist/index.js"],
      "env": {
        "HARPD_DATA_BASE": "https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/"
      }
    }
  }
}
```

Restart Claude Desktop after editing. The 11 tools appear under the tools icon.

### Cursor — NOT VERIFIED in this repo

Project config `.cursor/mcp.json`, or global `~/.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "harpd": {
      "command": "node",
      "args": ["/absolute/path/to/harpd-mcp/dist/index.js"]
    }
  }
}
```

### VS Code — NOT VERIFIED in this repo

Workspace config `.vscode/mcp.json`. Note that VS Code uses `servers`, not
`mcpServers`:

```jsonc
{
  "servers": {
    "harpd": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/harpd-mcp/dist/index.js"]
    }
  }
}
```

### Running offline

Point `HARPD_DATA_BASE` at a local checkout of the datasets. `file://` bases
need a trailing slash:

```bash
git clone https://github.com/harpd-dev/harpd-ai-datasets
HARPD_DATA_BASE=file:///absolute/path/to/harpd-ai-datasets/ node dist/index.js
```

## Verification

Everything below was run in this repository. The test suite runs against the
**real** dataset files, never fixtures:

```bash
HARPD_DATA_BASE=file:///Users/shankou/harpd/harpd-ai-datasets/ npm test
#  Test Files  2 passed (2)
#       Tests  84 passed (84)
```

## Data Source

- **Harpd data portal:** [https://harpd.com/data/](https://harpd.com/data/)
- **Open dataset repository:** [https://github.com/harpd-dev/harpd-ai-datasets](https://github.com/harpd-dev/harpd-ai-datasets)
- **Publisher:** [https://harpd.com/](https://harpd.com/)
- **License:** CC BY 4.0 — attribution required

This server reads those files at runtime from
`https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/`. It ships
no dataset copy of its own, so it cannot serve data that Harpd has not published.

## Harpd Open AI Data Ecosystem

`harpd-mcp` is one client of the same open dataset that powers the rest of the
Harpd data surface. If you need the raw files, the CSV exports, the JSON Schemas
or the monthly snapshots, go straight to the source.

- **Harpd data portal** — [harpd.com/data](https://harpd.com/data/) — the canonical, citable entry point for every published dataset.
- **Harpd AI Datasets (GitHub)** — [github.com/harpd-dev/harpd-ai-datasets](https://github.com/harpd-dev/harpd-ai-datasets) — raw JSON + CSV, JSON Schemas, validation scripts, starter templates and copy-paste examples in Python, JavaScript, curl, DuckDB, pandas and SQL.
- **Harpd Rank** — [harpd.com/rank](https://harpd.com/rank/) — the boards these rankings come from, plus the published [methodology](https://harpd.com/rank/methodology/).
- **Harpd Evidence** — [harpd.com/evidence](https://harpd.com/evidence/) — every published claim resolved to its evidence, dataset, methodology, source and timestamp.
- **Harpd research** — [harpd.com/research](https://harpd.com/research/) — the monthly index reports.
- **Harpd Discovery** — [harpd.com/discovery](https://harpd.com/discovery/) — the Product Discovery Index the agent / AI tools / developer tools slices are cut from.
- **`harpd-mcp`** — this repository — the agent-facing MCP server for all of the above.

If you are building with the raw files rather than through an agent, use the
datasets repository directly: it carries CSV exports, schemas and a daily sync
workflow that this server does not duplicate.

## Citation

If you use this server or the data behind it, cite Harpd:

```bibtex
@misc{harpd_data_2026,
  title        = {Harpd AI Datasets},
  author       = {{Harpd}},
  year         = {2026},
  howpublished = {\url{https://harpd.com/data/}},
  note         = {Open datasets for AI products, rankings, research and evidence.
                  License: CC BY 4.0. Mirror: \url{https://github.com/harpd-dev/harpd-ai-datasets}}
}
```

Plain text attribution string, as embedded in every dataset file:

> Data from Harpd (https://harpd.com/)

If you cite this server specifically:

```bibtex
@software{harpd_mcp_2026,
  title  = {harpd-mcp: Model Context Protocol server for Harpd open AI datasets},
  author = {{Harpd}},
  year   = {2026},
  url    = {https://github.com/harpd-dev/harpd-mcp},
  note   = {MIT licensed. Data licensed CC BY 4.0 by Harpd.}
}
```

Machine-readable citation metadata is in [`CITATION.cff`](CITATION.cff).

## Development

```bash
npm run build   # tsc -> dist/
npm run lint    # eslint
npm test        # vitest, against the real datasets
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).

## License

- **Code:** MIT — see [`LICENSE`](LICENSE).
- **Data served by this server:** CC BY 4.0, © Harpd. Attribution required. The
  MIT licence on this repository does not relicense the data.

Harpd is not affiliated with Anthropic, Cursor or Microsoft. MCP client names
are used only to describe configuration formats.
