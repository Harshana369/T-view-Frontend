import {
  runTrailBacktest,
  type BbTrailResult,
  type TrailOptions,
  type TrailSignal,
} from './bbRsiTrail';
import { computeMacdSma, type MacdSmaOptions } from './macdSma';
import type { Candle } from './types';

/**
 * "MACD + SMA 200 | ChartArt" signals + Bollinger+RSI එකේ **එකම exit
 * engine එක**.
 *
 * (`macdSmaTrail.ts` එකේ තියෙන්නේ පරණ, වෙනම engine එකක් — ඒක
 *  "MACD + SMA 200 — Trailing Backtest" එකට. මේක අලුත් එක:
 *  break-even, අවම අගුළු ලාභය, margin sizing, position history —
 *  Bollinger+RSI එකට තියෙන ඔක්කොම.)
 *
 * Exit නීති දෙකටම හරියටම එකයි, ඒ නිසා indicator සංසන්දනය කරද්දී
 * වෙනස එන්නේ **signals** වලින් විතරයි.
 */

export interface MacdSmaTrail2Options extends TrailOptions {
  signal: MacdSmaOptions;
  /**
   * Pine strategy එකේ `cancel` බ්ලොක් එක — `slowMA` සහ `veryslowMA`
   * විරුද්ධ පැත්තට තියෙනකොට order එක අවලංගු වෙනවා.
   *
   * `On` = ChartArt එකේ තියෙන විදිහටම (cancelled signals අත්හරිනවා).
   * `Off` = හැම crossover එකක්ම ගන්නවා — signals වැඩියි, fees වැඩියි.
   */
  respectCancel: boolean;
}

export const MACD_TRAIL2_DEFAULTS: Omit<MacdSmaTrail2Options, 'signal'> = {
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
  respectCancel: true,
};

export const MACD_SIGNAL_DEFAULTS: MacdSmaOptions = {
  source: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  veryslowLength: 200,
};

/** MACD + SMA 200 එකේ entries — backtest එකට ඕන ආකාරයට. */
export function macdSmaSignals(
  candles: Candle[],
  o: MacdSmaTrail2Options,
): TrailSignal[] {
  const r = computeMacdSma(candles, o.signal);
  const out: TrailSignal[] = [];
  for (const s of r.signals) {
    if (o.respectCancel && s.cancelled) continue;
    out.push({ index: s.index, dir: s.dir });
  }
  return out;
}

export function computeMacdSmaTrail2(
  candles: Candle[],
  o: MacdSmaTrail2Options,
): BbTrailResult {
  if (candles.length < 60) return runTrailBacktest(candles, [], o);
  return runTrailBacktest(candles, macdSmaSignals(candles, o), o);
}
