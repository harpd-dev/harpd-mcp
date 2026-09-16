# Contributing to harpd-mcp

Thanks for helping. This is a small, focused server: it exposes Harpd's public
datasets to AI agents over MCP. Contributions that keep it small and honest are
the most welcome.

## Getting set up

```bash
git clone https://github.com/harpd-dev/harpd-mcp
cd harpd-mcp
npm install
npm run build
npm test
```

Requires Node.js >= 18.17.

## Running the tests

The tests run against the **real** Harpd datasets, not fixtures. That is
deliberate — a fixture would let the schema drift away from reality without
anyone noticing.

By default the test config reads the sibling checkout at `../harpd-ai-datasets`
over a `file://` base, so the run is offline and deterministic:

```bash
git clone https://github.com/harpd-dev/harpd-ai-datasets ../harpd-ai-datasets
npm test
```

Point it anywhere else with `HARPD_DATA_BASE`:

```bash
HARPD_DATA_BASE=https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/ npm test
```

## Before you open a pull request

```bash
npm run lint
npm run build
npm test
```

All three must pass. CI runs exactly this sequence.

## Non-negotiable rules

These are not style preferences. A change that breaks one of them will be
rejected regardless of how useful it otherwise is.

1. **Never fabricate data.** No placeholder records, no invented timestamps, no
   synthetic history, no "example" values that could be mistaken for real ones.
2. **Never present `rankPoints` as a quality signal.** They are promotional
   placement bought with Credits on Harpd Rank. Any tool that can order by
   `rankPoints` must say so in its description *and* return the disclaimer.
3. **Never invent a time series.** The repository holds three live
   period-scoped board snapshots. `get_ranking_history` must keep reporting the
   periods that actually exist and keep stating the limitation. Do not add
   interpolation, extrapolation or derived trends.
4. **Never return a bare record.** Every tool result — envelope and every
   record — must carry a `provenance` block via `withProvenance()` /
   `withProductProvenance()` in `src/client.ts`. If you add a tool, wrap
   everything.
5. **Never claim unverified client support.** If you have not actually run a
   client against this server, mark its documentation section as not verified.
6. **Never claim third-party adoption** that has not happened.

## Adding a tool

1. Add the implementation in `src/tools/`, exporting a `register<Name>(server)`
   function and a Zod input schema.
2. Give it a description that states what it returns **and** any domain caveat
   that applies (`rankPoints`, coverage-vs-ranking, history granularity).
3. Wrap every record and the envelope in provenance.
4. Register it in `src/tools/index.ts` and add the name to `TOOL_NAMES`.
5. Add tests: discovery, input validation, result shape, provenance coverage,
   and the not-found path.
6. Document it in `docs/tools.md` and, if it is user-facing, in `README.md`.

## Style

- TypeScript, strict. `noUncheckedIndexedAccess` is on; handle `undefined`.
- ESM only, with explicit `.js` extensions on relative imports (required by
  `moduleResolution: NodeNext`).
- Keep handlers free of business logic that belongs in `src/client.ts`.
- Prefer a plain function over a new abstraction.
- Comments explain *why*, not *what*.

## Reporting a data problem

If a dataset looks wrong, that is an upstream issue in
[harpd-ai-datasets](https://github.com/harpd-dev/harpd-ai-datasets), not in this
server. This repository ships no data. Fixes to the data belong there; fixes to
how this server reads, validates or attributes it belong here.

## Security

Do not open a public issue for a security problem. See
[`SECURITY.md`](SECURITY.md).
