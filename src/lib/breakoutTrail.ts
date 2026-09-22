import {
  runTrailBacktest,
  type BbTrailResult,
  type TrailOptions,
  type TrailSignal,
} from './bbRsiTrail';
import { computeBreakoutTargets, type BreakoutOptions } from './breakoutTargets';
import { dmi } from './indicators';
import type { Candle } from './types';

/**
 * "Breakout Targets | AlgoAlpha" signals + Bollinger+RSI / MACD / Sniper
 * එකේ **එකම exit engine එක**.
 *
 * Entry = range box එකෙන් price එක පිට වහපු bar එක (bullish/bearish
 * breakout). Exit නීති (මුල් SL, break-even, trail, අවම අගුළු, fees,
 * slippage, liquidation) අනිත් backtest indicators වලට හරියටම එකයි —
 * ඒ නිසා සංසන්දනය කරද්දී වෙනස එන්නේ signals වලින් විතරයි.
 *
 * ⚠️ AlgoAlpha එකේ SL එක **5 × ATR** — අනිත් ඒවායේ 2 × ATR. Default
 *    එක indicator එකේම අගයට තියලා තියෙනවා (5). ඒ නිසා trade එකක R
 *    එකක් ලොකුයි, සහ `Max Risk %` එකට වඩා පළල් SL තියෙන trades
 *    අත්හැරෙනවා.
 */

export interface BreakoutTrailOptions extends TrailOptions {
  signal: BreakoutOptions;
  /** ADX මේකට වඩා වැඩි නම් විතරයි. 0 = පෙරහනක් නෑ. */
  minAdx: number;
  adxLength: number;
}

export const BREAKOUT_SIGNAL_DEFAULTS: BreakoutOptions = {
  length: 99,
  preventOverlap: true,
  showTargets: false,
  atrPeriod: 14,
  slMultiplier: 5,
  tp1Multiplier: 0.5,
  tp2Multiplier: 1,
  tp3Multiplier: 1.5,
};

export const BREAKOUT_TRAIL_DEFAULTS: Omit<BreakoutTrailOptions, 'signal'> = {
  direction: 'both',
  atrLength: 14,
  // AlgoAlpha එකේම SL එක.
  initialSlAtr: 5,
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
  minAdx: 0,
  adxLength: 14,
};

/** Breakout entries — backtest එකට ඕන ආකාරයට. */
export function breakoutSignals(candles: Candle[], o: BreakoutTrailOptions): TrailSignal[] {
  const r = computeBreakoutTargets(candles, o.signal);
  const adx = o.minAdx > 0 ? dmi(candles, o.adxLength, o.adxLength).adx : null;
  const out: TrailSignal[] = [];
  for (const s of r.signals) {
    if (adx && !(adx[s.index] > o.minAdx)) continue;
    out.push({ index: s.index, dir: s.dir });
  }
  return out;
}

export function computeBreakoutTrail(candles: Candle[], o: BreakoutTrailOptions): BbTrailResult {
  if (candles.length < 60) return runTrailBacktest(candles, [], o);
  return runTrailBacktest(candles, breakoutSignals(candles, o), o);
}
