import { dmi, emaArray, macd, rsiArray, smaArray, vwapArray } from './indicators';
import type { Candle } from './types';

/**
 * "Sniper Entry/Exit with SL&TP by KhanSaab V.02" (community version) එකේ
 * ගණන් හදන කොටස. Pine source එකේ තියෙන ලොජික් එකම:
 *
 *  - EMA 9/21/50 ribbon එකයි, VWAP එකයි
 *  - Dual score engine — bull/bear පැත්තට කරුණු 7ක් බැගින් බලලා %
 *  - Signal = EMA9/EMA21 cross (state එකක් තියාගෙන, එකම පැත්තට දෙපාරක් නෑ)
 *  - Retest = trend එකේ ඉන්නකොට price එක ribbon එකට ආපහු ඇවිත් ගැහුව bar
 */

export const SNIPER_FACTORS = 7;

export interface SniperOptions {
  fast: number;
  mid: number;
  slow: number;
  /** පැය/විනාඩි උසස් timeframe RSI එක (Pine `request.security(..., "5", ...)`). */
  rsiHigherTf: number[];
}

export interface SniperResult {
  emaFast: number[];
  emaMid: number[];
  emaSlow: number[];
  vwap: number[];
  bullPct: number[];
  bearPct: number[];
  bias: string[];
  /** +1 = අන්තිම signal එක buy, −1 = sell. */
  state: number[];
  triggerBuy: boolean[];
  triggerSell: boolean[];
  retest: boolean[];
}

/**
 * උසස් timeframe එකක series එකක් chart bars වලට ගළපනවා —
 * Pine `request.security(..., lookahead_off)` වගේ: හැම chart bar එකකටම
 * ඒ මොහොතට ගැළපෙන අන්තිම HTF bar එකේ අගය.
 * (HTF data නැති පරණ bars වලට NaN.)
 */
export function alignHigherTimeframe(
  candles: Candle[],
  htfCandles: Candle[],
  htfValues: number[],
): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (htfCandles.length === 0) return out;
  let j = 0;
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time;
    if (t < htfCandles[0].time) continue; // HTF history එක මීට පස්සේ පටන් ගන්නේ
    while (j + 1 < htfCandles.length && htfCandles[j + 1].time <= t) j++;
    out[i] = htfValues[j];
  }
  return out;
}

/**
 * Pine `ta.rsi(close[1], 14)` — කලින් bar එකේ close එකෙන් හදන RSI එක.
 * (දැන් හැදෙන bar එකේ අගය මාරු වෙන එකෙන් signal එක repaint වෙන එක වළක්වන්න.)
 */
export function rsiOfPreviousClose(candles: Candle[], length: number): number[] {
  const rsi = rsiArray(
    candles.map((c) => c.close),
    length,
  );
  return rsi.map((_, i) => (i === 0 ? NaN : rsi[i - 1]));
}

export function computeSniper(candles: Candle[], o: SniperOptions): SniperResult {
  const n = candles.length;
  const closes = candles.map((c) => c.close);

  const emaFast = emaArray(closes, o.fast);
  const emaMid = emaArray(closes, o.mid);
  const emaSlow = emaArray(closes, o.slow);
  const vwap = vwapArray(candles);
  const rsi = rsiArray(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const { adx } = dmi(candles, 14, 14);
  const volAvg = smaArray(
    candles.map((c) => c.volume),
    20,
  );

  const bullPct = new Array<number>(n).fill(0);
  const bearPct = new Array<number>(n).fill(0);
  const bias = new Array<string>(n).fill('MILD BEAR');
  const state = new Array<number>(n).fill(0);
  const triggerBuy = new Array<boolean>(n).fill(false);
  const triggerSell = new Array<boolean>(n).fill(false);
  const retest = new Array<boolean>(n).fill(false);

  let last = 0;
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const rsiHtf = o.rsiHigherTf[i];

    // ── Dual score engine (කරුණු 7ක් බැගින්) ──────────────────────────
    let bull = 0;
    if (c.close > vwap[i]) bull++;
    if (rsi[i] > 50) bull++;
    if (m.macd[i] > m.signal[i]) bull++;
    if (emaFast[i] > emaMid[i]) bull++;
    if (adx[i] > 25 && c.close > emaFast[i]) bull++;
    if (c.volume > volAvg[i] && c.close > c.open) bull++;
    if (rsiHtf > 50) bull++;

    let bear = 0;
    if (c.close < vwap[i]) bear++;
    if (rsi[i] < 50) bear++;
    if (m.macd[i] < m.signal[i]) bear++;
    if (emaFast[i] < emaMid[i]) bear++;
    if (adx[i] > 25 && c.close < emaFast[i]) bear++;
    if (c.volume > volAvg[i] && c.close < c.open) bear++;
    if (rsiHtf < 50) bear++;

    bullPct[i] = (bull / SNIPER_FACTORS) * 100;
    bearPct[i] = (bear / SNIPER_FACTORS) * 100;
    bias[i] =
      bullPct[i] - bearPct[i] >= 40
        ? 'STRONG BULL'
        : bearPct[i] - bullPct[i] >= 40
          ? 'STRONG BEAR'
          : bullPct[i] > bearPct[i]
            ? 'MILD BULL'
            : 'MILD BEAR';

    // ── Signal — EMA fast/mid cross, එකම පැත්තට දෙපාරක් නෑ ─────────────
    const crossUp = i > 0 && emaFast[i] > emaMid[i] && emaFast[i - 1] <= emaMid[i - 1];
    const crossDown = i > 0 && emaFast[i] < emaMid[i] && emaFast[i - 1] >= emaMid[i - 1];
    triggerBuy[i] = crossUp && last <= 0;
    triggerSell[i] = crossDown && last >= 0;
    if (triggerBuy[i] || triggerSell[i]) last = triggerBuy[i] ? 1 : -1;
    state[i] = last;

    // ── Retest — trend එකේ ඉන්නකොට ribbon එකට ආපහු ඇවිත් ගැහුවද ────────
    retest[i] =
      (last === 1 && c.low <= emaFast[i] && c.low > emaMid[i]) ||
      (last === -1 && c.high >= emaFast[i] && c.high < emaMid[i]);
  }

  return { emaFast, emaMid, emaSlow, vwap, bullPct, bearPct, bias, state, triggerBuy, triggerSell, retest };
}
