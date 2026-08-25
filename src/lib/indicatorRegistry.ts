import type { UTCTimestamp } from 'lightweight-charts';
import type { BandPoint } from './bandFill';
import { atrArray, bollinger, emaArray, macd, rsiArray, smaArray, vwapArray } from './indicators';
import { computeMadLoop, type SignalMode } from './madLoop';
import { MA_TYPES } from './movingAverages';
import { alignHigherTimeframe, computeSniper, rsiOfPreviousClose } from './sniper';
import type { Candle, Interval } from './types';

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
  /** Histogram bars වලට සහ පාට මාරු වෙන lines වලට — ඒ තැනේ පාට. */
  color?: string;
}

/** Indicator එකකින් chart එකට යන එක line/histogram series එකක්. */
export interface IndicatorSeries {
  key: string;
  label: string;
  type: 'line' | 'histogram';
  color: string;
  data: LinePoint[];
  /** මේ series එක අඳින්නේ කොහෙද — දුන්නේ නැත්නම් indicator එකේ pane එකේ. */
  pane?: 'main' | 'separate';
  /** Line ඝනකම (glow effect එකකට 10 වගේ ලොකු අගයක්). */
  lineWidth?: number;
  /** Price scale එකේ අන්තිම අගය පෙන්නනවද (glow වලට false). */
  lastValueVisible?: boolean;
}

/** Chart එකේ candle එකක් උඩ/යට දාන label එකක් (Pine `plotshape`). */
export interface IndicatorMarker {
  time: UTCTimestamp;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text?: string;
}

/** Candle එකකට දාන පාට — දුන්නේ නැති කොටස් default පාටෙන්ම යනවා. */
export interface IndicatorBarColor {
  body: string;
  wick?: string;
  /** Outline එක — දුන්නේ නැත්නම් bar එකේ හැබෑ කොළ/රතු පාට එහෙම්මම. */
  border?: string;
}

/** රේඛා දෙකක් අතර පාට කරන කලාපයක් (Pine `fill()`). */
export interface IndicatorBand {
  key: string;
  points: BandPoint[];
}

/** Dashboard table එකේ එක පේළියක් (Pine `table.cell`). */
export interface IndicatorPanelRow {
  label: string;
  value: string;
  labelColor?: string;
  labelBackground?: string;
  valueColor?: string;
  valueBackground?: string;
}

/** Chart එක උඩම පාවෙන පොඩි table එකක් (Pine `table.new`). */
export interface IndicatorPanel {
  position:
    | 'Top Left'
    | 'Top Right'
    | 'Middle Left'
    | 'Middle Right'
    | 'Bottom Left'
    | 'Bottom Right';
  background?: string;
  rows: IndicatorPanelRow[];
}

/** Indicator එකක් chart එකට දෙන දේවල් ඔක්කොම. */
export interface IndicatorOutput {
  series: IndicatorSeries[];
  /** Candles වලට දාන පාට (index = candle index). */
  barColors?: (IndicatorBarColor | undefined)[];
  markers?: IndicatorMarker[];
  bands?: IndicatorBand[];
  panel?: IndicatorPanel;
}

/** compute() එකට යන අමතර data — දැනට උසස් timeframe candles විතරයි. */
export interface IndicatorContext {
  /** Interval code එකෙන් — උදා: `mtf['5m']`. */
  mtf: Record<string, Candle[]>;
}

export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

/** User ට වෙනස් කරන්න පුළුවන් setting එකක් — number එකක් හෝ dropdown එකක්. */
export interface ParamDef {
  key: string;
  label: string;
  /** දුන්නේ නැත්නම් 'number'. */
  kind?: 'number' | 'select';
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** kind === 'select' වලට විතරක්. */
  options?: readonly string[];
}

export interface IndicatorDef {
  id: string;
  name: string;
  /** 'main' = price chart එක උඩම, 'separate' = යටින් වෙනම pane එකක්. */
  pane: 'main' | 'separate';
  params: ParamDef[];
  /** Separate pane එකේ අඳින reference lines (උදා: RSI 30/70). */
  levels?: number[];
  /** මේ indicator එකට උසස් timeframe candles ඕන නම් ඒකේ code එක. */
  mtf?: Interval;
  /** Candles + params වලින් අඳින්න ඕන දේවල් හදනවා. */
  compute: (candles: Candle[], p: Params, ctx: IndicatorContext) => IndicatorOutput;
}

/** Param එකක් number එකක් විදිහට කියවනවා. */
export function num(p: Params, key: string, fallback = 0): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Param එකක් string එකක් විදිහට කියවනවා. */
export function str(p: Params, key: string, fallback = ''): string {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
}

/** NaN නැති තැන් විතරක් අරගෙන chart එකට දෙන ලක්ෂ්‍ය list එක හදනවා. */
function toPoints(candles: Candle[], values: number[]): LinePoint[] {
  const points: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (!Number.isNaN(values[i])) points.push({ time: candles[i].time, value: values[i] });
  }
  return points;
}

/** උඩ එකේම, ඒත් හැම ලක්ෂ්‍යයකටම වෙන වෙනම පාටක් එක්ක (line එකේ පාට මාරු වෙන්න). */
function toColoredPoints(candles: Candle[], values: number[], colors: string[]): LinePoint[] {
  const points: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (!Number.isNaN(values[i])) {
      points.push({ time: candles[i].time, value: values[i], color: colors[i] });
    }
  }
  return points;
}

/** Chart එකේ candle close අගයන් ටික විතරක් වෙන් කරගන්නවා. */
function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

/**
 * `#00ff00` වගේ hex එකකට Pine `color.new(c, transparency)` වගේ විනිවිද
 * බවක් දානවා (transparency 0 = ගාඩ, 100 = නොපෙනෙන).
 */
function withAlpha(hex: string, transparency: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${(1 - transparency / 100).toFixed(3)})`;
}

/** Lyro RS script එකේ තියෙන color palettes ටික. */
const PALETTES: Record<string, { up: string; down: string }> = {
  'Green / Red': { up: '#00ff00', down: '#ff0000' },
  Classic: { up: '#00E676', down: '#880E4F' },
  Mystic: { up: '#30FDCF', down: '#E117B7' },
  Accented: { up: '#9618F7', down: '#FF0078' },
  Royal: { up: '#FFC107', down: '#673AB7' },
};

const NEUTRAL = '#787b86';

/** Pine එකේ built-in colors (color.green, color.red ...) — TradingView අගයන්ම. */
const TV = {
  green: '#4CAF50',
  red: '#FF5252',
  blue: '#2196F3',
  orange: '#FF9800',
  black: '#000000',
  gray: '#787B86',
};

export const INDICATORS: IndicatorDef[] = [
  {
    id: 'ema',
    name: 'EMA',
    pane: 'main',
    params: [{ key: 'length', label: 'Length', default: 21, min: 2, max: 400 }],
    compute: (candles, p) => ({
      series: [
        {
          key: 'ema',
          label: `EMA ${num(p, 'length')}`,
          type: 'line',
          color: '#f0b90b',
          data: toPoints(candles, emaArray(closes(candles), num(p, 'length'))),
        },
      ],
    }),
  },
  {
    id: 'sma',
    name: 'SMA',
    pane: 'main',
    params: [{ key: 'length', label: 'Length', default: 50, min: 2, max: 400 }],
    compute: (candles, p) => ({
      series: [
        {
          key: 'sma',
          label: `SMA ${num(p, 'length')}`,
          type: 'line',
          color: '#4fc3f7',
          data: toPoints(candles, smaArray(closes(candles), num(p, 'length'))),
        },
      ],
    }),
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
      const b = bollinger(closes(candles), num(p, 'length'), num(p, 'mult'));
      return {
        series: [
          { key: 'upper', label: 'BB upper', type: 'line', color: '#9575cd', data: toPoints(candles, b.upper) },
          { key: 'middle', label: 'BB basis', type: 'line', color: '#7e57c2', data: toPoints(candles, b.middle) },
          { key: 'lower', label: 'BB lower', type: 'line', color: '#9575cd', data: toPoints(candles, b.lower) },
        ],
      };
    },
  },
  {
    id: 'vwap',
    name: 'VWAP (daily)',
    pane: 'main',
    params: [],
    compute: (candles) => ({
      series: [
        {
          key: 'vwap',
          label: 'VWAP',
          type: 'line',
          color: '#ff9800',
          data: toPoints(candles, vwapArray(candles)),
        },
      ],
    }),
  },
  {
    id: 'rsi',
    name: 'RSI',
    pane: 'separate',
    levels: [30, 50, 70],
    params: [{ key: 'length', label: 'Length', default: 14, min: 2, max: 100 }],
    compute: (candles, p) => ({
      series: [
        {
          key: 'rsi',
          label: `RSI ${num(p, 'length')}`,
          type: 'line',
          color: '#e0e3eb',
          data: toPoints(candles, rsiArray(closes(candles), num(p, 'length'))),
        },
      ],
    }),
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
      const m = macd(closes(candles), num(p, 'fast'), num(p, 'slow'), num(p, 'signal'));
      // Histogram bar එකේ පාට — 0ට උඩින් කොළ, යටින් රතු.
      const hist = toPoints(candles, m.histogram).map((pt) => ({
        ...pt,
        color: pt.value >= 0 ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)',
      }));
      return {
        series: [
          { key: 'hist', label: 'MACD hist', type: 'histogram', color: '#26a69a', data: hist },
          { key: 'macd', label: 'MACD', type: 'line', color: '#4fc3f7', data: toPoints(candles, m.macd) },
          { key: 'signal', label: 'Signal', type: 'line', color: '#ff9800', data: toPoints(candles, m.signal) },
        ],
      };
    },
  },
  {
    id: 'atr',
    name: 'ATR',
    pane: 'separate',
    params: [{ key: 'length', label: 'Length', default: 14, min: 2, max: 100 }],
    compute: (candles, p) => ({
      series: [
        {
          key: 'atr',
          label: `ATR ${num(p, 'length')}`,
          type: 'line',
          color: '#ef5350',
          data: toPoints(candles, atrArray(candles, num(p, 'length'))),
        },
      ],
    }),
  },
  {
    // Mean Deviation Loop | Lyro RS (© LyroRS, MPL-2.0) එකේ port එක.
    id: 'madloop',
    name: 'MAD Loop | Lyro RS',
    pane: 'separate',
    params: [
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        default: 'close',
        options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'],
      },
      {
        key: 'mode',
        label: 'Signal',
        kind: 'select',
        default: 'Bollinger Bands',
        options: ['Bollinger Bands', 'For Loop', 'Combined Signal'],
      },
      { key: 'maBB', label: 'BB MA', kind: 'select', default: 'EMA', options: MA_TYPES },
      { key: 'lengthBB', label: 'BB Len', default: 25, min: 2, max: 400 },
      { key: 'multPlus', label: '+ Mult', default: 1.4, min: 0, max: 10, step: 0.1 },
      { key: 'multMinus', label: '− Mult', default: 1, min: 0, max: 10, step: 0.1 },
      { key: 'maFL', label: 'Loop MA', kind: 'select', default: 'ALMA', options: MA_TYPES },
      { key: 'lengthFL', label: 'Loop Len', default: 10, min: 2, max: 400 },
      { key: 'from', label: 'From', default: 10, min: 1, max: 500 },
      { key: 'to', label: 'To', default: 60, min: 2, max: 500 },
      { key: 'thLong', label: 'Th Long', default: 23, min: -500, max: 500 },
      { key: 'thShort', label: 'Th Short', default: 3, min: -500, max: 500 },
      { key: 'thLongC', label: 'Th Long (C)', default: 0, min: 0, max: 1, step: 0.01 },
      { key: 'thShortC', label: 'Th Short (C)', default: 0, min: -1, max: 0, step: 0.01 },
      {
        key: 'palette',
        label: 'Colors',
        kind: 'select',
        default: 'Green / Red',
        options: Object.keys(PALETTES),
      },
    ],
    compute: (candles, p) => {
      const from = num(p, 'from', 10);
      const to = Math.max(from, num(p, 'to', 60));
      const r = computeMadLoop(candles, {
        source: str(p, 'source', 'close'),
        maBB: str(p, 'maBB', 'EMA'),
        lengthBB: num(p, 'lengthBB', 25),
        multPlus: num(p, 'multPlus', 1.4),
        multMinus: num(p, 'multMinus', 1),
        maFL: str(p, 'maFL', 'ALMA'),
        lengthFL: num(p, 'lengthFL', 10),
        from,
        to,
        thresholdLongFL: num(p, 'thLong', 23),
        thresholdShortFL: num(p, 'thShort', 3),
        thresholdLongC: num(p, 'thLongC', 0),
        thresholdShortC: num(p, 'thShortC', 0),
        mode: str(p, 'mode', 'Bollinger Bands') as SignalMode,
      });

      const { up, down } = PALETTES[str(p, 'palette', 'Green / Red')] ?? PALETTES['Green / Red'];
      const paint = (score: number[], transparency = 0) =>
        score.map((s) =>
          s === 1
            ? withAlpha(up, transparency)
            : s === -1
              ? withAlpha(down, transparency)
              : withAlpha(NEUTRAL, transparency),
        );

      const bbColors = paint(r.bbScore);
      const bbGlow = paint(r.bbScore, 85);
      const flColors = paint(r.flScore);
      const flGlow = paint(r.flScore, 75);

      // Threshold lines — Pine එකේ වගේ pane එක හරහා යන කෙළින් lines.
      const thLong = candles.map(() => num(p, 'thLong', 23));
      const thShort = candles.map(() => num(p, 'thShort', 3));

      // Score එක 0 පනිනකොට Long/Short label එක දානවා (Pine `plotshape`).
      const markers: IndicatorMarker[] = [];
      for (let i = 1; i < candles.length; i++) {
        if (r.score[i] > 0 && r.score[i - 1] <= 0) {
          markers.push({
            time: candles[i].time,
            position: 'belowBar',
            shape: 'arrowUp',
            color: up,
            text: 'Long',
          });
        } else if (r.score[i] < 0 && r.score[i - 1] >= 0) {
          markers.push({
            time: candles[i].time,
            position: 'aboveBar',
            shape: 'arrowDown',
            color: down,
            text: 'Short',
          });
        }
      }

      return {
        series: [
          // ── main pane: glow, bands, MA (glow යටින් තියෙන්න ඕන නිසා මුලින්) ──
          {
            key: 'ma-glow',
            label: '',
            type: 'line',
            color: withAlpha(up, 85),
            data: toColoredPoints(candles, r.avgBB, bbGlow),
            pane: 'main',
            lineWidth: 10,
            lastValueVisible: false,
          },
          {
            key: 'upper',
            label: 'MAD +',
            type: 'line',
            color: withAlpha(up, 50),
            data: toPoints(candles, r.upper),
            pane: 'main',
            lineWidth: 1,
          },
          {
            key: 'lower',
            label: 'MAD −',
            type: 'line',
            color: withAlpha(down, 50),
            data: toPoints(candles, r.lower),
            pane: 'main',
            lineWidth: 1,
          },
          {
            key: 'ma',
            label: 'MAD MA',
            type: 'line',
            color: up,
            data: toColoredPoints(candles, r.avgBB, bbColors),
            pane: 'main',
            lineWidth: 2,
          },
          // ── යට pane එක: for-loop score එකයි thresholds දෙකයි ──
          {
            key: 'fl-glow',
            label: '',
            type: 'line',
            color: withAlpha(up, 75),
            data: toColoredPoints(candles, r.madFl, flGlow),
            lineWidth: 10,
            lastValueVisible: false,
          },
          {
            key: 'th-long',
            label: 'Long',
            type: 'line',
            color: up,
            data: toPoints(candles, thLong),
            lineWidth: 1,
            lastValueVisible: false,
          },
          {
            key: 'th-short',
            label: 'Short',
            type: 'line',
            color: down,
            data: toPoints(candles, thShort),
            lineWidth: 1,
            lastValueVisible: false,
          },
          {
            key: 'fl',
            label: 'MAD Loop',
            type: 'line',
            color: up,
            data: toColoredPoints(candles, r.madFl, flColors),
            lineWidth: 2,
          },
        ],
        // Pine `barcolor()` / `plotcandle()` — candles ටිකත් score එකේ පාටට
        // (body, wick, outline තුනම).
        barColors: r.score.map((s) => {
          const c = s === 1 ? up : s === -1 ? down : NEUTRAL;
          return { body: c, wick: c, border: c };
        }),
        markers,
      };
    },
  },
  {
    // Sniper Entry/Exit with SL&TP by KhanSaab V.02 (community version) එකේ port එක.
    id: 'sniper',
    name: 'Sniper V.02 | KhanSaab',
    pane: 'main',
    mtf: '5m',
    params: [
      { key: 'fast', label: 'Fast EMA', default: 9, min: 2, max: 200 },
      { key: 'mid', label: 'Mid EMA', default: 21, min: 2, max: 200 },
      { key: 'slow', label: 'Slow EMA', default: 50, min: 2, max: 400 },
      { key: 'ribbon', label: 'Ribbon %', default: 50, min: 0, max: 100 },
      {
        key: 'dashboard',
        label: 'Dashboard',
        kind: 'select',
        default: 'Top Right',
        options: ['Top Right', 'Top Left', 'Middle Right', 'Middle Left', 'Bottom Right', 'Bottom Left', 'Off'],
      },
    ],
    compute: (candles, p, ctx) => {
      // පැය/විනාඩි 5 RSI එක — Chart එක ගෙනල්ලා දෙන 5m candles වලින්.
      const htf = ctx.mtf['5m'] ?? [];
      const rsiHigherTf = alignHigherTimeframe(candles, htf, rsiOfPreviousClose(htf, 14));

      const r = computeSniper(candles, {
        fast: num(p, 'fast', 9),
        mid: num(p, 'mid', 21),
        slow: num(p, 'slow', 50),
        rsiHigherTf,
      });

      const ribbonAlpha = num(p, 'ribbon', 50);
      const last = candles.length - 1;
      const dashPos = str(p, 'dashboard', 'Top Right');

      // VWAP එකේ පාට price එක උඩද යටද කියලා මාරු වෙනවා.
      const vwapColors = candles.map((c, i) => (c.close > r.vwap[i] ? TV.green : TV.red));

      // EMA ribbon එක — fast/mid අතර කලාපය.
      const bandPoints: BandPoint[] = [];
      for (let i = 0; i < candles.length; i++) {
        if (Number.isNaN(r.emaFast[i]) || Number.isNaN(r.emaMid[i])) continue;
        bandPoints.push({
          time: candles[i].time,
          upper: r.emaFast[i],
          lower: r.emaMid[i],
          color: withAlpha(r.emaFast[i] > r.emaMid[i] ? TV.green : TV.red, 100 - ribbonAlpha),
        });
      }

      const markers: IndicatorMarker[] = [];
      for (let i = 0; i < candles.length; i++) {
        if (r.triggerBuy[i]) {
          markers.push({
            time: candles[i].time,
            position: 'belowBar',
            shape: 'arrowUp',
            color: TV.green,
            text: 'BUY',
          });
        } else if (r.triggerSell[i]) {
          markers.push({
            time: candles[i].time,
            position: 'aboveBar',
            shape: 'arrowDown',
            color: TV.red,
            text: 'SELL',
          });
        }
      }

      // Signal bar = කළු, retest bar = තැඹිලි. Outline එක bar එකේ හැබෑ
      // පාටෙන්ම තියෙනවා (script එකේ විස්තරයේ තියෙන විදිහටම).
      const barColors = candles.map((_, i) =>
        r.triggerBuy[i] || r.triggerSell[i]
          ? { body: TV.black, wick: TV.black }
          : r.retest[i]
            ? { body: TV.orange, wick: TV.orange }
            : undefined,
      );

      const bias = r.bias[last] ?? 'MILD BEAR';
      const biasColor =
        bias === 'STRONG BULL' ? TV.green : bias === 'STRONG BEAR' ? TV.red : TV.gray;

      const panel: IndicatorPanel | undefined =
        dashPos === 'Off' || last < 0
          ? undefined
          : {
              position: dashPos as IndicatorPanel['position'],
              background: 'rgba(255, 249, 196, 0.9)',
              rows: [
                {
                  label: 'BULL SCORE',
                  value: `${Math.round(r.bullPct[last])}%`,
                  labelColor: '#fff',
                  labelBackground: TV.green,
                  valueColor: '#fff',
                  valueBackground: TV.green,
                },
                {
                  label: 'BEAR SCORE',
                  value: `${Math.round(r.bearPct[last])}%`,
                  labelColor: '#fff',
                  labelBackground: TV.red,
                  valueColor: '#fff',
                  valueBackground: TV.red,
                },
                {
                  label: 'MARKET BIAS',
                  value: bias,
                  labelColor: '#fff',
                  labelBackground: '#000',
                  valueColor: '#fff',
                  valueBackground: biasColor,
                },
                { label: 'System', value: 'KhanSaab Algo Trading', labelColor: '#000', valueColor: '#000' },
                { label: 'Copyright', value: '© KhanSaab V.02', labelColor: '#000', valueColor: TV.blue },
              ],
            };

      return {
        series: [
          {
            key: 'ema-fast',
            label: `EMA ${num(p, 'fast', 9)}`,
            type: 'line',
            color: withAlpha(TV.green, 20),
            data: toPoints(candles, r.emaFast),
            lineWidth: 1,
          },
          {
            key: 'ema-mid',
            label: `EMA ${num(p, 'mid', 21)}`,
            type: 'line',
            color: withAlpha(TV.red, 20),
            data: toPoints(candles, r.emaMid),
            lineWidth: 1,
          },
          {
            key: 'ema-slow',
            label: `EMA ${num(p, 'slow', 50)}`,
            type: 'line',
            color: TV.blue,
            data: toPoints(candles, r.emaSlow),
            lineWidth: 2,
          },
          {
            key: 'vwap',
            label: 'VWAP',
            type: 'line',
            color: TV.green,
            data: toColoredPoints(candles, r.vwap, vwapColors),
            lineWidth: 2,
          },
        ],
        bands: [{ key: 'ribbon', points: bandPoints }],
        barColors,
        markers,
        panel,
      };
    },
  },
];

/** id එකෙන් indicator definition එක හොයාගන්නවා. */
export function indicatorById(id: string): IndicatorDef | undefined {
  return INDICATORS.find((d) => d.id === id);
}

/** Indicator එකක් අලුතෙන් add කරනකොට යොදන default param අගයන්. */
export function defaultParams(def: IndicatorDef): Params {
  const p: Params = {};
  for (const param of def.params) p[param.key] = param.default;
  return p;
}
