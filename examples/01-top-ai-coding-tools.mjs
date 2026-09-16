#!/usr/bin/env node
/**
 * Example 1 — find top AI coding tools.
 *
 *   node examples/01-top-ai-coding-tools.mjs
 *
 * Shows: search_products, per-record provenance, and the mandatory warning
 * that the ordering is NOT a quality ranking.
 */

import { callTool, connect, disclaimers, provenanceFooter, run, section } from './lib.mjs';

await run(async () => {
  const client = await connect();

  section('search_products — query: "coding"');
  const { payload, isError } = await callTool(client, 'search_products', {
    query: 'coding',
    limit: 8,
    sort: 'rank',
  });

  if (isError) throw new Error(payload.error ?? 'tool call failed');

  console.log(`Matched ${payload.pagination.total} products in the Harpd catalog.\n`);
  for (const entry of payload.results) {
    const p = entry.product;
    console.log(
      `${String(p.rank).padStart(5)}  ${p.name.padEnd(22)} rankPoints=${String(p.rankPoints).padStart(4)}  ${p.categoryName}`,
    );
    console.log(`       ${p.website ?? '(no website)'}`);
  }

  console.log('\nProvenance for the first record:');
  console.log(provenanceFooter(payload.results[0].provenance));

  disclaimers(payload);

  await client.close();
});
