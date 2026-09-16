/**
 * Shared helper for the runnable Harpd MCP examples.
 *
 * Spawns `dist/index.js` over stdio with the official MCP client and returns
 * parsed tool payloads. Build first: `npm run build`.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(repoRoot, 'dist', 'index.js');

export const DEFAULT_DATA_BASE =
  'https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/';

function cleanEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.HARPD_DATA_BASE = env.HARPD_DATA_BASE || DEFAULT_DATA_BASE;
  return env;
}

/** Connect a stdio client to the Harpd MCP server. */
export async function connect() {
  if (!existsSync(serverPath)) {
    throw new Error(`dist/index.js not found. Run "npm run build" first (looked in ${serverPath}).`);
  }
  const client = new Client({ name: 'harpd-mcp-example', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: cleanEnv(),
    cwd: repoRoot,
  });
  await client.connect(transport);
  return client;
}

/** Call a tool and return the parsed JSON payload plus the raw result. */
export async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((part) => part.type === 'text')?.text ?? '';
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  return { payload, isError: Boolean(result.isError) };
}

/** Print a titled block. */
export function section(title) {
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

/** Print a short provenance footer for a record. */
export function provenanceFooter(provenance) {
  if (!provenance) return '  (no provenance)';
  return [
    `  source      : ${provenance.source}`,
    `  dataset     : ${provenance.dataset}`,
    `  updatedAt   : ${provenance.updatedAt}`,
    `  license     : ${provenance.license}`,
    `  attribution : ${provenance.attribution}`,
    `  methodology : ${provenance.evidence?.methodologyUrl ?? '(none published)'}`,
    `  citation    : ${provenance.evidence?.citation ?? '(none)'}`,
  ].join('\n');
}

/** Print the disclaimers a tool returned. */
export function disclaimers(payload) {
  const list = payload.disclaimers ?? [];
  if (list.length === 0) return;
  console.log('\nDisclaimers returned by the server:');
  for (const line of list) console.log(`  • ${line}`);
}

/** Run a main() with consistent error handling. */
export async function run(main) {
  try {
    await main();
  } catch (error) {
    console.error(`\nExample failed: ${error.message}`);
    process.exitCode = 1;
  }
}
