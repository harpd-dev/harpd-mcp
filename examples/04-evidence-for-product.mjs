#!/usr/bin/env node
/**
 * Example 4 — find the evidence for a product.
 *
 *   node examples/04-evidence-for-product.mjs "GitHub Copilot"
 *
 * Shows: get_evidence, the Harpd Evidence Graph chain, and the claims Harpd
 * explicitly does NOT make (including that rank is not a quality signal).
 */

import { callTool, connect, provenanceFooter, run, section } from './lib.mjs';

const productName = process.argv[2] ?? 'GitHub Copilot';

await run(async () => {
  const client = await connect();

  section(`get_evidence — productName: "${productName}"`);
  const { payload, isError } = await callTool(client, 'get_evidence', { productName, limit: 5 });
  if (isError) throw new Error(payload.error ?? 'tool call failed');

  console.log(`Evidence chain: ${payload.evidenceGraph.chain.join(' → ')}`);
  console.log(
    `Graph counts  : ${payload.evidenceGraph.counts.claims} claims, ${payload.evidenceGraph.counts.publishable} publishable, ${payload.evidenceGraph.counts.blocked} blocked`,
  );

  console.log(`\nDataset-level claims covering the ranking surface:`);
  for (const entry of payload.results) {
    const c = entry.entity;
    console.log(`  [${c.claimType}] ${c.id}`);
    console.log(`     ${c.claim}`);
    console.log(`     supported=${c.supported} confidence=${c.confidence} observedAt=${c.observedAt}`);
    console.log(`     methodology: ${c.methodologyUrl}`);
  }

  for (const item of payload.productEvidence ?? []) {
    console.log(`\nProduct: ${item.product.name} (${item.product.id})`);
    console.log(`  rank=${item.product.rank} rankPoints=${item.product.rankPoints}`);
    console.log(provenanceFooter(item.provenance));
    console.log(`  ${item.rankPointsNote}`);
    console.log('\n  Claims Harpd explicitly does NOT make:');
    for (const nc of item.notClaimed) {
      console.log(`    ✗ ${nc.statement}`);
      console.log(`      why: ${nc.why}`);
    }
  }

  if (payload.productEvidenceNote) console.log(`\n${payload.productEvidenceNote}`);

  console.log('\nDisclaimers:');
  for (const line of payload.disclaimers ?? []) console.log(`  • ${line}`);

  await client.close();
});
