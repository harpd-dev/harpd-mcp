#!/usr/bin/env node
/**
 * Example 2 — find AI agents in a category.
 *
 *   node examples/02-ai-agents-in-category.mjs [category]
 *   node examples/02-ai-agents-in-category.mjs ai-media
 *
 * Shows: get_ai_agents, the Discovery Index slice metadata, and the reminder
 * that a coverage slice is not a ranking.
 */

import { callTool, connect, disclaimers, provenanceFooter, run, section } from './lib.mjs';

const category = process.argv[2] ?? 'agents';

await run(async () => {
  const client = await connect();

  section(`get_ai_agents — category: ${category}`);
  const { payload, isError } = await callTool(client, 'get_ai_agents', {
    category,
    limit: 10,
  });

  if (isError) throw new Error(payload.error ?? 'tool call failed');

  if (!payload.found) {
    console.log(`No records in the Harpd AI Agent Index for category "${category}".`);
    console.log('This index only covers the "agents" slice; try get_ai_tools or get_developer_tools.');
    await client.close();
    return;
  }

  console.log(
    `Slice: ${payload.slice.dataset} — ${payload.slice.recordCount} records total, ${payload.pagination.total} matching this filter.\n`,
  );

  for (const entry of payload.results) {
    const r = entry.entity;
    console.log(`${r.name}  (${r.domain})`);
    console.log(`    ${r.title}`);
    console.log(
      `    category=${r.category} confidence=${r.category_confidence} discovered_from=${r.discovered_from} on_rank_board=${r.on_rank_board}`,
    );
  }

  console.log('\nProvenance for the first record:');
  console.log(provenanceFooter(payload.results[0].provenance));

  disclaimers(payload);

  await client.close();
});
