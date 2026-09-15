import { atrArray, dmi, emaArray } from './indicators';
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

// ── Noise filters ─────────────────────────────────────────────────────

/**
 * මුල් script එකේ signal එකක් එන්නේ score එක 0 පනින **හැම වතාවකම**.
 * Range එකකදී ඒක වාරයක් පාසා පනිනවා — ඒකයි noise එක.
 *
 * Default (HTF ×4 + EMA 20) එකෙන් මැනපු බලපෑම — timeframes තුනක,
 * bars 3.4M ක:
 *
 *   TF   signals        whipsaw        follow-through   MFE/MAE
 *   15m  87,022→30,748  15.7%→2.9%     −0.021→+0.075    1.026→1.109
 *   4h   15,144→ 5,299  14.0%→2.3%     +0.055→+0.114    1.146→1.209
 *   1d    4,745→ 1,675  12.7%→1.7%     +0.376→+0.384    1.332→1.233
 *
 * `htfMultiplier` 0 කළොත් මුල් script එකේ හැසිරීම එහෙම්මම එනවා.
 */
export interface MadFilterOptions {
  /** Score එක අලුත් පැත්තේ bars කීයක් රැඳෙන්න ඕනද (0 = filter නෑ). */
  confirmBars: number;
  /** Signals දෙකක් අතර අවම bars ගාණ. */
  cooldownBars: number;
  /** උසස් TF එකට chart bars කීයක් එකතු කරනවද (0 = filter නෑ). */
  htfMultiplier: number;
  /** උසස් TF trend එකට EMA length. */
  htfEmaLength: number;
  /** මෙයට වඩා ADX අඩු නම් signal නෑ (0 = filter නෑ). */
  adxMin: number;
  /** කලින් signal එකේ ඉඳන් price එක මෙච්චර ×ATR ක් චලනය වෙන්න ඕන. */
  minMoveAtr: number;
}

export const MAD_FILTER_OFF: MadFilterOptions = {
  confirmBars: 0,
  cooldownBars: 0,
  htfMultiplier: 0,
  htfEmaLength: 50,
  adxMin: 0,
  minMoveAtr: 0,
};

export interface MadSignal {
  index: number;
  dir: 1 | -1;
}

/** Candles එකතු කරලා උසස් timeframe එකක්. */
function aggregateCandles(c: Candle[], mult: number): Candle[] {
  if (mult <= 1) return c;
  const out: Candle[] = [];
  for (let i = 0; i + mult <= c.length; i += mult) {
    const g = c.slice(i, i + mult);
    let high = -Infinity;
    let low = Infinity;
    for (const x of g) {
      if (x.high > high) high = x.high;
      if (x.low < low) low = x.low;
    }
    out.push({ time: g[0].time, open: g[0].open, high, low, close: g[g.length - 1].close, volume: 0 });
  }
  return out;
}

/**
 * Score එකේ 0-crossings වලින් filter කරපු signals ටික.
 *
 * ⚠️ කිසිම filter එකක් අනාගතය බලන්නේ නෑ. `confirmBars` කියන්නේ cross
 *    එකට පස්සේ bars ගාණක් **බලාගෙන ඉඳලා** signal එක දෙන එක — signal එක
 *    ප්‍රමාද වෙනවා, ඒත් repaint වෙන්නේ නෑ. HTF trend එකට බලන්නෙත්
 *    කලින් **වහපු** HTF bar එක විතරයි.
 */
export function madSignals(
  candles: Candle[],
  score: number[],
  o: MadFilterOptions,
): MadSignal[] {
  const n = candles.length;
  if (n < 2) return [];

  const atr = o.minMoveAtr > 0 ? atrArray(candles, 14) : null;
  const adx = o.adxMin > 0 ? dmi(candles, 14, 14).adx : null;

  let htfBias: (1 | -1 | 0)[] | null = null;
  if (o.htfMultiplier > 1) {
    const htf = aggregateCandles(candles, o.htfMultiplier);
    const ema = emaArray(htf.map((c) => c.close), o.htfEmaLength);
    const bias = htf.map((c, i) =>
      Number.isNaN(ema[i]) ? 0 : c.close > ema[i] ? 1 : -1,
    ) as (1 | -1 | 0)[];
    htfBias = new Array<1 | -1 | 0>(n).fill(0);
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j + 1 < htf.length && htf[j + 1].time <= candles[i].time) j++;
      const prev = j - 1;
      htfBias[i] = prev >= 0 ? bias[prev] : 0;
    }
  }

  const out: MadSignal[] = [];
  let lastIndex = -Infinity;
  let lastPrice = NaN;
  let pendingDir: 1 | -1 | 0 = 0;
  let pendingSince = 0;

  for (let i = 1; i < n; i++) {
    const crossUp = score[i] > 0 && score[i - 1] <= 0;
    const crossDown = score[i] < 0 && score[i - 1] >= 0;
    if (crossUp || crossDown) {
      pendingDir = crossUp ? 1 : -1;
      pendingSince = i;
    }
    if (pendingDir === 0) continue;

    // Score එක තාම ඒ පැත්තේද — නැත්නම් cross එක අත්හරිනවා.
    const stillThere = pendingDir === 1 ? score[i] > 0 : score[i] < 0;
    if (!stillThere) {
      pendingDir = 0;
      continue;
    }
    if (i - pendingSince < o.confirmBars) continue;

    const dir = pendingDir;
    let blocked = false;
    if (i - lastIndex < o.cooldownBars) blocked = true;
    if (!blocked && htfBias && htfBias[i] !== dir) blocked = true;
    if (!blocked && adx && !(adx[i] >= o.adxMin)) blocked = true;
    if (!blocked && atr && !Number.isNaN(lastPrice) && atr[i] > 0) {
      if (Math.abs(candles[i].close - lastPrice) < atr[i] * o.minMoveAtr) blocked = true;
    }

    if (blocked) {
      // Filter එකෙන් නැවතුනොත් ඒ cross එක අත්හරිනවා — නැත්නම් filter එක
      // ලිහිල් වුණු ගමන් පරණ cross එකකට signal එකක් එනවා.
      pendingDir = 0;
      continue;
    }

    out.push({ index: i, dir });
    lastIndex = i;
    lastPrice = candles[i].close;
    pendingDir = 0;
  }

  return out;
}
