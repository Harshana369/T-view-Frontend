import type { UTCTimestamp } from 'lightweight-charts';
import type { BandPoint } from './bandFill';
import { computeBreakoutTargets } from './breakoutTargets';
import { computeElliottWave } from './elliottWave';
import { formatPrice } from './format';
import { atrArray, bollinger, emaArray, macd, rsiArray, smaArray, vwapArray } from './indicators';
import { computeMadLoop, type SignalMode } from './madLoop';
import { computeMirage, MIRAGE_PRESETS } from './mirageSweep';
import { MA_TYPES } from './movingAverages';
import type { ChartBox, ChartSegment } from './shapes';
import { alignHigherTimeframe, computeSniper, rsiOfPreviousClose } from './sniper';
import { computeTrendlines, zonePriceAt, type TrendZone } from './trendlines';
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
  /** 'atPrice*' තෝරගත්තොත් `price` එකත් දෙන්න ඕන (Pine `location.absolute`). */
  position: 'aboveBar' | 'belowBar' | 'atPriceTop' | 'atPriceBottom' | 'atPriceMiddle';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text?: string;
  price?: number;
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
  /** Chart එක උඩ අඳින සෘජුකෝණාස්‍ර (Pine `box.new`). */
  boxes?: ChartBox[];
  /** තිරස් රේඛා + labels (Pine `line.new` / `label.new`). */
  segments?: ChartSegment[];
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
  /** දුන්නේ නැත්නම් 'number'. 'switch' = On/Off toggle එකක්. */
  kind?: 'number' | 'select' | 'switch';
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
  /** මේ indicator එකට උසස් timeframe candles ඕන නම් ඒවායේ codes. */
  mtf?: Interval | Interval[];
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
/** AlgoAlpha script එකේ default පාට. */
const ALGO = { green: '#00ffbb', red: '#ff1100' };

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
  {
    // Breakout Targets [AlgoAlpha] (© AlgoAlpha, MPL-2.0) එකේ port එක.
    id: 'breakout',
    name: 'Breakout Targets | AlgoAlpha',
    pane: 'main',
    params: [
      { key: 'length', label: 'Range Period', default: 99, min: 4, max: 400 },
      {
        key: 'overlap',
        label: 'Prevent Overlap',
        kind: 'select',
        default: 'On',
        options: ['On', 'Off'],
      },
      { key: 'targets', label: 'Targets', kind: 'select', default: 'On', options: ['On', 'Off'] },
      { key: 'atrPeriod', label: 'ATR', default: 14, min: 1, max: 200 },
      { key: 'slMult', label: 'SL ×ATR', default: 5, min: 0.1, max: 50, step: 0.1 },
      { key: 'tp1', label: 'TP1 ×', default: 0.5, min: 0.1, max: 20, step: 0.1 },
      { key: 'tp2', label: 'TP2 ×', default: 1, min: 0.1, max: 20, step: 0.1 },
      { key: 'tp3', label: 'TP3 ×', default: 1.5, min: 0.1, max: 20, step: 0.1 },
      {
        // On කළාම, coins 526ම server එකේ පසුබිමින් scan වෙනවා — අලුත්
        // breakout Entry එකක් හම්බවුණු ගමන් bell icon එකට notification
        // එකක් එනවා (hooks/useBreakoutScanner.ts).
        key: 'scanAll',
        label: 'Scan All Coins',
        kind: 'switch',
        default: 'Off',
      },
      {
        key: 'scanTf',
        label: 'Scan TF',
        kind: 'select',
        default: '1h',
        options: ['15m', '30m', '1h', '4h', '1d'],
      },
    ],
    compute: (candles, p) => {
      const r = computeBreakoutTargets(candles, {
        length: num(p, 'length', 99),
        preventOverlap: str(p, 'overlap', 'On') === 'On',
        showTargets: str(p, 'targets', 'On') === 'On',
        atrPeriod: num(p, 'atrPeriod', 14),
        slMultiplier: num(p, 'slMult', 5),
        tp1Multiplier: num(p, 'tp1', 0.5),
        tp2Multiplier: num(p, 'tp2', 1),
        tp3Multiplier: num(p, 'tp3', 1.5),
      });

      const up = ALGO.green;
      const down = ALGO.red;
      const fg = '#d1d4dc'; // Pine `chart.fg_color`
      const at = (index: number) => candles[index].time;

      const boxes: ChartBox[] = [];
      const segments: ChartSegment[] = [];

      for (const b of r.boxes) {
        const time1 = at(b.startIndex);
        const time2 = at(b.endIndex);
        // මුළු range එක
        boxes.push({ time1, time2, top: b.top, bottom: b.bottom, fill: withAlpha(fg, 90) });
        // උඩ supply තීරුවයි යට demand තීරුවයි
        boxes.push({ time1, time2, top: b.top, bottom: b.top - b.vola, fill: withAlpha(down, 70) });
        boxes.push({
          time1,
          time2,
          top: b.bottom + b.vola,
          bottom: b.bottom,
          fill: withAlpha(up, 70),
        });
        // මැද තිත් රේඛාව
        segments.push({
          time1,
          time2,
          price: (b.top + b.bottom) / 2,
          color: withAlpha(fg, 50),
          width: 1,
          dashed: true,
        });
      }

      // Entry / SL / TP රේඛා + labels (අන්තිම breakout එකට විතරක්).
      const t = r.trade;
      if (t) {
        const time1 = at(t.startIndex);
        const time2 = at(t.endIndex);
        const entryColor = t.dir === 1 ? up : down;
        const line = (
          price: number,
          color: string,
          text: string,
          labelBg: string,
        ): ChartSegment => ({
          time1,
          time2,
          price,
          color,
          width: 3,
          label: { text: `${text} ▸ ${formatPrice(price)}`, background: labelBg, color: '#fff' },
        });

        // SL පැත්තට රතු සෙවණැල්ලක්, TP3 පැත්තට කොළ එකක් (Pine `linefill`).
        boxes.push({
          time1,
          time2,
          top: Math.max(t.entry, t.sl),
          bottom: Math.min(t.entry, t.sl),
          fill: withAlpha(down, 95),
        });
        boxes.push({
          time1,
          time2,
          top: Math.max(t.entry, t.tp3),
          bottom: Math.min(t.entry, t.tp3),
          fill: withAlpha(up, 95),
        });

        segments.push(line(t.entry, entryColor, 'Entry', entryColor));
        segments.push(line(t.sl, withAlpha(down, 80), '✘ SL', withAlpha(down, 80)));
        segments.push(line(t.tp1, withAlpha(up, 80), '✔ TP1', withAlpha(up, 80)));
        segments.push(line(t.tp2, withAlpha(up, 80), '✔ TP2', withAlpha(up, 80)));
        segments.push(line(t.tp3, withAlpha(up, 80), '✔ TP3', withAlpha(up, 80)));
      }

      // Breakout markers — box එකේ පතුලේ/උඩම (Pine `location.absolute`).
      const markers: IndicatorMarker[] = r.signals.map((sig) => ({
        time: at(sig.index),
        position: sig.dir === 1 ? 'atPriceBottom' : 'atPriceTop',
        shape: sig.dir === 1 ? 'arrowUp' : 'arrowDown',
        color: sig.dir === 1 ? up : down,
        price: sig.price,
      }));

      return { series: [], boxes, segments, markers };
    },
  },
  {
    // "Mirage Liquidity Sweep Pro [WillyAlgoTrader]" v1.3.1
    // (© Willy | WillyAlgoTrader) එකේ port එක.
    id: 'mirage',
    name: 'Mirage Liquidity Sweep Pro',
    pane: 'main',
    mtf: '4h',
    params: [
      { key: 'swingLength', label: 'Swing Length', default: 21, min: 3, max: 100 },
      { key: 'maxDist', label: 'Max Sweep Distance', default: 80, min: 5, max: 500 },
      { key: 'minScore', label: 'Min Sweep Score', default: 50, min: 0, max: 100 },
      {
        key: 'preset',
        label: 'Risk Preset',
        kind: 'select',
        default: 'Balanced',
        options: ['Conservative', 'Balanced', 'Aggressive', 'Scalping', 'Custom'],
      },
      // Preset එක 'Custom' නම් විතරයි පහළ හතර වැඩ කරන්නේ.
      { key: 'slBuffer', label: 'SL Buffer ×ATR', default: 0.25, min: 0.01, max: 3, step: 0.01 },
      { key: 'tp1', label: 'TP1 ×R', default: 1, min: 0.1, max: 20, step: 0.1 },
      { key: 'tp2', label: 'TP2 ×R', default: 2, min: 0.1, max: 20, step: 0.1 },
      { key: 'tp3', label: 'TP3 ×R', default: 3, min: 0.1, max: 20, step: 0.1 },
      { key: 'breakEven', label: 'Break-Even after TP1', kind: 'switch', default: 'On' },
      // Sweep එකට පස්සේ structure break එකක් එනකම් බලාගෙන ඉන්නවා —
      // signals අඩුයි, ඒත් පිරිසිදුයි. Off කළොත් sweep bar එකේම fire වෙනවා.
      { key: 'choch', label: 'Require CHoCH', kind: 'switch', default: 'On' },
      { key: 'minorLength', label: 'CHoCH Pivot Length', default: 8, min: 2, max: 50 },
      { key: 'confirmWindow', label: 'Confirm Window', default: 13, min: 1, max: 100 },
      { key: 'volume', label: 'Volume Filter', kind: 'switch', default: 'On' },
      { key: 'volLength', label: 'Volume MA', default: 20, min: 2, max: 200 },
      { key: 'volMult', label: 'Volume Spike ×', default: 1.5, min: 1, max: 10, step: 0.1 },
      { key: 'htf', label: 'HTF Bias (4h)', kind: 'switch', default: 'On' },
      { key: 'htfEma', label: 'HTF EMA', default: 50, min: 2, max: 400 },
      { key: 'atrLength', label: 'ATR', default: 14, min: 1, max: 200 },
      { key: 'liquidity', label: 'Liquidity Map', kind: 'switch', default: 'On' },
      { key: 'dashboard', label: 'Dashboard', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p, ctx) => {
      const presetName = str(p, 'preset', 'Balanced');
      const preset = MIRAGE_PRESETS[presetName];
      const r = computeMirage(
        candles,
        {
          swingLength: num(p, 'swingLength', 21),
          maxSweepDistance: num(p, 'maxDist', 80),
          minScore: num(p, 'minScore', 50),
          requireChoch: str(p, 'choch', 'On') === 'On',
          structurePivotLength: num(p, 'minorLength', 8),
          confirmWindow: num(p, 'confirmWindow', 13),
          useVolume: str(p, 'volume', 'On') === 'On',
          volumeLength: num(p, 'volLength', 20),
          volumeMult: num(p, 'volMult', 1.5),
          useHtfBias: str(p, 'htf', 'On') === 'On',
          htfEmaLength: num(p, 'htfEma', 50),
          atrLength: num(p, 'atrLength', 14),
          // Preset එකක් තෝරලා නම් ඒකේ අගයන්, 'Custom' නම් user ගේ අගයන්.
          slBuffer: preset ? preset.slBuffer : num(p, 'slBuffer', 0.25),
          tp1Mult: preset ? preset.tp1 : num(p, 'tp1', 1),
          tp2Mult: preset ? preset.tp2 : num(p, 'tp2', 2),
          tp3Mult: preset ? preset.tp3 : num(p, 'tp3', 3),
          breakEvenAfterTp1: str(p, 'breakEven', 'On') === 'On',
          equalTolerance: 0.15,
        },
        ctx.mtf['4h'] ?? [],
      );

      const up = '#26a69a';
      const down = '#ef5350';
      const gold = '#ffb300';
      const at = (index: number) => candles[index].time;
      const last = candles.length - 1;

      const boxes: ChartBox[] = [];
      const segments: ChartSegment[] = [];
      const markers: IndicatorMarker[] = [];

      // ── Resting liquidity — තාම sweep වෙලා නැති pools ──────────────
      if (str(p, 'liquidity', 'On') === 'On' && candles.length > 0) {
        // පැත්තකට 6ක් විතරයි — chart එක පිරෙන්නේ නැතුව ළඟම ඒවා.
        const recent = (side: 'bsl' | 'ssl') => r.liquidity.filter((l) => l.side === side).slice(-6);
        for (const l of [...recent('bsl'), ...recent('ssl')]) {
          const color = l.side === 'bsl' ? withAlpha(down, 55) : withAlpha(up, 55);
          segments.push({
            time1: at(l.barIndex),
            time2: at(last),
            price: l.level,
            color,
            width: 1,
            dashed: true,
            label: { text: l.side === 'bsl' ? 'BSL' : 'SSL', background: color, color: '#fff' },
          });
        }

        // EQH / EQL — සමාන swings දෙකක් අතර ඝන රේඛාවක් (liquidity magnets).
        for (const e of r.equals.slice(-8)) {
          segments.push({
            time1: at(e.fromIndex),
            time2: at(e.toIndex),
            price: e.level,
            color: gold,
            width: 2,
            label: { text: e.side.toUpperCase(), background: withAlpha(gold, 20), color: '#000' },
          });
        }
      }

      // ── Sweep marks — level එකෙන් එහාට ගිය wick එකේ කෙළවර ────────────
      for (const s of r.sweeps) {
        markers.push({
          time: at(s.index),
          position: s.dir === 1 ? 'atPriceBottom' : 'atPriceTop',
          shape: 'circle',
          color: s.dir === 1 ? up : down,
          price: s.wick,
          text: `✕ ${Math.round(s.score)}`,
        });
        // Sweep වුණු level එක — swing එකේ ඉඳන් sweep bar එක දක්වා.
        segments.push({
          time1: at(s.levelIndex),
          time2: at(s.index),
          price: s.level,
          color: withAlpha(s.dir === 1 ? up : down, 40),
          width: 1,
        });
      }

      // ── Entry markers ──────────────────────────────────────────────
      for (const t of r.trades) {
        markers.push({
          time: at(t.index),
          position: t.dir === 1 ? 'belowBar' : 'aboveBar',
          shape: t.dir === 1 ? 'arrowUp' : 'arrowDown',
          color: t.dir === 1 ? up : down,
          text: t.dir === 1 ? 'Long' : 'Short',
        });
      }

      // ── අන්තිම trade එකේ SL / Entry / TP රේඛා ──────────────────────
      const t = r.trades[r.trades.length - 1];
      if (t) {
        const time1 = at(t.index);
        const time2 = at(t.endIndex);
        const dirColor = t.dir === 1 ? up : down;
        // Break-even වුණාට පස්සේ SL එකේ පාට මැකෙනවා — තව අවදානමක් නෑ.
        const slColor = t.breakEven ? withAlpha(NEUTRAL, 40) : down;
        const line = (price: number, color: string, text: string): ChartSegment => ({
          time1,
          time2,
          price,
          color,
          width: 2,
          label: { text: `${text} ▸ ${formatPrice(price)}`, background: color, color: '#fff' },
        });

        boxes.push({
          time1,
          time2,
          top: Math.max(t.entry, t.sl),
          bottom: Math.min(t.entry, t.sl),
          fill: withAlpha(down, 93),
        });
        boxes.push({
          time1,
          time2,
          top: Math.max(t.entry, t.tp3),
          bottom: Math.min(t.entry, t.tp3),
          fill: withAlpha(up, 93),
        });

        segments.push(line(t.entry, dirColor, t.breakEven ? 'Entry → SL (BE)' : 'Entry'));
        segments.push(line(t.sl, slColor, '✘ SL'));
        segments.push(line(t.tp1, withAlpha(up, t.tp1Hit ? 0 : 55), '✔ TP1'));
        segments.push(line(t.tp2, withAlpha(up, t.tp2Hit ? 0 : 55), '✔ TP2'));
        segments.push(line(t.tp3, withAlpha(up, t.tp3Hit ? 0 : 55), '✔ TP3'));

        // Liquidity target — trade එකේ දිශාවට තියෙන ළඟම un-swept pool එක.
        const wantSide = t.dir === 1 ? 'bsl' : 'ssl';
        const pools = r.liquidity.filter(
          (l) => l.side === wantSide && (t.dir === 1 ? l.level > t.entry : l.level < t.entry),
        );
        if (pools.length > 0) {
          const target = pools.reduce((a, b) =>
            Math.abs(b.level - t.entry) < Math.abs(a.level - t.entry) ? b : a,
          );
          segments.push({
            time1,
            time2: at(last),
            price: target.level,
            color: gold,
            width: 2,
            dashed: true,
            label: {
              text: `⌖ Liquidity ▸ ${formatPrice(target.level)}`,
              background: withAlpha(gold, 20),
              color: '#000',
            },
          });
        }
      }

      // ── Dashboard ──────────────────────────────────────────────────
      let panel: IndicatorPanel | undefined;
      if (str(p, 'dashboard', 'On') === 'On') {
        const total = r.wins + r.losses;
        const winRate = total > 0 ? (r.wins / total) * 100 : 0;
        const open = r.active;
        const rows: IndicatorPanelRow[] = [
          {
            label: 'HTF Bias',
            value: r.htfBullish === null ? '—' : r.htfBullish ? 'Bullish' : 'Bearish',
            valueColor: r.htfBullish === null ? NEUTRAL : r.htfBullish ? up : down,
          },
          {
            label: 'Signal',
            value: open ? (open.dir === 1 ? 'LONG open' : 'SHORT open') : 'Flat',
            valueColor: open ? (open.dir === 1 ? up : down) : NEUTRAL,
          },
        ];

        const lastSweep = r.sweeps[r.sweeps.length - 1];
        if (lastSweep) {
          rows.push({
            label: 'Last sweep',
            value: `${lastSweep.dir === 1 ? 'SSL' : 'BSL'} · ${Math.round(lastSweep.score)}/100 · ${
              last - lastSweep.index
            } bars ago`,
            valueColor: lastSweep.dir === 1 ? up : down,
          });
        }

        if (open) {
          const risk = Math.abs(open.entry - open.sl);
          rows.push(
            {
              label: 'SL',
              value: formatPrice(open.sl),
              valueColor: open.breakEven ? NEUTRAL : down,
            },
            { label: 'TP1', value: formatPrice(open.tp1), valueColor: open.tp1Hit ? NEUTRAL : up },
            { label: 'TP2', value: formatPrice(open.tp2), valueColor: open.tp2Hit ? NEUTRAL : up },
            { label: 'TP3', value: formatPrice(open.tp3), valueColor: up },
            {
              label: 'R:R',
              value: `1 : ${(Math.abs(open.tp3 - open.entry) / (risk || 1)).toFixed(2)}`,
            },
            { label: 'SL Dist', value: `${((risk / open.entry) * 100).toFixed(2)}%` },
          );
        }

        rows.push(
          { label: 'Trades', value: String(total) },
          {
            label: 'W – L',
            value: `${r.wins} – ${r.losses}`,
            valueColor: r.wins >= r.losses ? up : down,
          },
          {
            label: 'Win rate',
            value: total > 0 ? `${winRate.toFixed(0)}%` : '—',
            valueColor: winRate >= 50 ? up : down,
          },
        );

        if (r.form.length > 0) {
          rows.push({
            label: 'Form',
            value: r.form.map((f) => (f === 'win' ? '▲' : '▼')).join(' '),
          });
        }

        panel = { position: 'Top Right', rows };
      }

      return { series: [], boxes, segments, markers, panel };
    },
  },
  {
    // "Trendlines" (© ebecihalil, MPL-2.0) එකේ port එක.
    id: 'trendlines',
    name: 'Trendlines | ebecihalil',
    pane: 'main',
    params: [
      { key: 'backBars', label: 'Bars to Apply', default: 300, min: 50, max: 1000 },
      {
        key: 'source',
        label: 'Pivot Source',
        kind: 'select',
        default: 'High/Low',
        options: ['High/Low', 'Close'],
      },
      { key: 'strength', label: 'Pivot Strength', default: 10, min: 5, max: 15 },
      { key: 'touches', label: 'Min Pivot Confirmation', default: 3, min: 2, max: 8 },
      { key: 'transparency', label: 'Zone Transparency', default: 50, min: 0, max: 100 },
      { key: 'dashboard', label: 'Dashboard', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p) => {
      const r = computeTrendlines(candles, {
        backBars: num(p, 'backBars', 300),
        pivotSource: str(p, 'source', 'High/Low') === 'Close' ? 'Close' : 'High/Low',
        pivotStrength: num(p, 'strength', 10),
        minTouches: num(p, 'touches', 3),
      });

      const transparency = num(p, 'transparency', 50);
      const series: IndicatorSeries[] = [];
      const bands: IndicatorBand[] = [];

      // Zone එකක් = ඇල රේඛා දෙකක් + ඒවා අතර පාට කරපු කලාපයක්.
      // ChartSegment තිරස් විතරයි කරන්නේ නිසා, ඇල රේඛාවක් අඳින්නේ bar
      // එකකට point එකක් බැගින් line series එකකින්.
      const drawZone = (zone: TrendZone | null, color: string, key: string, label: string) => {
        if (!zone) return;
        const top: LinePoint[] = [];
        const bottom: LinePoint[] = [];
        const points: BandPoint[] = [];
        const fill = withAlpha(color, transparency);

        for (let i = zone.startIndex; i < candles.length; i++) {
          const mid = zonePriceAt(zone, i);
          const time = candles[i].time;
          top.push({ time, value: mid + zone.offsetUp });
          bottom.push({ time, value: mid + zone.offsetDown });
          points.push({
            time,
            upper: mid + zone.offsetUp,
            lower: mid + zone.offsetDown,
            color: fill,
          });
        }

        const edge = withAlpha(color, 50);
        series.push({
          key: `${key}Top`,
          label: `${label} top`,
          type: 'line',
          color: edge,
          data: top,
          lineWidth: 1,
          lastValueVisible: false,
        });
        series.push({
          key: `${key}Bot`,
          label: `${label} · ${zone.touches} touches`,
          type: 'line',
          color: edge,
          data: bottom,
          lineWidth: 1,
        });
        bands.push({ key, points });
      };

      drawZone(r.resistance, TV.red, 'resistance', 'Resistance');
      drawZone(r.support, TV.green, 'support', 'Support');

      let panel: IndicatorPanel | undefined;
      if (str(p, 'dashboard', 'On') === 'On' && candles.length > 0) {
        const price = candles[candles.length - 1].close;
        const rows: IndicatorPanelRow[] = [];
        const zoneRow = (zone: TrendZone | null, name: string, color: string) => {
          if (!zone) {
            rows.push({ label: name, value: 'none', valueColor: NEUTRAL });
            return;
          }
          const mid = (zone.top + zone.bottom) / 2;
          const away = ((mid - price) / price) * 100;
          rows.push({
            label: name,
            value:
              `${formatPrice(zone.bottom)} – ${formatPrice(zone.top)}  ` +
              `(${away >= 0 ? '+' : ''}${away.toFixed(2)}%)`,
            valueColor: color,
          });
          rows.push({
            label: `${name} slope`,
            value: `${zone.slope >= 0 ? '↗ rising' : '↘ falling'} · ${zone.touches} touches`,
            valueColor: color,
          });
        };
        zoneRow(r.resistance, 'Resistance', TV.red);
        zoneRow(r.support, 'Support', TV.green);
        rows.push({
          label: 'State',
          value: r.breakout ? 'Zone breakout' : r.touch ? 'Zone touch' : 'Inside range',
          valueColor: r.breakout ? TV.orange : r.touch ? TV.blue : NEUTRAL,
        });
        panel = { position: 'Top Right', rows };
      }

      return { series, bands, panel };
    },
  },
  {
    // "Elliott Wave Detector PRO [TGTBTB]" v3.1 — MTF Edition
    // (© GoodBadBitcoin, MPL-2.0) එකේ port එක.
    id: 'elliott',
    name: 'Elliott Wave Detector PRO',
    pane: 'main',
    // Script එකේ auto-detect table එකේ 15m–1H chart එකකට → 4H + Daily.
    mtf: ['4h', '1d'],
    params: [
      { key: 'primaryLen', label: 'Primary Swing Length', default: 13, min: 3, max: 100 },
      { key: 'subLen', label: 'Sub-Wave Swing Length', default: 5, min: 2, max: 50 },
      { key: 'minPct', label: 'Min Swing % (Primary)', default: 5, min: 0.5, max: 30, step: 0.5 },
      { key: 'minSubPct', label: 'Min Swing % (Sub)', default: 2, min: 0.1, max: 15, step: 0.1 },
      { key: 'impulse', label: 'Detect Impulse', kind: 'switch', default: 'On' },
      { key: 'diagonal', label: 'Detect Diagonal', kind: 'switch', default: 'On' },
      { key: 'zigzag', label: 'Detect Zigzag', kind: 'switch', default: 'On' },
      { key: 'flat', label: 'Detect Flat', kind: 'switch', default: 'On' },
      { key: 'triangle', label: 'Detect Triangle', kind: 'switch', default: 'On' },
      { key: 'mtfOn', label: 'MTF Validation (4h + 1d)', kind: 'switch', default: 'On' },
      { key: 'htfLen', label: 'HTF Swing Length', default: 7, min: 3, max: 50 },
      { key: 'htfPct', label: 'HTF Min Swing %', default: 5, min: 0.1, max: 50, step: 0.5 },
      { key: 'htfWeight', label: 'HTF Confidence Weight', default: 0.2, min: 0, max: 0.5, step: 0.05 },
      { key: 'waveLines', label: 'Connect Waves', kind: 'switch', default: 'On' },
      { key: 'subWaves', label: 'Show Sub-Wave Pivots', kind: 'switch', default: 'Off' },
      { key: 'fibRetrace', label: 'Show Retracements', kind: 'switch', default: 'On' },
      { key: 'fibExtend', label: 'Show Extensions', kind: 'switch', default: 'On' },
      { key: 'signals', label: 'Trade Signals', kind: 'switch', default: 'On' },
      { key: 'panel', label: 'Info Panel', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p, ctx) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const r = computeElliottWave(
        candles,
        {
          primarySwingLength: num(p, 'primaryLen', 13),
          secondarySwingLength: num(p, 'subLen', 5),
          minSwingPct: num(p, 'minPct', 5),
          minSubSwingPct: num(p, 'minSubPct', 2),
          detectImpulse: on('impulse'),
          detectDiagonal: on('diagonal'),
          detectZigzag: on('zigzag'),
          detectFlat: on('flat'),
          detectTriangle: on('triangle'),
          useMtf: on('mtfOn'),
          htfSwingLength: num(p, 'htfLen', 7),
          htfMinSwingPct: num(p, 'htfPct', 5),
          htfConfidenceWeight: num(p, 'htfWeight', 0.2),
          enableSignals: on('signals'),
          projectionBars: 30,
        },
        ctx.mtf['4h'] ?? [],
        ctx.mtf['1d'] ?? [],
        { retracements: on('fibRetrace'), extensions: on('fibExtend') },
      );

      const bull = '#00C853';
      const bear = '#FF1744';
      const corrective = '#FFC107';
      const fibC = '#2196F3';
      const target = '#9C27B0';
      const at = (index: number) => candles[index].time;
      const last = candles.length - 1;

      const segments: ChartSegment[] = [];
      const markers: IndicatorMarker[] = [];
      const series: IndicatorSeries[] = [];

      const pattern = r.pattern;
      const waveColor = pattern?.isBullish ? bull : bear;

      if (pattern) {
        // ── Wave labels ───────────────────────────────────────────────
        // Validate වුණු count එකකට විතරයි ඉලක්කම් — නැත්නම් pivot තිත් විතරයි.
        for (const w of pattern.waves) {
          const isCorrectiveWave = 'ABCDE'.includes(w.number) || !w.isMotive;
          markers.push({
            time: at(w.endIndex),
            position: candles[w.endIndex].high === w.endPrice ? 'aboveBar' : 'belowBar',
            shape: 'square',
            color: isCorrectiveWave ? corrective : waveColor,
            text: w.number,
          });
        }

        // ── Wave connectors ───────────────────────────────────────────
        if (on('waveLines')) {
          const line: LinePoint[] = [
            { time: at(pattern.waves[0].startIndex), value: pattern.waves[0].startPrice },
            ...pattern.waves.map((w) => ({ time: at(w.endIndex), value: w.endPrice })),
          ];
          series.push({
            key: 'waveLine',
            label: `${pattern.patternType} (${Math.round(pattern.confidence * 100)}%)`,
            type: 'line',
            color: waveColor,
            data: line,
            lineWidth: 2,
            lastValueVisible: false,
          });
        }

        // ── Pattern name ──────────────────────────────────────────────
        segments.push({
          time1: at(pattern.startIndex),
          time2: at(pattern.endIndex),
          price: pattern.waves[0].startPrice,
          color: withAlpha(waveColor, 70),
          width: 1,
          dashed: true,
          label: {
            text: `${pattern.patternType.toUpperCase()} (${Math.round(pattern.confidence * 100)}%)`,
            background: withAlpha(waveColor, 20),
            color: '#fff',
          },
        });
      } else {
        // Count එකක් නෑ — pivots විතරක් තිත් විදිහට. "දන්නේ නෑ" කියන එකයි
        // වැරදි count එකක් පෙන්නනවට වඩා හොඳ.
        for (const pv of r.primaryPivots.slice(-12)) {
          markers.push({
            time: at(pv.index),
            position: pv.isHigh ? 'aboveBar' : 'belowBar',
            shape: 'circle',
            color: NEUTRAL,
          });
        }
      }

      // ── Sub-wave pivots ─────────────────────────────────────────────
      if (on('subWaves', 'Off')) {
        for (const pv of r.secondaryPivots.slice(-40)) {
          markers.push({
            time: at(pv.index),
            position: pv.isHigh ? 'atPriceTop' : 'atPriceBottom',
            shape: 'circle',
            color: withAlpha(NEUTRAL, 40),
            price: pv.price,
          });
        }
      }

      // ── Fibonacci levels ────────────────────────────────────────────
      if (pattern) {
        for (const level of r.fib) {
          const isExt = level.kind === 'extension';
          const color = withAlpha(isExt ? target : fibC, 55);
          segments.push({
            time1: at(pattern.endIndex),
            time2: at(last),
            price: level.price,
            color,
            width: 1,
            dashed: true,
            label: {
              text: `${isExt ? '⤢' : '↩'} ${(level.ratio * 100).toFixed(1)}% ▸ ${formatPrice(level.price)}`,
              background: color,
              color: '#fff',
            },
          });
        }
      }

      // ── Forecast ────────────────────────────────────────────────────
      const f = r.forecast;
      if (f) {
        // Confirm වුණු forecast එකට ඝන රේඛා, නොවුණු එකට තුනී+විනිවිද.
        const alpha = f.confirmed ? 25 : 75;
        const width = f.confirmed ? 2 : 1;
        const zone = (price: number, text: string, color: string) =>
          segments.push({
            time1: at(last),
            time2: at(last),
            price,
            color: withAlpha(color, alpha),
            width,
            dashed: !f.confirmed,
            label: {
              text: `${text} ▸ ${formatPrice(price)}`,
              background: withAlpha(color, alpha),
              color: '#fff',
            },
          });
        zone(f.targetHigh, '◎ Target', target);
        zone(f.targetLow, '◎ Target', target);
        zone(f.stopLevel, '✘ Invalidation', bear);
      }

      // ── Signals ─────────────────────────────────────────────────────
      for (const s of r.signals) {
        markers.push({
          time: at(s.index),
          position: s.isBullish ? 'belowBar' : 'aboveBar',
          shape: s.isBullish ? 'arrowUp' : 'arrowDown',
          // Gate වුණු signal එකක් අළු පාටින් — තියෙනවා, ඒත් HTF එකට එරෙහියි.
          color: s.gated ? NEUTRAL : s.isBullish ? bull : bear,
          text: s.gated ? `${s.kind} (gated)` : s.kind,
        });
      }

      // ── Info panel ──────────────────────────────────────────────────
      let panel: IndicatorPanel | undefined;
      if (on('panel')) {
        const rows: IndicatorPanelRow[] = [
          { label: 'Pivots', value: String(r.primaryPivots.length) },
          {
            label: 'Pattern',
            value: pattern ? pattern.patternType.toUpperCase() : 'NONE',
            valueColor: pattern ? waveColor : NEUTRAL,
          },
        ];

        if (pattern) {
          const conf = Math.round(pattern.confidence * 100);
          rows.push(
            {
              label: 'Confidence',
              value: `${conf}%`,
              valueColor: conf >= 70 ? bull : conf >= 50 ? corrective : bear,
            },
            {
              label: 'Phase',
              value:
                pattern.patternType === 'impulse' || pattern.patternType === 'diagonal'
                  ? 'motive'
                  : 'corrective',
            },
            {
              label: 'Alternation',
              value: pattern.patternType === 'impulse' ? (pattern.alternationMet ? '✓' : '✗') : 'N/A',
              valueColor: pattern.alternationMet ? bull : NEUTRAL,
            },
            {
              label: 'Sub-waves',
              value: pattern.patternType === 'impulse' ? (pattern.subWavesValid ? '✓' : '✗') : 'N/A',
              valueColor: pattern.subWavesValid ? bull : NEUTRAL,
            },
            {
              label: 'Trend',
              value: pattern.isBullish ? 'BULLISH' : 'BEARISH',
              valueColor: pattern.isBullish ? bull : bear,
            },
          );
        }

        const m = r.mtf;
        if (m) {
          const htfRow = (label: string, h: typeof m.htf1) => ({
            label,
            value:
              h.pivotCount < 3
                ? 'building…'
                : `${h.pattern} (${Math.round(h.confidence * 100)}%)`,
            valueColor: h.pivotCount < 3 ? NEUTRAL : h.isBullish ? bull : bear,
          });
          rows.push(htfRow('4h', m.htf1), htfRow('1d', m.htf2), {
            label: 'Alignment',
            value: m.label === 'N/A' ? 'N/A' : `${m.label} (${m.score.toFixed(2)})`,
            valueColor:
              m.label === 'ALIGNED'
                ? bull
                : m.label === 'CONFLICTING'
                  ? bear
                  : m.label === 'PARTIAL'
                    ? corrective
                    : NEUTRAL,
          });
        }

        if (f) {
          rows.push(
            {
              label: 'Forecast',
              value: f.confirmed ? 'CONFIRMED' : 'UNCONFIRMED',
              valueColor: f.confirmed ? bull : NEUTRAL,
            },
            { label: 'Next wave', value: f.nextWave },
            { label: 'Rating', value: '★'.repeat(f.stars) + '☆'.repeat(5 - f.stars) },
          );
          if (f.mtfNote) {
            rows.push({
              label: 'MTF',
              value: f.mtfNote,
              valueColor: f.mtfNote.startsWith('⚠') ? bear : bull,
            });
          }
        }

        panel = { position: 'Top Right', rows };
      }

      return { series, segments, markers, panel };
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
