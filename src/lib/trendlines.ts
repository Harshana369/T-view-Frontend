import { atrArray } from './indicators';
import type { Candle } from './types';

/**
 * "Trendlines" (© ebecihalil, MPL-2.0) එකේ port එක.
 *
 * අදහස: pivots දෙකකින් හදන්න පුළුවන් රේඛා **සියල්ලම** පරීක්ෂා කරලා, ඒවා
 * අතරින් **දැන් price එකට ළඟම** තියෙන වලංගු එක විතරක් අඳිනවා. ඒ නිසා
 * chart එක පරණ trendlines වලින් පිරෙන්නේ නෑ — දැන් වැඩ කරන support එකයි
 * resistance එකයි විතරයි.
 *
 * රේඛාවක් වලංගු වෙන්නේ:
 *   • ATR×0.5 ඇතුළේ pivots `minTouches` ගාණක් ඇල්ලුවොත්, සහ
 *   • ඒක bars 5කට කලින් **බිඳිලා නැත්නම්**. (අන්තිම bars 5 stability
 *     buffer එක — breakout එකක් වුණු ගමන් zone එක අතුරුදන් වෙන්නේ නෑ,
 *     ඒ නිසා breakout එකද fakeout එකද retest එකද කියලා බලාගන්න පුළුවන්.)
 */

export interface TrendlineOptions {
  /** Pivots හොයන්නේ පිටිපස්සට bars කීයකද. */
  backBars: number;
  pivotSource: 'High/Low' | 'Close';
  /** Swing එකක් වෙන්න දෙපැත්තේම ඕන bars ගාණ (5-15). */
  pivotStrength: number;
  /** රේඛාවක් වලංගු වෙන්න ඕන touches ගාණ (2-8). */
  minTouches: number;
}

/** Chart එකේ අඳින කලාපයක් — රේඛා දෙකක් අතර. */
export interface TrendZone {
  side: 'resistance' | 'support';
  /** කලාපය පටන් ගන්න bar එක. */
  startIndex: number;
  /** `startIndex` එකේ මධ්‍ය අගය. */
  startPrice: number;
  /** Bar එකකට වෙනස් වෙන ප්‍රමාණය. */
  slope: number;
  /** මධ්‍ය රේඛාවේ ඉඳන් උඩ/යට කලාපයේ පළල. */
  offsetUp: number;
  offsetDown: number;
  touches: number;
  /** අන්තිම bar එකේ කලාපයේ උඩ/යට කෙළවර. */
  top: number;
  bottom: number;
}

export interface TrendlineResult {
  resistance: TrendZone | null;
  support: TrendZone | null;
  /** Close එකක් කලාපය හරහා අනිත් පැත්තට ගියා (Pine "Zone Breakout"). */
  breakout: boolean;
  /** Wick එකක් කලාපය ඇතුළට ආවා (Pine "Zone Touch"). */
  touch: boolean;
}

/** Pine `ta.pivothigh(src, len, len)`. */
function pivotHighs(values: number[], len: number): { price: number; index: number }[] {
  const out: { price: number; index: number }[] = [];
  for (let i = len; i + len < values.length; i++) {
    const v = values[i];
    let ok = true;
    for (let k = i - len; k <= i + len && ok; k++) {
      if (k !== i && values[k] >= v) ok = false;
    }
    if (ok) out.push({ price: v, index: i });
  }
  return out;
}

function pivotLows(values: number[], len: number): { price: number; index: number }[] {
  const out: { price: number; index: number }[] = [];
  for (let i = len; i + len < values.length; i++) {
    const v = values[i];
    let ok = true;
    for (let k = i - len; k <= i + len && ok; k++) {
      if (k !== i && values[k] <= v) ok = false;
    }
    if (ok) out.push({ price: v, index: i });
  }
  return out;
}

/** Pine `FIXED_ATR_MULT` — කලාපයේ පළල ATR එකෙන් කීයද. */
const ATR_MULT = 0.5;
/** Pine `FIXED_STABILITY` — breakout එකකට පස්සේ zone එක තියාගන්න bars ගාණ. */
const STABILITY_BARS = 5;

/**
 * Pivots ලැයිස්තුවකින් price එකට ළඟම වලංගු කලාපය හොයනවා.
 * Pine `findClosestZone()` එකේ loop තුනම එහෙම්මම — pair එකකින් slope එකක්,
 * ඒ රේඛාවට ළං වෙන pivots ගණන් කරලා, කලාපයේ පළල ඒ pivots වලින්ම හදනවා.
 */
function findClosestZone(
  pivots: { price: number; index: number }[],
  isResistance: boolean,
  lastIndex: number,
  lastClose: number,
  maxThreshold: number,
  o: TrendlineOptions,
): TrendZone | null {
  const size = pivots.length;
  if (size < o.minTouches || !(maxThreshold > 0)) return null;

  const lookbackThreshold = lastIndex - o.backBars;
  const stabilityThreshold = lastIndex - STABILITY_BARS;

  let minDistance = Infinity;
  let best: TrendZone | null = null;

  for (let i = 0; i <= size - 2; i++) {
    const p1x = pivots[i].index;
    // Anchor එක window එකෙන් පිටත නම් මඟ හරිනවා (Pine එකේ i විතරයි
    // මේ filter එකට යටත් වෙන්නේ — j සහ k ඔක්කොම බලනවා).
    if (p1x < lookbackThreshold) continue;
    const p1y = pivots[i].price;

    for (let j = i + 1; j < size; j++) {
      const p2x = pivots[j].index;
      if (p2x === p1x) continue;
      const slope = (pivots[j].price - p1y) / (p2x - p1x);

      let touches = 0;
      let broken = false;
      let maxUp = 0;
      let maxDown = 0;

      for (let k = 0; k < size; k++) {
        const pkx = pivots[k].index;
        if (pkx < p1x) continue;

        const diff = pivots[k].price - (p1y + slope * (pkx - p1x));

        if (Math.abs(diff) <= maxThreshold) {
          touches++;
          if (diff > maxUp) maxUp = diff;
          if (diff < maxDown) maxDown = diff;
        }

        // Stability buffer: අන්තිම bars 5 ඇතුළේ බිඳුනාට කමක් නෑ —
        // ඊට කලින් බිඳිලා නම් විතරයි රේඛාව අහෝසි කරන්නේ.
        if (pkx < stabilityThreshold) {
          if (isResistance && diff > maxThreshold) {
            broken = true;
            break;
          }
          if (!isResistance && diff < -maxThreshold) {
            broken = true;
            break;
          }
        }
      }

      if (touches >= o.minTouches && !broken) {
        const projected = p1y + slope * (lastIndex - p1x);
        const dist = Math.abs(projected - lastClose);
        if (dist < minDistance) {
          minDistance = dist;
          best = {
            side: isResistance ? 'resistance' : 'support',
            startIndex: p1x,
            startPrice: p1y,
            slope,
            offsetUp: maxUp,
            offsetDown: maxDown,
            touches,
            top: projected + maxUp,
            bottom: projected + maxDown,
          };
        }
      }
    }
  }

  return best;
}

/** Zone එකේ මධ්‍ය අගය bar `index` එකේදී. */
export function zonePriceAt(zone: TrendZone, index: number): number {
  return zone.startPrice + zone.slope * (index - zone.startIndex);
}

export function computeTrendlines(candles: Candle[], o: TrendlineOptions): TrendlineResult {
  const n = candles.length;
  const empty: TrendlineResult = {
    resistance: null,
    support: null,
    breakout: false,
    touch: false,
  };
  if (n < o.pivotStrength * 2 + 2) return empty;

  const atr = atrArray(candles, 14);
  const last = n - 1;
  const maxThreshold = atr[last] * ATR_MULT;
  if (!Number.isFinite(maxThreshold) || maxThreshold <= 0) return empty;

  const useClose = o.pivotSource === 'Close';
  const srcHigh = candles.map((c) => (useClose ? c.close : c.high));
  const srcLow = candles.map((c) => (useClose ? c.close : c.low));

  const lastClose = candles[last].close;
  const resistance = findClosestZone(
    pivotHighs(srcHigh, o.pivotStrength),
    true,
    last,
    lastClose,
    maxThreshold,
    o,
  );
  const support = findClosestZone(
    pivotLows(srcLow, o.pivotStrength),
    false,
    last,
    lastClose,
    maxThreshold,
    o,
  );

  // ── Alerts ─────────────────────────────────────────────────────────
  // Pine එකේ state එක bar එකෙන් bar එකට රැඳෙනවා, ඒත් zone එකත් හැම
  // bar එකකදීම අලුතෙන් හැදෙනවා. මෙතන **දැන් තියෙන** zone එකට කලින්
  // bar එකේ close එක සසඳලා පැත්ත මාරු වුණාද කියලා බලනවා — ප්‍රායෝගිකව
  // එකම දේ, ඒත් bar එකකට එහාට ඉතිහාසය තියාගන්නේ නෑ.
  let breakout = false;
  let touch = false;
  const prevClose = n >= 2 ? candles[n - 2].close : lastClose;
  const bar = candles[last];

  for (const zone of [resistance, support]) {
    if (!zone) continue;
    const { top, bottom } = zone;
    const sideNow = lastClose > top ? 1 : lastClose < bottom ? -1 : 0;
    const sideBefore = prevClose > top ? 1 : prevClose < bottom ? -1 : 0;
    if (sideNow !== 0 && sideBefore !== 0 && sideNow !== sideBefore) breakout = true;
    if ((bar.high >= bottom && bar.high <= top) || (bar.low <= top && bar.low >= bottom)) {
      touch = true;
    }
  }

  return { resistance, support, breakout, touch };
}
