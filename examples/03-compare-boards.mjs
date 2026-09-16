#!/usr/bin/env node
/**
 * Example 3 — compare ranking changes between boards.
 *
 *   node examples/03-compare-boards.mjs [productId]
 *
 * Shows: get_ranking_history, and how the server stays honest about the fact
 * that Harpd publishes three period-scoped snapshots, not a time series.
 */

import { callTool, connect, run, section } from './lib.mjs';

let productId = process.argv[2];

await run(async () => {
  const client = await connect();

  if (!productId) {
    section('Resolving a product to compare (search_products)');
    const search = await callTool(client, 'search_products', { sort: 'rank', limit: 1 });
    productId = search.payload.results[0].product.id;
    console.log(`Using the top-ranked product in the catalog: ${productId}`);
  }

  section(`get_ranking_history — productId: ${productId}`);
  const { payload, isError } = await callTool(client, 'get_ranking_history', { productId });
  if (isError) throw new Error(payload.error ?? 'tool call failed');

  if (!payload.found) {
    console.log(payload.message);
    await client.close();
    return;
  }

  console.log(`Granularity : ${payload.granularity.kind}`);
  console.log(`Snapshots   : ${payload.granularity.snapshots} (${payload.granularity.boards.join(', ')})`);
  console.log(`Periods     : ${payload.granularity.distinctPeriods.join(', ')}`);
  console.log(`Time series : ${payload.granularity.historicalTimeSeriesAvailable ? 'available' : 'NOT available'}`);
  console.log(`\nLimitation  : ${payload.limitation}`);

  console.log('\nBoards:');
  for (const board of payload.boards) {
    console.log(
      `  ${board.board.padEnd(8)} period=${String(board.periodKey).padEnd(10)} ${board.periodStart ?? '?'} → ${board.periodEnd ?? '?'}  (${board.dataset})`,
    );
  }

  for (const position of payload.positions) {
    console.log(`\nProduct: ${position.product.name} (${position.product.id})`);
    console.log('  board     rank  rankPoints  period      dataset');
    for (const [board, data] of Object.entries(position.boards)) {
      if (!data) {
        console.log(`  ${board.padEnd(8)}  —    —           —           (not present on this board)`);
        continue;
      }
      console.log(
        `  ${board.padEnd(8)}  ${String(data.rank).padStart(4)}  ${String(data.rankPoints).padStart(10)}  ${String(data.periodKey).padEnd(10)}  ${data.dataset}`,
      );
    }
  }

  console.log('\nDisclaimers:');
  for (const line of payload.disclaimers ?? []) console.log(`  • ${line}`);

  await client.close();
});
