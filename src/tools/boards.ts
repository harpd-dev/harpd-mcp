/**
 * Board loading shared by `get_rankings`, `get_category_ranking` and
 * `get_ranking_history`.
 *
 * Harpd publishes three live board snapshots. This module normalises their
 * differing envelope shapes into one `BoardSnapshot` so the tools stay honest
 * about which period each board actually covers.
 */

import { loadMonthlyRankings, loadOverallRankings, loadWeeklyRankings } from '../client.js';
import type { DatasetKey } from '../client.js';
import type { HarpdProduct } from '../types.js';

export const BOARD_NAMES = ['overall', 'monthly', 'weekly'] as const;
export type BoardName = (typeof BOARD_NAMES)[number];

export interface BoardSnapshot {
  board: BoardName;
  datasetKey: DatasetKey;
  /** Repository-relative dataset path. */
  dataset: string;
  sourceUrl: string;
  /** Dataset-level data timestamp. */
  updatedAt: string;
  /** What the board covers, as published. */
  scope: string;
  /** The period this snapshot is scoped to, as published by the dataset. */
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  monthKey: string | null;
  weekKey: string | null;
  recordCount: number;
  products: HarpdProduct[];
  /** Publisher note carried by the dataset, when present. */
  note?: string;
}

/** Load and normalise one board snapshot. */
export async function loadBoard(board: BoardName): Promise<BoardSnapshot> {
  if (board === 'overall') {
    const { data, definition, sourceUrl } = await loadOverallRankings();
    const periods = data.periods;
    return {
      board,
      datasetKey: 'rankings-overall',
      dataset: definition.path,
      sourceUrl,
      updatedAt: data.lastUpdated ?? data.generatedAt ?? '',
      scope: data.scope ?? 'overall',
      periodKey: periods?.monthKey ?? '',
      periodStart: periods?.monthStart ?? null,
      periodEnd: periods?.monthEnd ?? null,
      monthKey: periods?.monthKey ?? null,
      weekKey: periods?.weekKey ?? null,
      recordCount: data.count ?? data.products?.length ?? 0,
      products: Array.isArray(data.products) ? data.products : [],
    };
  }

  const result = board === 'monthly' ? await loadMonthlyRankings() : await loadWeeklyRankings();
  const { data, definition, sourceUrl } = result;
  const meta = data.meta;
  const snapshot: BoardSnapshot = {
    board,
    datasetKey: board === 'monthly' ? 'rankings-monthly' : 'rankings-weekly',
    dataset: definition.path,
    sourceUrl,
    updatedAt: meta?.generatedAt ?? '',
    scope: board === 'monthly' ? 'current-month' : 'current-week',
    periodKey: meta?.periodKey ?? '',
    periodStart: meta?.periodStart ?? null,
    periodEnd: meta?.periodEnd ?? null,
    monthKey: board === 'monthly' ? meta?.periodKey ?? null : null,
    weekKey: board === 'weekly' ? meta?.periodKey ?? null : null,
    recordCount: meta?.recordCount ?? data.products?.length ?? 0,
    products: Array.isArray(data.products) ? data.products : [],
  };
  if (meta?.note) snapshot.note = meta.note;
  return snapshot;
}

/** Load several boards in parallel. */
export function loadBoards(boards: readonly BoardName[]): Promise<BoardSnapshot[]> {
  return Promise.all(boards.map((board) => loadBoard(board)));
}

/** A compact, provenance-friendly description of a board's period. */
export function boardPeriodSummary(snapshot: BoardSnapshot) {
  return {
    board: snapshot.board,
    dataset: snapshot.dataset,
    datasetId: snapshot.datasetKey,
    sourceUrl: snapshot.sourceUrl,
    updatedAt: snapshot.updatedAt,
    scope: snapshot.scope,
    periodKey: snapshot.periodKey,
    periodStart: snapshot.periodStart,
    periodEnd: snapshot.periodEnd,
    monthKey: snapshot.monthKey,
    weekKey: snapshot.weekKey,
    recordCount: snapshot.recordCount,
    note: snapshot.note ?? null,
  };
}
