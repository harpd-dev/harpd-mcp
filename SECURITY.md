# Security Policy

## Scope

`harpd-mcp` is a read-only MCP server. It reads public JSON datasets over
HTTP(S) or from a local path and returns them to an MCP client over stdio.

It does **not**:

- write to any remote service,
- authenticate, store or transmit credentials,
- execute code from the datasets,
- listen on a network port (stdio only, by design).

The realistic attack surface is therefore small but not zero: the server fetches
from a URL you configure and parses whatever it gets back.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Email **harpdsupport@gmail.com** with:

- a description of the issue and its impact,
- the version or commit you tested,
- reproduction steps or a proof of concept,
- any suggested fix.

You should get an initial response within a few days. Please allow reasonable
time for a fix before disclosing publicly.

## Supported versions

The latest released version on the default branch receives security fixes.

## Threat model notes for operators

Things worth knowing when you deploy this server:

**`HARPD_DATA_BASE` is trusted input.** If you point it at a host you do not
control, that host controls the data your agent will read and repeat. Only use
the official mirror, or a `file://` checkout you trust.

**Dataset content is untrusted text.** Product names, descriptions and discovery
records come from third-party sources and are passed to the model verbatim. As
with any tool output, treat it as data, not instructions. If your client
supports it, keep tool output delimited from the system prompt.

**The on-disk cache holds fetched data.** It lives in `~/.cache/harpd-mcp` by
default; override with `HARPD_CACHE_DIR`. Cached files are plain JSON and are
read back on cache hits, so protect that directory as you would any other
application cache.

**Provenance is a trust aid, not a signature.** The `provenance` block records
where a record came from and when. It is not cryptographically signed. Verify
`sourceUrl` matches the base you configured if provenance is load-bearing for
your use case.

**No data is authored here.** This repository ships no dataset. If a record is
wrong, that is a data issue in
[harpd-ai-datasets](https://github.com/harpd-dev/harpd-ai-datasets).

## Dependency hygiene

Run `npm audit` before deploying. Dependencies are limited to the official
`@modelcontextprotocol/sdk` and `zod`; dev tooling is TypeScript, ESLint and
Vitest.
