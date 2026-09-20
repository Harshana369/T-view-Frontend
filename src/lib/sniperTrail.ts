import {
  runTrailBacktest,
  type BbTrailResult,
  type TrailOptions,
  type TrailSignal,
} from './bbRsiTrail';
import { computeSniper, type SniperOptions } from './sniper';
import type { Candle } from './types';

/**
 * "Sniper V.02 | KhanSaab" signals + Bollinger+RSI එකේ **එකම exit
 * engine එක**.
 *
 * Exit නීති (මුල් SL, break-even, trail, අවම අගුළු ලාභය, fees,
 * slippage, liquidation) දෙකටම හරියටම එකයි — ඒ නිසා indicator දෙක
 * සංසන්දනය කරද්දී වෙනස එන්නේ **signals** වලින් විතරයි, exit ක්‍රමයෙන්
 * නෙවෙයි. ඒක තමයි සාධාරණ සැසඳීමක් වෙන්න ඕන දේ.
 *
 * Signals: Sniper එකේ `triggerBuy` / `triggerSell` — EMA fast/mid
 * cross එක (එකම පැත්තට දෙපාරක් නෑ).
 */

export interface SniperTrailOptions extends TrailOptions {
  signal: SniperOptions;
  /**
   * Sniper dashboard එකේ bull/bear ලකුණු ප්‍රතිශතය මේකට වඩා වැඩි
   * නම් විතරයි trade එකක් ගන්නේ. 0 = පෙරහනක් නෑ.
   *
   * ⚠️ ලකුණු 7 න් එකක් උසස් timeframe (5m) RSI එකෙන් එන්නේ. Chart
   *    එකේ ඒක තියෙනවා; Group PNL / Tune වලදී නෑ. ඒ වෙලාවට bull
   *    bear දෙකටම ඒ ලකුණ නැති වෙනවා (දෙකටම එකසේ), ඒ නිසා සැසඳීම
   *    හරි — ඒත් ප්‍රතිශතය 100/7 ≈ 14ක් පහළින් තියෙනවා.
   */
  minScorePct: number;
}

export const SNIPER_TRAIL_DEFAULTS: Omit<SniperTrailOptions, 'signal'> = {
  direction: 'both',
  atrLength: 14,
  initialSlAtr: 2,
  breakEvenAtR: 0,
  breakEvenBufferR: 0.1,
  trailAfterR: 0.5,
  trailMode: 'ratio',
  trailRatio: 0.7,
  trailAtr: 2,
  minLockR: 0.5,
  takeProfitR: 0,
  exitOnOpposite: true,
  feePct: 0.045,
  slippagePct: 0.02,
  maxRiskPct: 10,
  minScorePct: 0,
};

/** Sniper එකේ signals — backtest එකට ඕන ආකාරයට. */
export function sniperSignals(candles: Candle[], o: SniperTrailOptions): TrailSignal[] {
  const r = computeSniper(candles, o.signal);
  const out: TrailSignal[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (r.triggerBuy[i]) {
      if (o.minScorePct > 0 && r.bullPct[i] < o.minScorePct) continue;
      out.push({ index: i, dir: 1 });
    } else if (r.triggerSell[i]) {
      if (o.minScorePct > 0 && r.bearPct[i] < o.minScorePct) continue;
      out.push({ index: i, dir: -1 });
    }
  }
  return out;
}

export function computeSniperTrail(
  candles: Candle[],
  o: SniperTrailOptions,
): BbTrailResult {
  if (candles.length < 60) {
    return runTrailBacktest(candles, [], o);
  }
  return runTrailBacktest(candles, sniperSignals(candles, o), o);
}
