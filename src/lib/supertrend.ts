import { sourceSeries } from './madLoop';
import type { Candle } from './types';

/**
 * "Supertrend" (© KivancOzbilgic) එකේ port එක.
 *
 * ATR එකෙන් හදන trailing stop එකක්:
 *
 *   up = src − mult×atr ,  dn = src + mult×atr
 *   up := close[1] > up[1] ? max(up, up[1]) : up     (උඩට විතරයි යන්නේ)
 *   dn := close[1] < dn[1] ? min(dn, dn[1]) : dn     (පහළට විතරයි යන්නේ)
 *   trend −1 සිට +1 ට හැරෙන්නේ close > dn[1] වුණාම, ආපහු up[1] කැඩුවාම.
 *
 * Trend එක +1 නම් කොළ `up` රේඛාව (price එකට යටින්), −1 නම් රතු `dn`
 * රේඛාව (උඩින්). හැරෙන තැන "Buy" / "Sell" label එකක්.
 */

export interface SupertrendOptions {
  /** Pine `Periods` — ATR period. */
  periods: number;
  source: string;
  multiplier: number;
  /**
   * Pine `changeATR`. true (default) = `atr(Periods)` — ඒ කියන්නේ
   * RMA smoothing. false = `sma(tr, Periods)`.
   */
  changeAtr: boolean;
}

export interface SupertrendResult {
  up: number[];
  dn: number[];
  /** +1 = uptrend (කොළ), −1 = downtrend (රතු). */
  trend: number[];
  buySignals: number[];
  sellSignals: number[];
}

/**
 * Pine `tr(true)` — bar 0 එකේදී `high − low`.
 * (`atr()` ඇතුළේ පාවිච්චි වෙන්නේ මේක.)
 */
function trueRangeTrue(candles: Candle[]): number[] {
  return candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(
          c.high - c.low,
          Math.abs(c.high - candles[i - 1].close),
          Math.abs(c.low - candles[i - 1].close),
        ),
  );
}

/**
 * Pine built-in `tr` (= `tr(false)`) — bar 0 එකේදී `close[1]` නැති නිසා
 * **na**. `atr2 = sma(tr, Periods)` එකට යන්නේ මේක, ඒ නිසා ඒ අගය
 * bar `Periods` දක්වා na (bar 0 window එකේ තියෙන තාක්).
 */
function trueRangeFalse(candles: Candle[]): number[] {
  return candles.map((c, i) =>
    i === 0
      ? NaN
      : Math.max(
          c.high - c.low,
          Math.abs(c.high - candles[i - 1].close),
          Math.abs(c.low - candles[i - 1].close),
        ),
  );
}

/** Pine `rma` — SMA එකකින් පටන් අරන් Wilder smoothing. */
function rma(values: number[], length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += values[i];
  out[length - 1] = sum / length;
  for (let i = length; i < n; i++) out[i] = (out[i - 1] * (length - 1) + values[i]) / length;
  return out;
}

/** Pine `sma` — window එකේ na එකක් තිබුණොත් ප්‍රතිඵලයත් na. */
function smaWithNa(values: number[], length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = length - 1; i < n; i++) {
    let sum = 0;
    let ok = true;
    for (let k = i - length + 1; k <= i; k++) {
      if (Number.isNaN(values[k])) {
        ok = false;
        break;
      }
      sum += values[k];
    }
    if (ok) out[i] = sum / length;
  }
  return out;
}

export function computeSupertrend(
  candles: Candle[],
  o: SupertrendOptions,
): SupertrendResult {
  const n = candles.length;
  if (n === 0) return { up: [], dn: [], trend: [], buySignals: [], sellSignals: [] };

  const periods = Math.max(1, Math.floor(o.periods));
  const src = sourceSeries(candles, o.source);
  const atr = o.changeAtr
    ? rma(trueRangeTrue(candles), periods)
    : smaWithNa(trueRangeFalse(candles), periods);

  const up = new Array<number>(n).fill(NaN);
  const dn = new Array<number>(n).fill(NaN);
  const trend = new Array<number>(n).fill(1);
  const buySignals: number[] = [];
  const sellSignals: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = atr[i];
    let rawUp = src[i] - o.multiplier * a;
    let rawDn = src[i] + o.multiplier * a;

    // `up1 = nz(up[1], up)` — කලින් bar එකේ **අවසන්** අගය, නැත්නම් දැන් එක.
    const prevUp = i > 0 ? up[i - 1] : NaN;
    const prevDn = i > 0 ? dn[i - 1] : NaN;
    const up1 = Number.isNaN(prevUp) ? rawUp : prevUp;
    const dn1 = Number.isNaN(prevDn) ? rawDn : prevDn;

    // `close[1] > up1 ? max(up, up1) : up` — bar 0 එකේ close[1] na නිසා
    // සැසඳීම false, අගය එහෙම්මම.
    const prevClose = i > 0 ? candles[i - 1].close : NaN;
    if (!Number.isNaN(prevClose) && prevClose > up1) rawUp = Math.max(rawUp, up1);
    if (!Number.isNaN(prevClose) && prevClose < dn1) rawDn = Math.min(rawDn, dn1);
    up[i] = rawUp;
    dn[i] = rawDn;

    // `trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend`
    // ⚠️ සැසඳෙන්නේ **dn1 / up1** එක්ක (කලින් bar එකේ අගය), අලුත් එක්ක නෙවෙයි.
    // NaN එක්ක සැසඳුවොත් Pine එකේ false — JS එකේත් එහෙමමයි.
    const prev = i > 0 ? trend[i - 1] : 1;
    const close = candles[i].close;
    let t = prev;
    if (prev === -1 && close > dn1) t = 1;
    else if (prev === 1 && close < up1) t = -1;
    trend[i] = t;

    if (i > 0) {
      if (t === 1 && trend[i - 1] === -1) buySignals.push(i);
      if (t === -1 && trend[i - 1] === 1) sellSignals.push(i);
    }
  }

  return { up, dn, trend, buySignals, sellSignals };
}
