import { smaArray } from './indicators';
import type { Candle } from './types';

/**
 * "Trendlines with Breaks [LuxAlgo]" (© LuxAlgo, CC BY-NC-SA 4.0) එකේ port එක.
 *
 * ක්‍රමය: pivot එකක් හම්බවුණාම ඒ pivot එකේ මිලෙන් රේඛාවක් පටන් අරන්,
 * bar එකෙන් bar එකට ස්ථිර බෑවුමකින් ඇදෙනවා —
 *
 *   upper := ph ? ph : upper − slope_ph     (resistance, පහළට ඇදෙනවා)
 *   lower := pl ? pl : lower + slope_pl     (support, උඩට ඇදෙනවා)
 *
 * අලුත් pivot එකක් ආවම රේඛාව ඒ තැනට reset වෙනවා. Price එක රේඛාව
 * පැන්නොත් "B" breakout label එකක්.
 *
 * ⚠️ Backpainting: Pine එකේ `plot(..., offset = -length)` කියන්නේ අගය
 *    bars `length`ක් **අතීතයට** තල්ලු කරලා අඳින එක. ඒ නිසා pivot එක
 *    ඇත්තටම හැදුණු තැනින්ම රේඛාව පටන් ගන්නවා වගේ පේනවා — ඒත් ඒ තොරතුර
 *    ඒ මොහොතේ තිබුණේ නෑ. `backpaint` එක off කළොත් රේඛාව තියෙන්නේ ඒ
 *    මොහොතේ ඇත්තටම දැනගන්න තිබුණු තැන.
 *    **Breakout "B" labels backpaint වෙන්නේ නෑ** — ඒවා real-time.
 */

export type LuxSlopeMethod = 'Atr' | 'Stdev' | 'Linreg';

export interface LuxTrendlineOptions {
  /** Pivot points period (Pine `length`). */
  length: number;
  /** Slope steepness (Pine `mult`). 0 = තිරස් මට්ටම්. */
  mult: number;
  method: LuxSlopeMethod;
  backpaint: boolean;
  showExtended: boolean;
}

export interface LuxBreak {
  index: number;
  /** +1 = upper break (bullish), −1 = lower break (bearish). */
  dir: 1 | -1;
  /** Label එක තියෙන මිල — Pine එකේ upper break එකට `low`, lower එකට `high`. */
  price: number;
}

/** දකුණට දිගු වෙන tිත් රේඛාව (Pine `uptl` / `dntl`). */
export interface LuxRay {
  index: number;
  price: number;
  /** Bar එකකට වෙනස් වෙන ප්‍රමාණය. */
  slope: number;
}

export interface LuxTrendlineResult {
  /** Chart bar index එකට අදාළව අඳින අගය (NaN = නොපෙනෙන). */
  upperPlot: number[];
  lowerPlot: number[];
  /** Pine එකේ `color = ph ? na : upCss` — reset bar එකේදී රේඛාව කැඩෙනවා. */
  upperGap: boolean[];
  lowerGap: boolean[];
  breaks: LuxBreak[];
  upRay: LuxRay | null;
  dnRay: LuxRay | null;
}

/**
 * Pine `ta.atr(len)` = `ta.rma(ta.tr(true), len)`.
 *
 * ⚠️ මේක app එකේ shared `atrArray()` එකට වඩා පොඩ්ඩක් වෙනස්: Pine එකේ
 *    `ta.tr(true)` bar 0 එකේදී `high − low` ලබා දෙනවා (කලින් close එකක්
 *    නැති නිසා), ඒත් shared එක ඒ bar එක මුළුමනින්ම අත්හරිනවා. ඒකෙන්
 *    seed එක වෙනස් වෙලා RMA එකේ දිගු මතකය නිසා පොඩි වෙනසක් හැමතිස්සෙම
 *    රැඳෙනවා. "හරියටම මුල් script එක" ඕන නිසා මෙතන Pine ගේ එකම.
 */
function pineAtr(candles: Candle[], length: number): number[] {
  const n = candles.length;
  const tr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    tr[i] =
      i === 0
        ? c.high - c.low
        : Math.max(
            c.high - c.low,
            Math.abs(c.high - candles[i - 1].close),
            Math.abs(c.low - candles[i - 1].close),
          );
  }
  // Pine `ta.rma` — SMA එකකින් පටන් අරන් Wilder smoothing.
  const out = new Array<number>(n).fill(NaN);
  if (n < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += tr[i];
  out[length - 1] = sum / length;
  for (let i = length; i < n; i++) out[i] = (out[i - 1] * (length - 1) + tr[i]) / length;
  return out;
}

/** Pine `ta.stdev(src, len)` — biased (population) අගය. */
function stdevArray(values: number[], length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  const mean = smaArray(values, length);
  for (let i = length - 1; i < n; i++) {
    if (Number.isNaN(mean[i])) continue;
    let sum = 0;
    for (let k = i - length + 1; k <= i; k++) {
      const d = values[k] - mean[i];
      sum += d * d;
    }
    out[i] = Math.sqrt(sum / length);
  }
  return out;
}

/** Pine `ta.variance(src, len)` — biased (population) අගය. */
function varianceArray(values: number[], length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  const mean = smaArray(values, length);
  for (let i = length - 1; i < n; i++) {
    if (Number.isNaN(mean[i])) continue;
    let sum = 0;
    for (let k = i - length + 1; k <= i; k++) {
      const d = values[k] - mean[i];
      sum += d * d;
    }
    out[i] = sum / length;
  }
  return out;
}

/** Pine `ta.pivothigh(length, length)` — දෙපැත්තේම `length` bars. */
function pivotHighAt(candles: Candle[], center: number, length: number): boolean {
  if (center - length < 0 || center + length >= candles.length) return false;
  const v = candles[center].high;
  for (let k = center - length; k <= center + length; k++) {
    if (k !== center && candles[k].high >= v) return false;
  }
  return true;
}

function pivotLowAt(candles: Candle[], center: number, length: number): boolean {
  if (center - length < 0 || center + length >= candles.length) return false;
  const v = candles[center].low;
  for (let k = center - length; k <= center + length; k++) {
    if (k !== center && candles[k].low <= v) return false;
  }
  return true;
}

export function computeLuxTrendlines(
  candles: Candle[],
  o: LuxTrendlineOptions,
): LuxTrendlineResult {
  const n = candles.length;
  const empty: LuxTrendlineResult = {
    upperPlot: [], lowerPlot: [], upperGap: [], lowerGap: [],
    breaks: [], upRay: null, dnRay: null,
  };
  if (n === 0) return empty;

  const length = Math.max(1, Math.floor(o.length));
  const src = candles.map((c) => c.close);
  // Pine `n = bar_index`.
  const barIndex = candles.map((_, i) => i);

  // ── Slope calculation method ────────────────────────────────────────
  const slope = new Array<number>(n).fill(NaN);
  if (o.method === 'Atr') {
    const atr = pineAtr(candles, length);
    for (let i = 0; i < n; i++) slope[i] = (atr[i] / length) * o.mult;
  } else if (o.method === 'Stdev') {
    const sd = stdevArray(src, length);
    for (let i = 0; i < n; i++) slope[i] = (sd[i] / length) * o.mult;
  } else {
    // abs(cov(src, n)) / var(n) / 2 * mult
    const srcTimesN = src.map((v, i) => v * barIndex[i]);
    const smaSrcN = smaArray(srcTimesN, length);
    const smaSrc = smaArray(src, length);
    const smaN = smaArray(barIndex, length);
    const varN = varianceArray(barIndex, length);
    for (let i = 0; i < n; i++) {
      slope[i] = (Math.abs(smaSrcN[i] - smaSrc[i] * smaN[i]) / varN[i] / 2) * o.mult;
    }
  }

  // ── Pine state ──────────────────────────────────────────────────────
  const upper = new Array<number>(n).fill(0);
  const lower = new Array<number>(n).fill(0);
  const slopePh = new Array<number>(n).fill(0);
  const slopePl = new Array<number>(n).fill(0);
  const phAt = new Array<boolean>(n).fill(false);
  const plAt = new Array<boolean>(n).fill(false);
  const upos = new Array<number>(n).fill(0);
  const dnos = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    // Pivot එක confirm වෙන්නේ `length` bars ට පස්සේ — ඒ නිසා bar i එකේදී
    // බලන්නේ bar (i − length) එක pivot එකක්ද කියලා.
    const center = i - length;
    const isPh = center >= 0 && pivotHighAt(candles, center, length);
    const isPl = center >= 0 && pivotLowAt(candles, center, length);
    phAt[i] = isPh;
    plAt[i] = isPl;

    const prevUpper = i > 0 ? upper[i - 1] : 0;
    const prevLower = i > 0 ? lower[i - 1] : 0;
    const prevSlopePh = i > 0 ? slopePh[i - 1] : 0;
    const prevSlopePl = i > 0 ? slopePl[i - 1] : 0;
    const s = Number.isNaN(slope[i]) ? 0 : slope[i];

    slopePh[i] = isPh ? s : prevSlopePh;
    slopePl[i] = isPl ? s : prevSlopePl;

    upper[i] = isPh ? candles[center].high : prevUpper - slopePh[i];
    lower[i] = isPl ? candles[center].low : prevLower + slopePl[i];

    // Breakout state — pivot එකක් ආවම 0ට reset, රේඛාව පැන්නම 1.
    const prevUpos = i > 0 ? upos[i - 1] : 0;
    const prevDnos = i > 0 ? dnos[i - 1] : 0;
    const realtimeUpper = upper[i] - slopePh[i] * length;
    const realtimeLower = lower[i] + slopePl[i] * length;
    upos[i] = isPh ? 0 : candles[i].close > realtimeUpper ? 1 : prevUpos;
    dnos[i] = isPl ? 0 : candles[i].close < realtimeLower ? 1 : prevDnos;
  }

  // ── Plots ───────────────────────────────────────────────────────────
  // Pine: plot(backpaint ? upper : upper − slope_ph*length, offset = −offset)
  const offset = o.backpaint ? length : 0;
  const upperPlot = new Array<number>(n).fill(NaN);
  const lowerPlot = new Array<number>(n).fill(NaN);
  const upperGap = new Array<boolean>(n).fill(false);
  const lowerGap = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const target = i - offset;
    if (target < 0) continue;
    upperPlot[target] = o.backpaint ? upper[i] : upper[i] - slopePh[i] * length;
    lowerPlot[target] = o.backpaint ? lower[i] : lower[i] + slopePl[i] * length;
    // `color = ph ? na : upCss` — reset වුණු bar එකේදී රේඛාව නොපෙනෙනවා.
    upperGap[target] = phAt[i];
    lowerGap[target] = plAt[i];
  }

  // ── Breakouts (backpaint වෙන්නේ නෑ — real-time) ─────────────────────
  const breaks: LuxBreak[] = [];
  for (let i = 1; i < n; i++) {
    if (upos[i] > upos[i - 1]) breaks.push({ index: i, dir: 1, price: candles[i].low });
    if (dnos[i] > dnos[i - 1]) breaks.push({ index: i, dir: -1, price: candles[i].high });
  }

  // ── Extended dashed rays — අන්තිම pivot එකෙන් දකුණට ─────────────────
  let upRay: LuxRay | null = null;
  let dnRay: LuxRay | null = null;
  if (o.showExtended) {
    for (let i = n - 1; i >= 0; i--) {
      if (upRay === null && phAt[i]) {
        const anchor = i - offset;
        if (anchor >= 0) {
          const s = slopePh[i];
          upRay = {
            index: anchor,
            price: o.backpaint ? upper[i] : upper[i] - s * length,
            slope: -s,
          };
        }
      }
      if (dnRay === null && plAt[i]) {
        const anchor = i - offset;
        if (anchor >= 0) {
          const s = slopePl[i];
          dnRay = {
            index: anchor,
            price: o.backpaint ? lower[i] : lower[i] + s * length,
            slope: s,
          };
        }
      }
      if (upRay && dnRay) break;
    }
  }

  return { upperPlot, lowerPlot, upperGap, lowerGap, breaks, upRay, dnRay };
}
