import { smaArray } from './indicators';
import { sourceSeries } from './madLoop';
import type { Candle } from './types';

/**
 * "Trend Regularity Adaptive Moving Average (TRAMA)" (© LuxAlgo,
 * CC BY-NC-SA 4.0) එකේ port එක.
 *
 * අදහස: trend එකක් දිගටම යනකොට අලුත් highest-high / lowest-low වැඩිපුර
 * හැදෙනවා; range එකකදී ඒවා අඩුයි. ඒ **වාර ගණන** smoothing factor එක
 * විදිහට පාවිච්චි කරනවා —
 *
 *   hh = අලුත් highest high එකක් හැදුනාද (1/0)
 *   ll = අලුත් lowest low එකක් හැදුනාද (1/0)
 *   tc = sma(hh හෝ ll ? 1 : 0, length)²
 *   ama := ama[1] + tc × (src − ama[1])
 *
 * `tc` කියන්නේ EMA එකක alpha එක. Trend එකේදී ලොකුයි (MA එක price එකට
 * ළං වෙනවා), range එකේදී පොඩියි (MA එක නොසෙල්වී තියෙනවා). වර්ග කරන එකෙන්
 * පොඩි අගයන්ට තවත් දඬුවම් කරනවා — ඒකයි range එකේදී මේක මෙච්චර
 * නිශ්චලව තියෙන්නේ.
 */

export interface TramaOptions {
  /** Pine `length` — වැඩි කළොත් සිනිඳුයි. */
  length: number;
  source: string;
}

/** Pine `highest(length)` — source එක default එකට `high`. na මුල් bars වලට. */
function rollingHighest(values: number[], length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = length - 1; i < n; i++) {
    let m = -Infinity;
    for (let k = i - length + 1; k <= i; k++) if (values[k] > m) m = values[k];
    out[i] = m;
  }
  return out;
}

/** Pine `lowest(length)` — source එක default එකට `low`. */
function rollingLowest(values: number[], length: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  for (let i = length - 1; i < n; i++) {
    let m = Infinity;
    for (let k = i - length + 1; k <= i; k++) if (values[k] < m) m = values[k];
    out[i] = m;
  }
  return out;
}

export interface TramaResult {
  ama: number[];
  /** Smoothing factor එක (0–1) — debug/පරීක්ෂාවට. */
  tc: number[];
}

export function computeTrama(candles: Candle[], o: TramaOptions): TramaResult {
  const n = candles.length;
  if (n === 0) return { ama: [], tc: [] };

  const length = Math.max(1, Math.floor(o.length));
  const src = sourceSeries(candles, o.source);
  const highest = rollingHighest(candles.map((c) => c.high), length);
  const lowest = rollingLowest(candles.map((c) => c.low), length);

  // hh = max(sign(change(highest(length))), 0)
  // ll = max(sign(change(lowest(length)) × −1), 0)
  //
  // `change()` එක na නම් (මුල් bars) sign එකත් na, ඒ නිසා `hh or ll`
  // false — Pine එකේ na boolean context එකකදී false.
  const flag = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (Number.isNaN(highest[i]) || Number.isNaN(highest[i - 1])) continue;
    const hh = Math.max(Math.sign(highest[i] - highest[i - 1]), 0);
    const ll = Math.max(Math.sign((lowest[i] - lowest[i - 1]) * -1), 0);
    flag[i] = hh !== 0 || ll !== 0 ? 1 : 0;
  }

  // tc = pow(sma(flag, length), 2)
  const smoothed = smaArray(flag, length);
  const tc = smoothed.map((v) => (Number.isNaN(v) ? NaN : v * v));

  // ama := nz(ama[1] + tc × (src − ama[1]), src)
  //
  // මුල් bar එකේ ama[1] na, සහ sma එක හැදෙනකම් tc na — ඒ දෙකේදීම
  // සම්පූර්ණ expression එක na වෙලා `nz` එකෙන් `src` එක එනවා. ඒ නිසා
  // warmup එකේදී ama එක src එකම අනුගමනය කරනවා.
  const ama = new Array<number>(n).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    const next = prev + tc[i] * (src[i] - prev);
    ama[i] = Number.isFinite(next) ? next : src[i];
    prev = ama[i];
  }

  return { ama, tc };
}
