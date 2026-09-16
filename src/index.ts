#!/usr/bin/env node
/**
 * harpd-mcp — a Model Context Protocol server that exposes Harpd's open AI
 * product, ranking, research and evidence datasets to AI agents.
 *
 * Transport: stdio (works with Claude Desktop, Cursor, VS Code and any generic
 * MCP stdio client).
 *
 * Data: https://harpd.com/data/ — mirror: https://github.com/harpd-dev/harpd-ai-datasets (CC BY 4.0)
 *
 * Environment:
 *   HARPD_DATA_BASE      Base URL for the datasets. Defaults to the raw GitHub
 *                        mirror. Supports https://, http:// and file:// bases
 *                        (file:// requires a trailing slash).
 *   HARPD_CACHE_TTL_MS   On-disk cache TTL in ms. Default 3600000 (1 hour).
 *   HARPD_CACHE_DIR      Cache directory. Default ~/.cache/harpd-mcp.
 *
 * stdout is reserved for the MCP protocol. All diagnostics go to stderr.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { DEFAULT_DATA_BASE, dataBase } from './client.js';
import { TOOL_NAMES, registerTools } from './tools/index.js';

export { TOOL_NAMES, registerTools } from './tools/index.js';
export type { ToolName } from './tools/index.js';

export const SERVER_NAME = 'harpd-mcp';
export const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = [
  "Query Harpd's public AI product, ranking, research and evidence datasets.",
  '',
  'Data is published openly by Harpd (https://harpd.com/data/) under CC BY 4.0 and mirrored at https://github.com/harpd-dev/harpd-ai-datasets.',
  '',
  'Rules you must respect when using these tools:',
  '1. rankPoints are promotional placement bought with Credits on Harpd Rank. They are NOT an editorial quality score. Never present an ordering by rankPoints as a quality ranking.',
  '2. Harpd publishes three live period-scoped board snapshots (overall / monthly / weekly). There is no multi-month history file. get_ranking_history reports only the periods that really exist and states the limitation; do not infer trends from it.',
  '3. The AI Agent / AI Tools / Developer Tools indices are coverage slices of the Harpd Product Discovery Index, not rankings.',
  '4. Every result carries a provenance block (source, sourceUrl, dataset path, updatedAt, license, attribution, evidence). Keep that attribution when you quote the data.',
].join('\n');

/** Create a fully-registered server. Does not connect a transport. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server);
  return server;
}

/** Start the server on stdio. */
export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const base = dataBase();
  const offline = base.startsWith('file://');
  process.stderr.write(
    `${SERVER_NAME} v${SERVER_VERSION} ready on stdio — ${TOOL_NAMES.length} tools — data base: ${base}` +
      `${base === DEFAULT_DATA_BASE ? ' (default raw GitHub mirror)' : ''}` +
      `${offline ? ' (local file base; cache bypassed)' : ''}\n`,
  );
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${SERVER_NAME} failed to start: ${String(error)}\n`);
    process.exit(1);
  });
}
