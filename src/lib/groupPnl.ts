import { fetchCandles } from './binance';
import { indicatorById, type Params } from './indicatorRegistry';
import { timeframeOf } from './timeframes';
import type { Interval } from './types';

/**
 * Watchlist group එකක **හැම coin එකකටම** backtest එක දුවවලා Realized
 * PNL එක එකතු කරනවා.
 *
 * ⚠️ මේක දුවන්නේ browser එකේ, chart එකේ තියෙන **එකම params** එක්ක.
 *    ඒ නිසා මෙතන පේන ගණන chart එකේ පේන ගණනට හරියටම ගැළපෙනවා —
 *    server එකේ පරණ පිටපතකින් වෙනස් උත්තරයක් එන්නේ නෑ.
 *
 * ⚠️ Coin එකක් තෝරගන්නේ **කලින් දිනපු නිසා** නම්, මෙතන පේන ගණනත්
 *    ඒ නිසාම ලොකුයි. ඒක අනාගතය කියන්නේ නෑ.
 */

export interface SymbolPnl {
  symbol: string;
  trades: number;
  wins: number;
  grossUsd: number;
  feeUsd: number;
  realizedUsd: number;
  /** තාම වහලා නැති එකක් තියෙනවද. */
  openTrades: number;
  liquidated: number;
  error?: string;
}

export interface GroupPnl {
  rows: SymbolPnl[];
  totals: Omit<SymbolPnl, 'symbol' | 'error'>;
  /** Backtest එකක්වත් දුවන්න බැරි වුණු coins. */
  failed: string[];
}

/** එකවර මෙච්චර coins — වැඩි කළොත් browser එක හිර වෙනවා. */
const CONCURRENCY = 4;

function emptyTotals(): GroupPnl['totals'] {
  return { trades: 0, wins: 0, grossUsd: 0, feeUsd: 0, realizedUsd: 0, openTrades: 0, liquidated: 0 };
}

/**
 * @param symbols  group එකේ coins
 * @param params   chart එකේ indicator එකේ දැනට තියෙන settings
 * @param bars     coin එකකට candles කීයක්ද (backtest එකට 3000 හොඳයි)
 * @param onProgress ඉවර වුණු coins ගාණ — progress bar එකට
 */
export async function runGroupPnl(
  /** කුමන backtest indicator එකද — 'bbrsitrail' හෝ 'snipertrail'. */
  defId: string,
  symbols: string[],
  interval: Interval,
  params: Params,
  bars: number,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<GroupPnl> {
  const def = indicatorById(defId);
  if (!def) throw new Error(`${defId} indicator එක නෑ`);

  const rows: SymbolPnl[] = [];
  const failed: string[] = [];
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      if (signal?.aborted) return;
      const index = cursor++;
      if (index >= symbols.length) return;
      const symbol = symbols[index];
      try {
        const { candles } = await fetchCandles(symbol, timeframeOf(interval), bars);
        if (candles.length < 300) throw new Error(`candles ${candles.length} යි`);
        const out = def!.compute(candles, params, { mtf: {}, symbol, interval });
        const row: SymbolPnl = {
          symbol, trades: 0, wins: 0, grossUsd: 0, feeUsd: 0,
          realizedUsd: 0, openTrades: 0, liquidated: 0,
        };
        for (const p of out.positions ?? []) {
          if (p.open) { row.openTrades++; continue; }
          row.trades++;
          row.grossUsd += p.grossUsd;
          row.feeUsd += p.feeUsd;
          row.realizedUsd += p.realizedUsd;
          if (p.realizedUsd > 0) row.wins++;
          if (p.liquidated) row.liquidated++;
        }
        rows.push(row);
      } catch (err) {
        failed.push(symbol);
        rows.push({
          symbol, trades: 0, wins: 0, grossUsd: 0, feeUsd: 0,
          realizedUsd: 0, openTrades: 0, liquidated: 0,
          error: err instanceof Error ? err.message : 'අසාර්ථකයි',
        });
      }
      onProgress?.(++done, symbols.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker));

  const totals = emptyTotals();
  for (const r of rows) {
    totals.trades += r.trades;
    totals.wins += r.wins;
    totals.grossUsd += r.grossUsd;
    totals.feeUsd += r.feeUsd;
    totals.realizedUsd += r.realizedUsd;
    totals.openTrades += r.openTrades;
    totals.liquidated += r.liquidated;
  }
  // ලොකුම ලාභය උඩම.
  rows.sort((a, b) => b.realizedUsd - a.realizedUsd);
  return { rows, totals, failed };
}
