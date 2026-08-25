import type { Candle } from './types';

/**
 * මේ file එකේ තියෙන්නේ pure ගණන් හදන function ටික විතරයි.
 * හැම එකක්ම input array එකේ දිගටම සමාන දිගක් return කරනවා — තව ගණන්
 * හදන්න data මදි තැන් වලට NaN තියෙනවා. (Chart එකට දෙනකොට NaN ටික
 * indicatorRegistry.ts එකේදී filter වෙනවා.)
 */

/** Simple Moving Average — හරි හරියට period එකක සාමාන්‍යය. */
export function smaArray(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential Moving Average — මුල seed එකට SMA එක ගන්නවා. */
export function emaArray(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/** Wilder's RMA (RSI/ATR වලට ගන්න smoothing එක). */
function rmaArray(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + values[i]) / period;
  }
  return out;
}

/** Relative Strength Index — Wilder smoothing එකෙන් 0–100 අතර අගයක්. */
export function rsiArray(closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  // පළමුව හැම bar එකකම ලාභය/පාඩුව වෙන වෙනම array දෙකකට දානවා.
  const gains = new Array<number>(closes.length).fill(0);
  const losses = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains[i] = Math.max(change, 0);
    losses[i] = Math.max(-change, 0);
  }
  // index 0 එකේ change එකක් නැති නිසා ඒක අයින් කරලා smooth කරනවා.
  const avgGain = rmaArray(gains.slice(1), period);
  const avgLoss = rmaArray(losses.slice(1), period);
  for (let i = 0; i < avgGain.length; i++) {
    if (Number.isNaN(avgGain[i])) continue;
    const rs = avgLoss[i] === 0 ? Infinity : avgGain[i] / avgLoss[i];
    out[i + 1] = avgLoss[i] === 0 ? 100 : 100 - 100 / (1 + rs);
  }
  return out;
}

/** True Range — දැන් bar එකේ range එක, gap එකත් සමඟ. */
function trueRange(cur: Candle, prev: Candle): number {
  return Math.max(
    cur.high - cur.low,
    Math.abs(cur.high - prev.close),
    Math.abs(cur.low - prev.close),
  );
}

/** Average True Range — volatility එක මනින්න. */
export function atrArray(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = new Array<number>(candles.length - 1);
  for (let i = 1; i < candles.length; i++) tr[i - 1] = trueRange(candles[i], candles[i - 1]);
  const smoothed = rmaArray(tr, period);
  for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i];
  return out;
}

/** Bollinger Bands — SMA එකයි, ඒ වටේ standard deviation band දෙකයි. */
export function bollinger(
  closes: number[],
  period: number,
  mult: number,
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = smaArray(closes, period);
  const upper = new Array<number>(closes.length).fill(NaN);
  const lower = new Array<number>(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - middle[i];
      variance += diff * diff;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = middle[i] + mult * sd;
    lower[i] = middle[i] - mult * sd;
  }
  return { upper, middle, lower };
}

/** MACD — EMA දෙකක වෙනස, signal line එක, සහ histogram එක. */
export function macd(
  closes: number[],
  fast: number,
  slow: number,
  signalPeriod: number,
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEma = emaArray(closes, fast);
  const slowEma = emaArray(closes, slow);
  const line = closes.map((_, i) =>
    Number.isNaN(fastEma[i]) || Number.isNaN(slowEma[i]) ? NaN : fastEma[i] - slowEma[i],
  );
  // Signal EMA එක හදන්න NaN නැති කොටස විතරක් අරගෙන, ආපහු තැනට දානවා.
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(closes.length).fill(NaN);
  if (firstValid >= 0) {
    const sig = emaArray(line.slice(firstValid), signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstValid + i] = sig[i];
  }
  const histogram = line.map((v, i) =>
    Number.isNaN(v) || Number.isNaN(signal[i]) ? NaN : v - signal[i],
  );
  return { macd: line, signal, histogram };
}

/**
 * VWAP — දවසක් (UTC) ඇතුළත typical price × volume එකතුව ÷ volume එකතුව.
 * අලුත් UTC දවසක් පටන් ගන්නකොට ගණන් reset වෙනවා.
 */
export function vwapArray(candles: Candle[]): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  let day = -1;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const curDay = Math.floor(c.time / 86400);
    if (curDay !== day) {
      day = curDay;
      pv = 0;
      vol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out[i] = vol > 0 ? pv / vol : NaN;
  }
  return out;
}
