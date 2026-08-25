import type { UTCTimestamp } from 'lightweight-charts';
import { atrArray, bollinger, emaArray, macd, rsiArray, smaArray, vwapArray } from './indicators';
import type { Candle } from './types';

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
  /** Histogram bars වලට විතරක් — bar එකේ පාට. */
  color?: string;
}

/** Indicator එකකින් chart එකට යන එක line/histogram series එකක්. */
export interface IndicatorSeries {
  key: string;
  label: string;
  type: 'line' | 'histogram';
  color: string;
  data: LinePoint[];
}

/** User ට වෙනස් කරන්න පුළුවන් number setting එකක් (උදා: RSI length). */
export interface ParamDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  /** 'main' = price chart එක උඩම, 'separate' = යටින් වෙනම pane එකක්. */
  pane: 'main' | 'separate';
  params: ParamDef[];
  /** Separate pane එකේ අඳින reference lines (උදා: RSI 30/70). */
  levels?: number[];
  /** Candles + params වලින් අඳින්න ඕන series ටික හදනවා. */
  compute: (candles: Candle[], p: Record<string, number>) => IndicatorSeries[];
}

/** NaN නැති තැන් විතරක් අරගෙන chart එකට දෙන ලක්ෂ්‍ය list එක හදනවා. */
function toPoints(candles: Candle[], values: number[]): LinePoint[] {
  const points: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (!Number.isNaN(values[i])) points.push({ time: candles[i].time, value: values[i] });
  }
  return points;
}

/** Chart එකේ candle close අගයන් ටික විතරක් වෙන් කරගන්නවා. */
function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

export const INDICATORS: IndicatorDef[] = [
  {
    id: 'ema',
    name: 'EMA',
    pane: 'main',
    params: [{ key: 'length', label: 'Length', default: 21, min: 2, max: 400 }],
    compute: (candles, p) => [
      {
        key: 'ema',
        label: `EMA ${p.length}`,
        type: 'line',
        color: '#f0b90b',
        data: toPoints(candles, emaArray(closes(candles), p.length)),
      },
    ],
  },
  {
    id: 'sma',
    name: 'SMA',
    pane: 'main',
    params: [{ key: 'length', label: 'Length', default: 50, min: 2, max: 400 }],
    compute: (candles, p) => [
      {
        key: 'sma',
        label: `SMA ${p.length}`,
        type: 'line',
        color: '#4fc3f7',
        data: toPoints(candles, smaArray(closes(candles), p.length)),
      },
    ],
  },
  {
    id: 'bb',
    name: 'Bollinger Bands',
    pane: 'main',
    params: [
      { key: 'length', label: 'Length', default: 20, min: 2, max: 400 },
      { key: 'mult', label: 'StdDev', default: 2, min: 1, max: 5 },
    ],
    compute: (candles, p) => {
      const b = bollinger(closes(candles), p.length, p.mult);
      return [
        { key: 'upper', label: 'BB upper', type: 'line', color: '#9575cd', data: toPoints(candles, b.upper) },
        { key: 'middle', label: 'BB basis', type: 'line', color: '#7e57c2', data: toPoints(candles, b.middle) },
        { key: 'lower', label: 'BB lower', type: 'line', color: '#9575cd', data: toPoints(candles, b.lower) },
      ];
    },
  },
  {
    id: 'vwap',
    name: 'VWAP (daily)',
    pane: 'main',
    params: [],
    compute: (candles) => [
      {
        key: 'vwap',
        label: 'VWAP',
        type: 'line',
        color: '#ff9800',
        data: toPoints(candles, vwapArray(candles)),
      },
    ],
  },
  {
    id: 'rsi',
    name: 'RSI',
    pane: 'separate',
    levels: [30, 50, 70],
    params: [{ key: 'length', label: 'Length', default: 14, min: 2, max: 100 }],
    compute: (candles, p) => [
      {
        key: 'rsi',
        label: `RSI ${p.length}`,
        type: 'line',
        color: '#e0e3eb',
        data: toPoints(candles, rsiArray(closes(candles), p.length)),
      },
    ],
  },
  {
    id: 'macd',
    name: 'MACD',
    pane: 'separate',
    levels: [0],
    params: [
      { key: 'fast', label: 'Fast', default: 12, min: 2, max: 100 },
      { key: 'slow', label: 'Slow', default: 26, min: 3, max: 200 },
      { key: 'signal', label: 'Signal', default: 9, min: 2, max: 100 },
    ],
    compute: (candles, p) => {
      const m = macd(closes(candles), p.fast, p.slow, p.signal);
      // Histogram bar එකේ පාට — 0ට උඩින් කොළ, යටින් රතු.
      const hist = toPoints(candles, m.histogram).map((pt) => ({
        ...pt,
        color: pt.value >= 0 ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)',
      }));
      return [
        { key: 'hist', label: 'MACD hist', type: 'histogram', color: '#26a69a', data: hist },
        { key: 'macd', label: 'MACD', type: 'line', color: '#4fc3f7', data: toPoints(candles, m.macd) },
        { key: 'signal', label: 'Signal', type: 'line', color: '#ff9800', data: toPoints(candles, m.signal) },
      ];
    },
  },
  {
    id: 'atr',
    name: 'ATR',
    pane: 'separate',
    params: [{ key: 'length', label: 'Length', default: 14, min: 2, max: 100 }],
    compute: (candles, p) => [
      {
        key: 'atr',
        label: `ATR ${p.length}`,
        type: 'line',
        color: '#ef5350',
        data: toPoints(candles, atrArray(candles, p.length)),
      },
    ],
  },
];

/** id එකෙන් indicator definition එක හොයාගන්නවා. */
export function indicatorById(id: string): IndicatorDef | undefined {
  return INDICATORS.find((d) => d.id === id);
}

/** Indicator එකක් අලුතෙන් add කරනකොට යොදන default param අගයන්. */
export function defaultParams(def: IndicatorDef): Record<string, number> {
  const p: Record<string, number> = {};
  for (const param of def.params) p[param.key] = param.default;
  return p;
}
