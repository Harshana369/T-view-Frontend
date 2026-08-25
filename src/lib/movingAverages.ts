import { emaArray, rmaArray, smaArray } from './indicators';

/**
 * "Mean Deviation Loop | Lyro RS" වගේ Pine scripts වල තෝරාගන්න පුළුවන්
 * moving average වර්ග ටික. හැම function එකක්ම input එකේ දිගටම සමාන දිගක්
 * return කරනවා — ගණන් හදන්න data මදි තැන් වලට NaN.
 *
 * සටහන: SMA/EMA/WMA/VWMA/RMA/SMMA/DEMA/TEMA/HMA/LSMA/ALMA/ZLSMA/KAMA මේවා
 * සම්මත (TradingView `ta.*`) සූත්‍ර. FRAMA/JMA/T3 කියන්නේ implementation
 * කීපයක් තියෙන ඒවා — මෙතන තියෙන්නේ බහුලවම පාවිච්චි වෙන Ehlers/Jurik/Tillson
 * versions. ඒ නිසා ඒ තුනෙන් එකක් තෝරගත්තොත් TradingView එකට වඩා පොඩි
 * වෙනසක් තියෙන්න පුළුවන්.
 */

export const MA_TYPES = [
  'SMA',
  'EMA',
  'WMA',
  'VWMA',
  'DEMA',
  'TEMA',
  'RMA',
  'HMA',
  'LSMA',
  'SMMA',
  'ALMA',
  'ZLSMA',
  'FRAMA',
  'KAMA',
  'JMA',
  'T3',
] as const;

export type MaType = (typeof MA_TYPES)[number];

/**
 * මුලින් තියෙන NaN ටික අයින් කරලා ගණන් හදලා, ආපහු NaN ටික දාලා දෙනවා.
 * (EMA එකක් තව EMA එකකට දෙනකොට වගේ තැන් වලට ඕන.)
 */
function onValid(values: number[], fn: (v: number[]) => number[]): number[] {
  const start = values.findIndex((x) => !Number.isNaN(x));
  if (start < 0) return values.map(() => NaN);
  const head = new Array<number>(start).fill(NaN);
  return head.concat(fn(values.slice(start)));
}

/** Weighted MA — අලුත්ම bar එකට වැඩිම බර. */
export function wmaArray(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let k = 0; k < period; k++) sum += values[i - k] * (period - k);
    out[i] = sum / denom;
  }
  return out;
}

/** Volume Weighted MA — sma(src*vol) / sma(vol). */
export function vwmaArray(values: number[], volumes: number[], period: number): number[] {
  const pv = values.map((v, i) => v * volumes[i]);
  const num = smaArray(pv, period);
  const den = smaArray(volumes, period);
  return num.map((v, i) => (den[i] ? v / den[i] : NaN));
}

/** Double EMA — 2·EMA − EMA(EMA). */
export function demaArray(values: number[], period: number): number[] {
  const e1 = emaArray(values, period);
  const e2 = onValid(e1, (v) => emaArray(v, period));
  return e1.map((v, i) => 2 * v - e2[i]);
}

/** Triple EMA — 3·EMA − 3·EMA² + EMA³. */
export function temaArray(values: number[], period: number): number[] {
  const e1 = emaArray(values, period);
  const e2 = onValid(e1, (v) => emaArray(v, period));
  const e3 = onValid(e2, (v) => emaArray(v, period));
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

/** Hull MA — WMA(2·WMA(n/2) − WMA(n), √n). */
export function hmaArray(values: number[], period: number): number[] {
  const half = Math.max(1, Math.round(period / 2));
  const sqrt = Math.max(1, Math.round(Math.sqrt(period)));
  const wHalf = wmaArray(values, half);
  const wFull = wmaArray(values, period);
  const diff = wHalf.map((v, i) => 2 * v - wFull[i]);
  return onValid(diff, (v) => wmaArray(v, sqrt));
}

/**
 * Least Squares MA (Pine `ta.linreg(src, length, 0)`) —
 * අන්තිම bars `period` ගණනට linear regression line එකක් ගහලා,
 * දැන් තියෙන bar එකේ අගය ගන්නවා.
 */
export function lsmaArray(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const n = period;
  const sumX = ((n - 1) * n) / 2;
  const sumXX = ((n - 1) * n * (2 * n - 1)) / 6;
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return out;

  for (let i = n - 1; i < values.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    for (let k = 0; k < n; k++) {
      const y = values[i - n + 1 + k]; // k = 0 පරණම bar එක
      sumY += y;
      sumXY += k * y;
    }
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    out[i] = intercept + slope * (n - 1); // දැන් තියෙන bar එකේ අගය
  }
  return out;
}

/**
 * Arnaud Legoux MA. Script එකේ call එක `ALMA(src, length, 0, 20)` —
 * offset 0, sigma 20 (Pine `ta.alma` එකේම සූත්‍රය).
 */
export function almaArray(
  values: number[],
  period: number,
  offset = 0,
  sigma = 20,
): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const m = offset * (period - 1);
  const s = period / sigma;
  const weights = new Array<number>(period);
  let norm = 0;
  for (let k = 0; k < period; k++) {
    weights[k] = Math.exp(-((k - m) ** 2) / (2 * s * s));
    norm += weights[k];
  }
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    // Pine: series[period - k - 1] => k = 0 පරණම bar එක
    for (let k = 0; k < period; k++) sum += values[i - (period - 1) + k] * weights[k];
    out[i] = sum / norm;
  }
  return out;
}

/** Zero Lag LSMA — LSMA එකට තියෙන පරක්කුව ආපහු එකතු කරනවා. */
export function zlsmaArray(values: number[], period: number): number[] {
  const l1 = lsmaArray(values, period);
  const l2 = onValid(l1, (v) => lsmaArray(v, period));
  return l1.map((v, i) => 2 * v - l2[i]);
}

/**
 * Fractal Adaptive MA (Ehlers) — window එකේ fractal dimension එක අනුව
 * smoothing එක ඉබේම වෙනස් වෙනවා (trend එකේදී ඉක්මන්, side-ways වලදී හෙමින්).
 */
export function framaArray(values: number[], period: number): number[] {
  const n = period % 2 === 0 ? period : period + 1; // සමාන කොටස් දෙකකට බෙදෙන්න ඕන
  const half = n / 2;
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < n) return out;

  const rangeOf = (from: number, to: number) => {
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = from; i <= to; i++) {
      if (values[i] > hi) hi = values[i];
      if (values[i] < lo) lo = values[i];
    }
    return hi - lo;
  };

  out[n - 1] = smaArray(values, n)[n - 1];
  for (let i = n; i < values.length; i++) {
    const n1 = rangeOf(i - half + 1, i) / half; // අලුත් භාගය
    const n2 = rangeOf(i - n + 1, i - half) / half; // පරණ භාගය
    const n3 = rangeOf(i - n + 1, i) / n; // මුළු window එක
    let alpha = 0.5;
    if (n1 > 0 && n2 > 0 && n3 > 0) {
      const d = (Math.log(n1 + n2) - Math.log(n3)) / Math.LN2;
      alpha = Math.exp(-4.6 * (d - 1));
    }
    alpha = Math.min(1, Math.max(0.01, alpha));
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/**
 * Kaufman Adaptive MA — efficiency ratio එක අනුව fast(2)/slow(30) අතර
 * smoothing එක වෙනස් වෙනවා.
 */
export function kamaArray(values: number[], period: number, fast = 2, slow = 30): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  const fastSc = 2 / (fast + 1);
  const slowSc = 2 / (slow + 1);

  out[period - 1] = smaArray(values, period)[period - 1];
  for (let i = period; i < values.length; i++) {
    const change = Math.abs(values[i] - values[i - period]);
    let volatility = 0;
    for (let k = 0; k < period; k++) volatility += Math.abs(values[i - k] - values[i - k - 1]);
    const er = volatility === 0 ? 0 : change / volatility;
    const sc = (er * (fastSc - slowSc) + slowSc) ** 2;
    out[i] = out[i - 1] + sc * (values[i] - out[i - 1]);
  }
  return out;
}

/**
 * Jurik MA (බහුලව පාවිච්චි වෙන Pine version එක). Script එකේ call එක
 * `JMA(src, length, 0.5)` — තුන්වෙනි එක phase එක.
 */
export function jmaArray(values: number[], period: number, phase = 0.5): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length === 0) return out;

  const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : phase / 100 + 1.5;
  const beta = (0.45 * (period - 1)) / (0.45 * (period - 1) + 2);
  const alpha = beta; // power = 1

  let e0 = values[0];
  let e1 = 0;
  let e2 = 0;
  let jma = values[0];
  out[0] = jma;

  for (let i = 1; i < values.length; i++) {
    e0 = (1 - alpha) * values[i] + alpha * e0;
    e1 = (values[i] - e0) * (1 - beta) + beta * e1;
    e2 = (e0 + phaseRatio * e1 - jma) * (1 - alpha) ** 2 + alpha ** 2 * e2;
    jma += e2;
    out[i] = jma;
  }
  return out;
}

/** Tillson T3 — EMA හයක් cascade කරලා, volume factor එකෙන් බර දානවා. */
export function t3Array(values: number[], period: number, vf = 0.5): number[] {
  const e1 = emaArray(values, period);
  const e2 = onValid(e1, (v) => emaArray(v, period));
  const e3 = onValid(e2, (v) => emaArray(v, period));
  const e4 = onValid(e3, (v) => emaArray(v, period));
  const e5 = onValid(e4, (v) => emaArray(v, period));
  const e6 = onValid(e5, (v) => emaArray(v, period));

  const c1 = -(vf ** 3);
  const c2 = 3 * vf ** 2 + 3 * vf ** 3;
  const c3 = -6 * vf ** 2 - 3 * vf - 3 * vf ** 3;
  const c4 = 1 + 3 * vf + vf ** 3 + 3 * vf ** 2;

  return e6.map((v, i) => c1 * v + c2 * e5[i] + c3 * e4[i] + c4 * e3[i]);
}

/**
 * Pine එකේ `ma_switch()` එකට අදාළ එක — නමින් MA එක තෝරලා ගණන් හදනවා.
 * VWMA එකට volume ඕන නිසා ඒක option එකක් විදිහට දෙනවා.
 */
export function movingAverage(
  type: string,
  values: number[],
  period: number,
  volumes?: number[],
): number[] {
  switch (type) {
    case 'SMA':
      return smaArray(values, period);
    case 'EMA':
      return emaArray(values, period);
    case 'WMA':
      return wmaArray(values, period);
    case 'VWMA':
      return volumes ? vwmaArray(values, volumes, period) : smaArray(values, period);
    case 'DEMA':
      return demaArray(values, period);
    case 'TEMA':
      return temaArray(values, period);
    case 'RMA':
    case 'SMMA':
      return rmaArray(values, period);
    case 'HMA':
      return hmaArray(values, period);
    case 'LSMA':
      return lsmaArray(values, period);
    case 'ALMA':
      return almaArray(values, period, 0, 20);
    case 'ZLSMA':
      return zlsmaArray(values, period);
    case 'FRAMA':
      return framaArray(values, period);
    case 'KAMA':
      return kamaArray(values, period);
    case 'JMA':
      return jmaArray(values, period, 0.5);
    case 'T3':
      return t3Array(values, period, 0.5);
    default:
      return emaArray(values, period);
  }
}
