import { movingAverage } from './movingAverages';
import type { Candle } from './types';

/**
 * "Mean Deviation Loop | Lyro RS" (© LyroRS, MPL-2.0) කියන TradingView
 * indicator එකේ ගණන් හදන කොටස.
 * මුල් Pine source: https://www.tradingview.com/script/ (Lyro RS)
 *
 * කොටස් තුනයි:
 *  1. MAD Bollinger Bands — standard deviation එක වෙනුවට Mean Absolute
 *     Deviation එකෙන් හදපු bands (outliers වලට අඩුවෙන් හසුවෙනවා).
 *  2. For Loop momentum — MAD එකෙන් බර දාපු price series එකක් අරන්,
 *     bars `from`–`to` එක්ක සසඳලා +1/−1 එකතු කරලා score එකක් හදනවා.
 *  3. Combined signal — උඩ දෙකේ scores දෙකේ සාමාන්‍යය.
 */

export type SignalMode = 'Bollinger Bands' | 'For Loop' | 'Combined Signal';

export interface MadLoopOptions {
  source: string;
  /** BB කොටසේ MA එක + length + multipliers. */
  maBB: string;
  lengthBB: number;
  multPlus: number;
  multMinus: number;
  /** For loop කොටසේ MA එක + length + loop range එක. */
  maFL: string;
  lengthFL: number;
  from: number;
  to: number;
  thresholdLongFL: number;
  thresholdShortFL: number;
  /** Combined mode එකේ thresholds. */
  thresholdLongC: number;
  thresholdShortC: number;
  mode: SignalMode;
}

export interface MadLoopResult {
  /** BB කොටස (main pane එකට). */
  avgBB: number[];
  upper: number[];
  lower: number[];
  /** For loop කොටස (යට pane එකට). */
  madFl: number[];
  /** −1 / 0 / +1 states. */
  bbScore: number[];
  flScore: number[];
  combined: number[];
  /** තෝරගත්ත mode එකට අදාළ score එක (candles + labels වලට). */
  score: number[];
}

/** Pine `source` input එකට අදාළ price series එක හදනවා. */
export function sourceSeries(candles: Candle[], source: string): number[] {
  switch (source) {
    case 'open':
      return candles.map((c) => c.open);
    case 'high':
      return candles.map((c) => c.high);
    case 'low':
      return candles.map((c) => c.low);
    case 'hl2':
      return candles.map((c) => (c.high + c.low) / 2);
    case 'hlc3':
      return candles.map((c) => (c.high + c.low + c.close) / 3);
    case 'ohlc4':
      return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    default:
      return candles.map((c) => c.close);
  }
}

/**
 * Mean Absolute Deviation — Pine එකේ `mad()` එකම:
 * window එකේ හැම bar එකකම අගය *දැන් තියෙන* benchmark (MA) එකෙන් කොපමණ
 * ඈතද කියන එකේ සාමාන්‍යය. (Variance එකේ වගේ වර්ග කරන්නේ නෑ.)
 */
export function madArray(values: number[], benchmark: number[], length: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = length - 1; i < values.length; i++) {
    const b = benchmark[i];
    if (Number.isNaN(b)) continue;
    let sum = 0;
    for (let k = 0; k < length; k++) sum += Math.abs(values[i - k] - b);
    out[i] = sum / length;
  }
  return out;
}

/** Pine `ta.crossover(a, b)` — කලින් bar එකේ යටින් හිටියා, දැන් උඩින්. */
function crossover(a: number[], b: number[], i: number): boolean {
  if (i === 0) return false;
  return a[i] > b[i] && a[i - 1] <= b[i - 1];
}

/** Pine `ta.crossunder(a, b)`. */
function crossunder(a: number[], b: number[], i: number): boolean {
  if (i === 0) return false;
  return a[i] < b[i] && a[i - 1] >= b[i - 1];
}

/** අගය එකම වෙන array එකක් (threshold එකක් series එකක් විදිහට සසඳන්න). */
function constant(value: number, length: number): number[] {
  return new Array<number>(length).fill(value);
}

/**
 * Pine `system(src, a, b)` — දැන් තියෙන අගය, පිටිපස්සට bars a සිට b දක්වා
 * හැම එකක් එක්කම සසඳලා (වැඩිද +1, අඩුද −1) එකතුව.
 * Data මදි තැන් වලට NaN (Pine එකේ ඒ තැන් වල junk අගයන් එනවා).
 */
export function forLoopScore(values: number[], from: number, to: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = to; i < values.length; i++) {
    if (Number.isNaN(values[i])) continue;
    let total = 0;
    let ok = true;
    for (let j = from; j <= to; j++) {
      const past = values[i - j];
      if (Number.isNaN(past)) {
        ok = false;
        break;
      }
      total += values[i] > past ? 1 : -1;
    }
    if (ok) out[i] = total;
  }
  return out;
}

/**
 * Score state machine එක — Pine එකේ `var int score` වගේ. Cross එකක්
 * වුණාම විතරයි වෙනස් වෙන්නේ, නැත්නම් කලින් අගයම තියාගන්නවා.
 * (Pine එකේ `if` දෙක පිළිවෙලට දුවන නිසා, දෙකම එකවර සත්‍ය නම් දෙවැන්න ජය ගන්නවා.)
 */
function crossState(
  a: number[],
  upper: number[],
  lower: number[],
  length: number,
): number[] {
  const out = new Array<number>(length).fill(0);
  let state = 0;
  for (let i = 0; i < length; i++) {
    if (crossover(a, upper, i)) state = 1;
    if (crossunder(a, lower, i)) state = -1;
    out[i] = state;
  }
  return out;
}

export function computeMadLoop(candles: Candle[], o: MadLoopOptions): MadLoopResult {
  const n = candles.length;
  const src = sourceSeries(candles, o.source);
  const volumes = candles.map((c) => c.volume);

  // ── 1. MAD Bollinger Bands ────────────────────────────────────────────
  const avgBB = movingAverage(o.maBB, src, o.lengthBB, volumes);
  const madValue = madArray(src, avgBB, o.lengthBB);
  const upper = avgBB.map((v, i) => v + madValue[i] * o.multPlus);
  const lower = avgBB.map((v, i) => v - madValue[i] * o.multMinus);

  // ── 2. For Loop momentum ──────────────────────────────────────────────
  const avgFL = movingAverage(o.maFL, src, o.lengthFL, volumes);
  const mad2 = madArray(src, avgFL, o.lengthFL);
  // MAD එකෙන් බර දාපු price series එක: MA(src·mad) / MA(mad)
  const weightedNum = movingAverage(
    o.maFL,
    src.map((v, i) => v * mad2[i]),
    o.lengthFL,
    volumes,
  );
  const weightedDen = movingAverage(o.maFL, mad2, o.lengthFL, volumes);
  const madWeighted = weightedNum.map((v, i) => (weightedDen[i] ? v / weightedDen[i] : NaN));
  const madFl = forLoopScore(madWeighted, o.from, o.to);

  // ── 3. Scores ─────────────────────────────────────────────────────────
  const bbScore = crossState(src, upper, lower, n);
  const flScore = crossState(
    madFl,
    constant(o.thresholdLongFL, n),
    constant(o.thresholdShortFL, n),
    n,
  );
  const cSignal = bbScore.map((v, i) => (v + flScore[i]) / 2);
  const combined = crossState(
    cSignal,
    constant(o.thresholdLongC, n),
    constant(o.thresholdShortC, n),
    n,
  );

  const score =
    o.mode === 'For Loop' ? flScore : o.mode === 'Combined Signal' ? combined : bbScore;

  return { avgBB, upper, lower, madFl, bbScore, flScore, combined, score };
}
