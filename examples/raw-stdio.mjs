#!/usr/bin/env node
/**
 * raw-stdio.mjs — proves harpd-mcp really speaks MCP over stdio.
 *
 * This file has ZERO dependencies: no MCP client library, no SDK. It spawns
 * `dist/index.js`, writes newline-delimited JSON-RPC 2.0 to its stdin, reads
 * the responses from its stdout and prints them. If you can run this, the
 * server works with any MCP stdio client.
 *
 * Usage:
 *   node examples/raw-stdio.mjs
 *   HARPD_DATA_BASE=file:///path/to/harpd-ai-datasets/ node examples/raw-stdio.mjs
 *
 * Build first:  npm run build
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const serverPath = path.join(repoRoot, 'dist', 'index.js');

if (!existsSync(serverPath)) {
  console.error(`dist/index.js not found at ${serverPath}. Run: npm run build`);
  process.exit(1);
}

const PROTOCOL_VERSION = '2025-06-18';
const TIMEOUT_MS = 60_000;

const env = { ...process.env };
if (!env.HARPD_DATA_BASE) {
  // Default to the published raw mirror. Override with a file:// base to run offline.
  env.HARPD_DATA_BASE = 'https://raw.githubusercontent.com/harpd-dev/harpd-ai-datasets/main/';
}

const child = spawn(process.execPath, [serverPath], {
  cwd: repoRoot,
  env,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

let buffer = '';
const pending = new Map();

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      console.error('Non-JSON line on stdout:', line);
      continue;
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve } = pending.get(message.id);
      pending.delete(message.id);
      resolve(message);
    }
  }
});

let nextId = 1;

function send(method, params) {
  const id = nextId++;
  const payload = { jsonrpc: '2.0', id, method, params };
  child.stdin.write(`${JSON.stringify(payload)}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out after ${TIMEOUT_MS}ms waiting for ${method}`));
    }, TIMEOUT_MS);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        resolve(message);
      },
    });
  });
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

function show(label, value) {
  console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

/** Unwrap a tools/call result into parsed JSON. */
function parseToolResult(response) {
  const text = response?.result?.content?.[0]?.text;
  if (typeof text !== 'string') return response;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log(`Spawning: ${process.execPath} ${serverPath}`);
  console.log(`HARPD_DATA_BASE=${env.HARPD_DATA_BASE}`);

  const init = await send('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'harpd-mcp-raw-stdio-example', version: '0.1.0' },
  });
  show('initialize', {
    protocolVersion: init.result?.protocolVersion,
    serverInfo: init.result?.serverInfo,
    capabilities: init.result?.capabilities,
    instructions: init.result?.instructions,
  });

  notify('notifications/initialized', {});

  const list = await send('tools/list', {});
  const tools = list.result?.tools ?? [];
  show(
    `tools/list — ${tools.length} tools`,
    tools.map((tool) => ({ name: tool.name, title: tool.title })),
  );

  const calls = [
    {
      name: 'search_products',
      args: { query: 'coding', limit: 2, sort: 'rank' },
      label: 'tools/call → search_products { query: "coding", limit: 2 }',
    },
    {
      name: 'get_ranking_history',
      args: { productId: 'imgkit-86d32f3e', boards: ['overall', 'monthly', 'weekly'] },
      label: 'tools/call → get_ranking_history { productId: "imgkit-86d32f3e" }',
    },
    {
      name: 'get_evidence',
      args: { query: 'rank points', includeGraph: false },
      label: 'tools/call → get_evidence { query: "rank points" }',
    },
  ];

  for (const call of calls) {
    const response = await send('tools/call', { name: call.name, arguments: call.args });
    show(call.label, parseToolResult(response));
  }

  // Show one validation failure, to prove bad input is rejected rather than ignored.
  const bad = await send('tools/call', { name: 'get_products', arguments: { limit: 5000 } });
  show('tools/call → get_products { limit: 5000 } (expected rejection)', {
    isError: bad.result?.isError ?? bad.error !== undefined,
    content: bad.result?.content ?? bad.error,
  });

  show('server stderr', stderr.trim() || '(empty)');
}

main()
  .then(() => {
    child.kill();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nraw-stdio example failed:', error.message);
    console.error('server stderr:\n' + stderr);
    child.kill();
    process.exit(1);
  });
