# Examples

Runnable examples that connect to `harpd-mcp` over stdio and call its tools.

Build first:

```bash
npm install
npm run build
```

Run any example with plain `node` — no global install, no MCP client required.

---

## `raw-stdio.mjs` — no dependencies at all

```bash
node examples/raw-stdio.mjs
```

This file imports **nothing** except Node built-ins. It spawns
`dist/index.js`, writes newline-delimited JSON-RPC 2.0 to its stdin and reads
the responses from stdout. It performs a real `initialize` handshake, lists the
tools, calls `search_products`, `get_ranking_history` and `get_evidence`, and
finally shows a rejected invalid input.

If this script runs, the server speaks MCP over stdio correctly and will work
with any MCP stdio client.

To run it fully offline against a local checkout of the datasets:

```bash
HARPD_DATA_BASE=file:///path/to/harpd-ai-datasets/ node examples/raw-stdio.mjs
```

---

## The five worked examples

These use the official `@modelcontextprotocol/sdk` stdio client (already a
dependency) and print a readable report.

| # | File | What it demonstrates |
|---|---|---|
| 1 | [`01-top-ai-coding-tools.mjs`](01-top-ai-coding-tools.mjs) | Find top AI coding tools — `search_products`, per-record provenance, and the rankPoints warning. |
| 2 | [`02-ai-agents-in-category.mjs`](02-ai-agents-in-category.mjs) | Find AI agents in a category — `get_ai_agents`, slice metadata, "not a ranking" disclosure. |
| 3 | [`03-compare-boards.mjs`](03-compare-boards.mjs) | Compare ranking changes between boards — `get_ranking_history`, and how the server refuses to invent a time series. |
| 4 | [`04-evidence-for-product.mjs`](04-evidence-for-product.mjs) | Find evidence for a product — `get_evidence`, the evidence chain, and the claims Harpd explicitly does *not* make. |
| 5 | [`05-ai-tools-dataset.mjs`](05-ai-tools-dataset.mjs) | Retrieve the current AI tools dataset — `get_ai_tools` paged across the whole slice. |

```bash
node examples/01-top-ai-coding-tools.mjs
node examples/02-ai-agents-in-category.mjs ai-media
node examples/03-compare-boards.mjs imgkit-86d32f3e
node examples/04-evidence-for-product.mjs "GitHub Copilot"
node examples/05-ai-tools-dataset.mjs 200
```

All examples accept `HARPD_DATA_BASE` to switch between the published raw GitHub
mirror (default) and a local `file://` checkout.

`lib.mjs` holds the shared connect/call/print helpers.

---

## Why these examples print disclaimers

Every example prints the `disclaimers` array the server returns. That is
deliberate. Two rules travel with Harpd data and must survive into whatever you
build:

1. `rankPoints` are promotional placement bought with Credits on Harpd Rank —
   **not** an editorial quality score.
2. There is no multi-month ranking history in the dataset repository; the three
   boards are live period-scoped snapshots.

If you reuse this data, keep the `provenance` block and the disclaimers with it.
