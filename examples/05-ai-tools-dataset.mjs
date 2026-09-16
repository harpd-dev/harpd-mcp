#!/usr/bin/env node
/**
 * Example 5 — retrieve the current AI tools dataset.
 *
 *   node examples/05-ai-tools-dataset.mjs [pageSize]
 *
 * Shows: get_ai_tools paginated across the whole slice, the slice metadata,
 * and the provenance envelope you must keep when you reuse the data.
 */

import { callTool, connect, provenanceFooter, run, section } from './lib.mjs';

const pageSize = Number(process.argv[2] ?? 200);

await run(async () => {
  const client = await connect();

  section(`get_ai_tools — paging ${pageSize} at a time`);
  const first = await callTool(client, 'get_ai_tools', { limit: pageSize, offset: 0 });
  if (first.isError) throw new Error(first.payload.error ?? 'tool call failed');

  const total = first.payload.pagination.total;
  console.log(`Slice dataset : ${first.payload.slice.dataset}`);
  console.log(`Derived from  : ${first.payload.slice.derivedFrom}`);
  console.log(`Slice         : ${JSON.stringify(first.payload.slice.sliceDefinition)}`);
  console.log(`Records       : ${first.payload.slice.recordCount} in the dataset, ${total} matching this query`);
  console.log(`Disclosure    : ${first.payload.slice.disclosure}`);

  const collected = [];
  let offset = 0;
  let pages = 0;
  for (;;) {
    const page = await callTool(client, 'get_ai_tools', { limit: pageSize, offset });
    collected.push(...page.payload.results.map((entry) => entry.entity));
    pages += 1;
    if (!page.payload.pagination.hasMore) break;
    offset = page.payload.pagination.nextOffset;
    if (pages > 25) break;
  }

  console.log(`\nCollected ${collected.length} records over ${pages} page(s).`);
  console.log('\nFirst 5 records:');
  for (const record of collected.slice(0, 5)) {
    console.log(`  ${record.name} — ${record.domain} (${record.category})`);
  }

  console.log('\nProvenance envelope (keep this with any reuse):');
  console.log(provenanceFooter(first.payload.provenance));

  console.log('\nDisclaimers:');
  for (const line of first.payload.disclaimers ?? []) console.log(`  • ${line}`);

  await client.close();
});
