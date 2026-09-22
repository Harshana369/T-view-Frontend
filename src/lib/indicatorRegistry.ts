import type { UTCTimestamp } from 'lightweight-charts';
import type { BandPoint } from './bandFill';
import { computeBbRsi } from './bbRsi';
import { computeBbRsiTrail, BB_TRAIL_DEFAULTS, type BbTrailResult } from './bbRsiTrail';
import { computeSniperTrail, SNIPER_TRAIL_DEFAULTS } from './sniperTrail';
import {
  computeMacdSmaTrail2,
  MACD_TRAIL2_DEFAULTS,
  MACD_SIGNAL_DEFAULTS,
} from './macdSmaTrail2';
import {
  computeBreakoutTrail,
  BREAKOUT_TRAIL_DEFAULTS,
  BREAKOUT_SIGNAL_DEFAULTS,
} from './breakoutTrail';
import { positionView, tradeUsd, POSITION_DEFAULTS, formatSize, formatUsd } from './position';
import { computeBreakoutTargets } from './breakoutTargets';
import { computeElliottWave } from './elliottWave';
import { formatPrice } from './format';
import { atrArray, bollinger, emaArray, macd, rsiArray, smaArray, vwapArray } from './indicators';
import { computeLuxTrendlines } from './luxTrendlines';
import { computeMadLoop, madSignals, type SignalMode } from './madLoop';
import { computeMacdSma, type ChartArtColor } from './macdSma';
import { computeMacdSmaTrail, TRAIL_DEFAULTS } from './macdSmaTrail';
import { computeMoneyManagement, MONEY_DEFAULTS } from './moneyManagement';
import { computeOrderBlocks, type OrderBlock } from './orderBlocks';
import { computeSupertrend } from './supertrend';
import { computeTrama } from './trama';
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
/**
 * Binance එකේ **Position History** එකේ පේළියක්.
 *
 * Backtest එකක trade එකක් = ඇත්තට වහපු position එකක්. Binance එකේ
 * පේන තීරු ටිකම මෙතන තියෙනවා, ඒ නිසා එතන පුරුදු විදිහටම කියවන්න
 * පුළුවන්.
 */
export interface PositionRecord {
  /** Chart එකෙන් එන්නේ — indicator එක coin එක දන්නේ නෑ. */
  symbol: string;
  interval: string;
  dir: 1 | -1;
  leverage: number;
  /** Coin ගාණ. */
  size: number;
  notionalUsd: number;
  marginUsd: number;
  entryPrice: number;
  /** වැහුණු මිල (Binance: "Avg Close Price"). */
  closePrice: number;
  /** Unix තත්පර. */
  openedAt: number;
  closedAt: number;
  /** තාම වැහිලා නෑ නම් `true` — Binance එකේ Positions tab එකේ එක. */
  open: boolean;
  /**
   * Fees **අඩු කරන්න කලින්** — මිල චලනයෙන් විතරක් එන ලාභය/පාඩුව.
   * `realizedUsd = grossUsd − feeUsd` (liquidation එකෙන් කැපුවොත් හැර).
   */
  grossUsd: number;
  /** Fees + slippage **අඩු කරපු** අන්තිම ලාභය/පාඩුව — ගිණුමට එන එක. */
  realizedUsd: number;
  /** Fees + slippage, පැත්ත දෙකටම (ඇතුළු වීම + පිටවීම). */
  feeUsd: number;
  /** Margin එකට සාපේක්ෂව. */
  roePct: number;
  /** R වලින් — backtest එකේ භාෂාව. */
  r: number;
  /** stop / breakeven / trail / target / opposite / open */
  reason: string;
  liquidated: boolean;
}

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
  /** Binance-style position history එකට පේළි. */
  positions?: PositionRecord[];
}

/** compute() එකට යන අමතර data — දැනට උසස් timeframe candles විතරයි. */
export interface IndicatorContext {
  /** Interval code එකෙන් — උදා: `mtf['5m']`. */
  mtf: Record<string, Candle[]>;
  /** දැන් බලන coin එක — position history එකේ පේන්න ඕන. */
  symbol: string;
  interval: string;
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
      // ── Noise filters ──────────────────────────────────────────────
      // Default එක HTF ×4 + EMA 20. timeframes තුනකම (15m/4h/1d) whipsaw
      // එක 13-16% සිට 2-3% දක්වා අඩු කරලා, follow-through එකත් වැඩි
      // කරනවා. `Trend Filter ×bars` 0 කළොත් මුල් script එකේ හැසිරීම.
      { key: 'htfMult', label: 'Trend Filter ×bars', default: 4, min: 0, max: 96 },
      { key: 'htfEma', label: 'Trend Filter EMA', default: 20, min: 2, max: 200 },
      { key: 'confirmBars', label: 'Confirm Bars', default: 0, min: 0, max: 20 },
      { key: 'cooldownBars', label: 'Min Bars Between', default: 0, min: 0, max: 200 },
      { key: 'adxMin', label: 'Min ADX', default: 0, min: 0, max: 50 },
      { key: 'minMove', label: 'Min Move ×ATR', default: 0, min: 0, max: 5, step: 0.1 },
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

      // Score එක 0 පනිනකොට Long/Short label එක (Pine `plotshape`) — ඒත්
      // noise filters හරහා. මුල් script එකේ හැම cross එකකටම label එකක්
      // එනවා; range එකකදී ඒක වාරයක් පාසා පනිනවා. විස්තර madLoop.ts එකේ.
      const signals = madSignals(candles, r.score, {
        confirmBars: num(p, 'confirmBars', 0),
        cooldownBars: num(p, 'cooldownBars', 0),
        htfMultiplier: num(p, 'htfMult', 4),
        htfEmaLength: num(p, 'htfEma', 20),
        adxMin: num(p, 'adxMin', 0),
        minMoveAtr: num(p, 'minMove', 0),
      });
      const markers: IndicatorMarker[] = signals.map((s) => ({
        time: candles[s.index].time,
        position: s.dir === 1 ? 'belowBar' : 'aboveBar',
        shape: s.dir === 1 ? 'arrowUp' : 'arrowDown',
        color: s.dir === 1 ? up : down,
        text: s.dir === 1 ? 'Long' : 'Short',
      }));

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
  {
    // "Trendlines with Breaks [LuxAlgo]" (© LuxAlgo, CC BY-NC-SA 4.0).
    id: 'luxtrendlines',
    name: 'Trendlines with Breaks | LuxAlgo',
    pane: 'main',
    params: [
      { key: 'length', label: 'Swing Detection Lookback', default: 14, min: 1, max: 200 },
      { key: 'mult', label: 'Slope', default: 1, min: 0, max: 10, step: 0.1 },
      {
        key: 'method',
        label: 'Slope Calculation Method',
        kind: 'select',
        default: 'Atr',
        options: ['Atr', 'Stdev', 'Linreg'],
      },
      // Off කළොත් real-time තොරතුර පේනවා — රේඛා අතීතයට තල්ලු වෙන්නේ නෑ.
      { key: 'backpaint', label: 'Backpaint', kind: 'switch', default: 'On' },
      { key: 'showExt', label: 'Show Extended Lines', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p) => {
      const length = num(p, 'length', 14);
      const r = computeLuxTrendlines(candles, {
        length,
        mult: num(p, 'mult', 1),
        method: str(p, 'method', 'Atr') as 'Atr' | 'Stdev' | 'Linreg',
        backpaint: str(p, 'backpaint', 'On') === 'On',
        showExtended: str(p, 'showExt', 'On') === 'On',
      });

      // Pine defaults: color.teal / color.red.
      const upCss = '#008080';
      const dnCss = '#FF0000';
      // Pine `color = ph ? na : upCss` — reset bar එකේදී රේඛාව නොපෙනෙනවා.
      // ඒක මෙතන කරන්නේ ඒ ලක්ෂ්‍යයට විනිවිද පාටක් දීලා.
      const invisible = 'rgba(0, 0, 0, 0)';

      const linePoints = (values: number[], gaps: boolean[], color: string): LinePoint[] => {
        const out: LinePoint[] = [];
        for (let i = 0; i < candles.length; i++) {
          if (Number.isNaN(values[i])) continue;
          out.push({ time: candles[i].time, value: values[i], color: gaps[i] ? invisible : color });
        }
        return out;
      };

      const series: IndicatorSeries[] = [
        {
          key: 'upper',
          label: 'Upper',
          type: 'line',
          color: upCss,
          data: linePoints(r.upperPlot, r.upperGap, upCss),
          lineWidth: 1,
          lastValueVisible: false,
        },
        {
          key: 'lower',
          label: 'Lower',
          type: 'line',
          color: dnCss,
          data: linePoints(r.lowerPlot, r.lowerGap, dnCss),
          lineWidth: 1,
          lastValueVisible: false,
        },
      ];

      // Extended dashed rays — Pine එකේ `extend.right` කියන්නේ අනන්තය
      // දක්වා. මෙතන අන්තිම candle එක දක්වා අඳිනවා (ඇල රේඛාවක් නිසා
      // bar එකකට ලක්ෂ්‍යයක් බැගින් line series එකකින්).
      const last = candles.length - 1;
      const rayPoints = (ray: { index: number; price: number; slope: number }): LinePoint[] => {
        const out: LinePoint[] = [];
        for (let i = ray.index; i <= last; i++) {
          out.push({ time: candles[i].time, value: ray.price + ray.slope * (i - ray.index) });
        }
        return out;
      };
      if (r.upRay) {
        series.push({
          key: 'upRay',
          label: '',
          type: 'line',
          color: withAlpha(upCss, 40),
          data: rayPoints(r.upRay),
          lineWidth: 1,
          lastValueVisible: false,
        });
      }
      if (r.dnRay) {
        series.push({
          key: 'dnRay',
          label: '',
          type: 'line',
          color: withAlpha(dnCss, 40),
          data: rayPoints(r.dnRay),
          lineWidth: 1,
          lastValueVisible: false,
        });
      }

      // Breakout "B" labels — Pine `plotshape(..., location.absolute)`.
      // මේවා backpaint වෙන්නේ නෑ (script එකේ v3 release note එකේ කියලා
      // තියෙන විදිහට 100% non-repaint).
      const markers: IndicatorMarker[] = r.breaks.map((b) => ({
        time: candles[b.index].time,
        position: b.dir === 1 ? 'atPriceBottom' : 'atPriceTop',
        shape: b.dir === 1 ? 'arrowUp' : 'arrowDown',
        color: b.dir === 1 ? upCss : dnCss,
        text: 'B',
        price: b.price,
      }));

      return { series, markers };
    },
  },
  {
    // "Trend Regularity Adaptive Moving Average" / TRAMA
    // (© LuxAlgo, CC BY-NC-SA 4.0).
    id: 'trama',
    name: 'TRAMA | LuxAlgo',
    pane: 'main',
    params: [
      { key: 'length', label: 'Length', default: 99, min: 1, max: 500 },
      {
        key: 'source',
        label: 'Src',
        kind: 'select',
        default: 'close',
        options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'],
      },
    ],
    compute: (candles, p) => {
      const r = computeTrama(candles, {
        length: num(p, 'length', 99),
        source: str(p, 'source', 'close'),
      });
      return {
        series: [
          {
            key: 'trama',
            label: `TRAMA ${num(p, 'length', 99)}`,
            type: 'line',
            // Pine `plot(ama, "Plot", #ff1100, 2)`.
            color: '#ff1100',
            data: toPoints(candles, r.ama),
            lineWidth: 2,
          },
        ],
      };
    },
  },
  {
    // "Supertrend" (© KivancOzbilgic) එකේ port එක.
    id: 'supertrend',
    name: 'Supertrend | KivancOzbilgic',
    pane: 'main',
    params: [
      { key: 'periods', label: 'ATR Period', default: 10, min: 1, max: 200 },
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        default: 'hl2',
        options: ['hl2', 'close', 'open', 'high', 'low', 'hlc3', 'ohlc4'],
      },
      { key: 'mult', label: 'ATR Multiplier', default: 3, min: 0.1, max: 20, step: 0.1 },
      // On = `atr(Periods)` (RMA), Off = `sma(tr, Periods)`.
      { key: 'changeAtr', label: 'Change ATR Calculation Method ?', kind: 'switch', default: 'On' },
      { key: 'showsignals', label: 'Show Buy/Sell Signals ?', kind: 'switch', default: 'On' },
      { key: 'highlighting', label: 'Highlighter On/Off ?', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const r = computeSupertrend(candles, {
        periods: num(p, 'periods', 10),
        source: str(p, 'source', 'hl2'),
        multiplier: num(p, 'mult', 3),
        changeAtr: on('changeAtr'),
      });

      // Pine defaults: color.green / color.red.
      const green = '#008000';
      const red = '#FF0000';
      // Pine `plot.style_linebr` — trend එක අනිත් පැත්තේ තියෙනකොට රේඛාව
      // **කැඩෙනවා**. lightweight-charts එකේ ඒකට ලක්ෂ්‍ය මඟහරින්න බෑ
      // (ඒවා එකට සම්බන්ධ වෙනවා), ඒ නිසා ඒ තැන් වලට විනිවිද පාටක්.
      const invisible = 'rgba(0, 0, 0, 0)';

      const line = (values: number[], want: number, color: string): LinePoint[] => {
        const out: LinePoint[] = [];
        for (let i = 0; i < candles.length; i++) {
          if (Number.isNaN(values[i])) continue;
          // හැරෙන bar එකේ **ඇතුළට එන** කොටසත් හංගනවා — නැත්නම් අනිත්
          // පැත්තේ ඉඳන් ඇදෙන රේඛාවක් පේනවා.
          const starts = i === 0 || r.trend[i - 1] !== want;
          const show = r.trend[i] === want && !starts;
          out.push({ time: candles[i].time, value: values[i], color: show ? color : invisible });
        }
        return out;
      };

      const series: IndicatorSeries[] = [
        {
          key: 'up',
          label: 'Up Trend',
          type: 'line',
          color: green,
          data: line(r.up, 1, green),
          lineWidth: 2,
          lastValueVisible: false,
        },
        {
          key: 'dn',
          label: 'Down Trend',
          type: 'line',
          color: red,
          data: line(r.dn, -1, red),
          lineWidth: 2,
          lastValueVisible: false,
        },
      ];

      // Highlighter — Pine `fill(mPlot, upPlot)` / `fill(mPlot, dnPlot)`,
      // ohlc4 එකයි trend රේඛාවයි අතර. v4 එකේ fill() default transp 90.
      const bands: IndicatorBand[] = [];
      if (on('highlighting')) {
        const fill = (values: number[], want: number, color: string): BandPoint[] => {
          const pts: BandPoint[] = [];
          for (let i = 0; i < candles.length; i++) {
            if (Number.isNaN(values[i])) continue;
            const c = candles[i];
            const mid = (c.open + c.high + c.low + c.close) / 4;
            pts.push({
              time: c.time,
              upper: Math.max(mid, values[i]),
              lower: Math.min(mid, values[i]),
              color: r.trend[i] === want ? withAlpha(color, 90) : invisible,
            });
          }
          return pts;
        };
        bands.push({ key: 'upFill', points: fill(r.up, 1, green) });
        bands.push({ key: 'dnFill', points: fill(r.dn, -1, red) });
      }

      // Pine: circle එකක් හැමතිස්සෙම, "Buy"/"Sell" label එක switch එකෙන්.
      const showLabels = on('showsignals');
      const markers: IndicatorMarker[] = [];
      for (const i of r.buySignals) {
        markers.push({
          time: candles[i].time,
          position: 'atPriceBottom',
          shape: showLabels ? 'arrowUp' : 'circle',
          color: green,
          price: r.up[i],
          text: showLabels ? 'Buy' : undefined,
        });
      }
      for (const i of r.sellSignals) {
        markers.push({
          time: candles[i].time,
          position: 'atPriceTop',
          shape: showLabels ? 'arrowDown' : 'circle',
          color: red,
          price: r.dn[i],
          text: showLabels ? 'Sell' : undefined,
        });
      }

      return { series, bands, markers };
    },
  },
  {
    // "Order Block Finder (Experimental)" (© wugamlo, MPL-2.0).
    // ⚠️ අර්ථ දැක්වීමෙන්ම repaint වෙනවා — විස්තර orderBlocks.ts එකේ.
    id: 'orderblocks',
    name: 'Order Block Finder | wugamlo',
    pane: 'main',
    params: [
      {
        key: 'colors',
        label: 'Color Scheme',
        kind: 'select',
        default: 'DARK',
        options: ['DARK', 'BRIGHT'],
      },
      { key: 'periods', label: 'Relevant Periods to identify OB', default: 5, min: 1, max: 50 },
      {
        key: 'threshold',
        label: 'Min. Percent move to identify OB',
        default: 0,
        min: 0,
        max: 100,
        step: 0.1,
      },
      { key: 'usewicks', label: 'Use whole range [High/Low] for OB marking?', kind: 'switch', default: 'Off' },
      { key: 'showbull', label: 'Show latest Bullish Channel?', kind: 'switch', default: 'On' },
      { key: 'showbear', label: 'Show latest Bearish Channel?', kind: 'switch', default: 'On' },
      { key: 'infopan', label: 'Show Latest OB Panel?', kind: 'switch', default: 'Off' },
    ],
    compute: (candles, p) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const periods = num(p, 'periods', 5);
      const r = computeOrderBlocks(candles, {
        periods,
        threshold: num(p, 'threshold', 0),
        useWicks: on('usewicks', 'Off'),
      });

      // Pine: DARK → white/blue, BRIGHT → green/red (v4 built-in colours).
      const dark = str(p, 'colors', 'DARK') === 'DARK';
      const bullColor = dark ? '#FFFFFF' : '#4CAF50';
      const bearColor = dark ? '#2196F3' : '#FF5252';

      const at = (index: number) => candles[index].time;
      const last = candles.length - 1;
      const boxes: ChartBox[] = [];
      const segments: ChartSegment[] = [];
      const markers: IndicatorMarker[] = [];

      for (const b of r.blocks) {
        const color = b.dir === 1 ? bullColor : bearColor;
        // Pine එකේ මේක plot දෙකක් (linewidth 3) + ඒවා අතර `fill(transp=0)` —
        // ඒ කියන්නේ OB candle එකේ තියෙන ඝන සිරස් පටියක්. මෙතන ඒක candle
        // එකක පළලට box එකක් විදිහට (1px එකකට වඩා පේනවා).
        boxes.push({
          time1: at(b.index),
          time2: at(Math.min(b.index + 1, last)),
          top: b.high,
          bottom: b.low,
          fill: color,
        });
        // "Bullish OB" / "Bearish OB" — OB candle එකට යටින්/උඩින්.
        markers.push({
          time: at(b.index),
          position: b.dir === 1 ? 'belowBar' : 'aboveBar',
          shape: b.dir === 1 ? 'arrowUp' : 'arrowDown',
          color,
          text: b.dir === 1 ? 'Bullish OB' : 'Bearish OB',
        });
        // Equilibrium — Pine `shape.cross` at `location.absolute`.
        markers.push({
          time: at(b.index),
          position: 'atPriceMiddle',
          shape: 'circle',
          color,
          price: b.avg,
        });
      }

      // අන්තිම OB එකේ channel — avg ඝනයි, high/low තිත්.
      // Pine එකේ මේවා detect වුණු bar එකේ ඉඳන් දිගු වෙනවා (screenshot එකේ
      // පේන විදිහට දකුණට, අන්තිම candle එක පනිනකම්).
      const channel = (b: OrderBlock | null, color: string) => {
        if (!b) return;
        const time1 = at(Math.min(b.detectedAt, last));
        const time2 = at(last);
        const line = (price: number, dashed: boolean): ChartSegment => ({
          time1,
          time2,
          price,
          color,
          width: 1,
          dashed,
        });
        segments.push(line(b.avg, false));
        segments.push(line(b.high, true));
        segments.push(line(b.low, true));
      };
      if (on('showbull')) channel(r.latestBull, bullColor);
      if (on('showbear')) channel(r.latestBear, bearColor);

      // Pine "InfoPanel" — අන්තිම OB දෙකේ අගයන්.
      let panel: IndicatorPanel | undefined;
      if (on('infopan', 'Off')) {
        const rows: IndicatorPanelRow[] = [];
        const add = (b: OrderBlock | null, name: string, color: string) => {
          if (!b) {
            rows.push({ label: name, value: '—', valueColor: NEUTRAL });
            return;
          }
          rows.push({ label: `${name} - High`, value: formatPrice(b.high), valueColor: color });
          rows.push({ label: `${name} - Avg`, value: formatPrice(b.avg), valueColor: color });
          rows.push({ label: `${name} - Low`, value: formatPrice(b.low), valueColor: color });
        };
        add(r.latestBull, 'Bullish', bullColor);
        add(r.latestBear, 'Bearish', bearColor);
        panel = { position: 'Top Right', rows };
      }

      return { series: [], boxes, segments, markers, panel };
    },
  },
  {
    // "MACD + SMA 200 Strategy" (© ChartArt, 2015).
    // ⚠️ MACD එක SMA වලින් — විස්තර macdSma.ts එකේ.
    id: 'macdsma',
    name: 'MACD + SMA 200 | ChartArt',
    pane: 'main',
    params: [
      {
        key: 'source',
        label: 'Source',
        kind: 'select',
        default: 'close',
        options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'],
      },
      { key: 'fast', label: 'MACD fast moving average', default: 12, min: 1, max: 200 },
      { key: 'slow', label: 'MACD slow moving average', default: 26, min: 1, max: 400 },
      { key: 'signal', label: 'MACD signal line moving average', default: 9, min: 1, max: 200 },
      { key: 'veryslow', label: 'Very slow moving average', default: 200, min: 1, max: 1000 },
      { key: 'switch1', label: 'Enable Bar Color?', kind: 'switch', default: 'On' },
      { key: 'switch2', label: 'Enable Moving Averages?', kind: 'switch', default: 'On' },
      { key: 'switch3', label: 'Enable Background Color?', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const r = computeMacdSma(candles, {
        source: str(p, 'source', 'close'),
        fastLength: num(p, 'fast', 12),
        slowLength: num(p, 'slow', 26),
        signalLength: num(p, 'signal', 9),
        veryslowLength: num(p, 'veryslow', 200),
      });

      // Pine v2 built-in colours.
      const PINE: Record<ChartArtColor, string> = {
        green: '#008000',
        red: '#FF0000',
        blue: '#0000FF',
      };
      const GRAY = '#808080';

      const series: IndicatorSeries[] = [];
      const bands: IndicatorBand[] = [];
      const boxes: ChartBox[] = [];

      if (on('switch2')) {
        // F සහ S — දෙකේම පාට `trendcolor`, bar එකෙන් bar එකට වෙනස්.
        const colored = (values: number[], colors: ChartArtColor[]) =>
          toColoredPoints(candles, values, colors.map((c) => PINE[c]));

        series.push({
          key: 'fastMA',
          label: `MACD fast ${num(p, 'fast', 12)}`,
          type: 'line',
          color: PINE.blue,
          data: colored(r.fastMA, r.trendColor),
          lineWidth: 1,
          lastValueVisible: false,
        });
        series.push({
          key: 'slowMA',
          label: `MACD slow ${num(p, 'slow', 26)}`,
          type: 'line',
          color: PINE.blue,
          data: colored(r.slowMA, r.trendColor),
          lineWidth: 2,
          lastValueVisible: false,
        });
        series.push({
          key: 'veryslowMA',
          label: `SMA ${num(p, 'veryslow', 200)}`,
          type: 'line',
          color: PINE.green,
          data: colored(r.veryslowMA, r.maTrendColor),
          lineWidth: 4,
        });

        // Pine `fill(F, V, color=gray)` — fastMA එකයි veryslowMA එකයි අතර.
        const points: BandPoint[] = [];
        for (let i = 0; i < candles.length; i++) {
          if (Number.isNaN(r.fastMA[i]) || Number.isNaN(r.veryslowMA[i])) continue;
          points.push({
            time: candles[i].time,
            upper: Math.max(r.fastMA[i], r.veryslowMA[i]),
            lower: Math.min(r.fastMA[i], r.veryslowMA[i]),
            color: withAlpha(GRAY, 80),
          });
        }
        bands.push({ key: 'maFill', points });
      }

      // Pine `bgcolor(..., transp=80)` — signal bar එකේ පසුබිම පාට වෙනවා.
      // මේ chart එකේ background channel එකක් නෑ, ඒ නිසා ඒ bar එකට උස
      // box එකක්. (Boxes autoscale එකට බලපාන්නේ නෑ — primitive එකක්.)
      if (on('switch3') && candles.length > 0) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const c of candles) {
          if (c.low < lo) lo = c.low;
          if (c.high > hi) hi = c.high;
        }
        const pad = (hi - lo) * 2 + hi;
        for (let i = 0; i < candles.length; i++) {
          const bg = r.background[i];
          if (!bg) continue;
          boxes.push({
            time1: candles[i].time,
            time2: candles[Math.min(i + 1, candles.length - 1)].time,
            top: pad,
            bottom: Math.max(lo - (hi - lo), 0),
            fill: withAlpha(PINE[bg], 80),
          });
        }
      }

      // Pine `barcolor(bartrendcolor)`.
      const barColors = on('switch1')
        ? r.barColor.map((c) => ({ body: PINE[c], wick: PINE[c], border: PINE[c] }))
        : undefined;

      // Strategy entries — "Bullish" / "Bearish" (Pine `comment=`).
      const markers: IndicatorMarker[] = r.signals.map((sig) => ({
        time: candles[sig.index].time,
        position: sig.dir === 1 ? 'belowBar' : 'aboveBar',
        shape: sig.dir === 1 ? 'arrowUp' : 'arrowDown',
        color: sig.dir === 1 ? PINE.green : PINE.red,
        text: sig.dir === 1 ? 'Bullish' : 'Bearish',
      }));

      return { series, bands, boxes, markers, barColors };
    },
  },
  {
    // MACD + SMA 200 signals + trailing stop — ලාභ/පාඩුව මනිනවා.
    // මුල් port එක ('macdsma') පිරිසිදුව තියෙනවා; මේක ඒකට උඩින්.
    id: 'macdsmatrail',
    name: 'MACD + SMA 200 — Trailing Backtest',
    pane: 'main',
    params: [
      { key: 'initialSl', label: 'Initial SL xATR', default: 2, min: 0.2, max: 10, step: 0.1 },
      { key: 'trailAtr', label: 'Trail xATR (0 = off)', default: 3, min: 0, max: 15, step: 0.5 },
      { key: 'trailAfter', label: 'Trail after xR', default: 0, min: 0, max: 5, step: 0.25 },
      { key: 'takeProfit', label: 'Take Profit xR (0 = off)', default: 0, min: 0, max: 20, step: 0.5 },
      { key: 'exitOpp', label: 'Exit on opposite signal', kind: 'switch', default: 'On' },
      { key: 'atrLength', label: 'ATR Length', default: 14, min: 1, max: 200 },
      { key: 'fee', label: 'Fee % (per side)', default: 0.045, min: 0, max: 0.2, step: 0.001 },
      { key: 'maxRisk', label: 'Max Risk %', default: 10, min: 0.5, max: 50, step: 0.5 },
      { key: 'fast', label: 'MACD fast', default: 12, min: 1, max: 200 },
      { key: 'slow', label: 'MACD slow', default: 26, min: 1, max: 400 },
      { key: 'signalLen', label: 'MACD signal', default: 9, min: 1, max: 200 },
      { key: 'veryslow', label: 'Very slow MA', default: 200, min: 1, max: 1000 },
      // Default එකට off — මේක පේළි 7ක් ගන්නවා, සහ ඒක දිගටම බලාගෙන
      // ඉන්න දෙයක් නෙවෙයි (exit ක්‍රමයක් තෝරගන්නකම් විතරයි).
      { key: 'compare', label: 'Compare exit methods', kind: 'switch', default: 'Off' },
      // ── Money management ──────────────────────────────────────────
      { key: 'money', label: 'Money Management', kind: 'switch', default: 'On' },
      { key: 'startEquity', label: 'Start Equity', default: 1000, min: 10, max: 1000000 },
      { key: 'riskPct', label: 'Risk per trade %', default: 1, min: 0.1, max: 25, step: 0.1 },
      { key: 'compound', label: 'Compound', kind: 'switch', default: 'On' },
      { key: 'ddStop', label: 'Stop at drawdown % (0 = off)', default: 0, min: 0, max: 90, step: 5 },
    ],
    compute: (candles, p) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const r = computeMacdSmaTrail(candles, {
        ...TRAIL_DEFAULTS,
        signal: {
          source: 'close',
          fastLength: num(p, 'fast', 12),
          slowLength: num(p, 'slow', 26),
          signalLength: num(p, 'signalLen', 9),
          veryslowLength: num(p, 'veryslow', 200),
        },
        atrLength: num(p, 'atrLength', 14),
        initialSlAtr: num(p, 'initialSl', 2),
        trailAtr: num(p, 'trailAtr', 3),
        trailAfterR: num(p, 'trailAfter', 0),
        takeProfitR: num(p, 'takeProfit', 0),
        exitOnOpposite: on('exitOpp'),
        feePct: num(p, 'fee', 0.045),
        maxRiskPct: num(p, 'maxRisk', 10),
      });

      const up = '#26a69a';
      const down = '#ef5350';
      const at = (index: number) => candles[index].time;
      const series: IndicatorSeries[] = [];
      const segments: ChartSegment[] = [];

      // Entry markers — දිනුම/පාඩුව පාටින්, ප්‍රතිඵලය R වලින් text එකේ.
      const markers: IndicatorMarker[] = r.trades.map((t) => ({
        time: at(t.index),
        position: t.dir === 1 ? 'belowBar' : 'aboveBar',
        shape: t.dir === 1 ? 'arrowUp' : 'arrowDown',
        color: t.reason === 'open' ? NEUTRAL : t.r > 0 ? up : down,
        text: `${t.dir === 1 ? 'L' : 'S'} ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R`,
      }));

      // අන්තිම trade එකේ stop එක ගමන් කරපු මග — trail එක ඇහැට පේන්න.
      const lastTrade = r.trades[r.trades.length - 1];
      if (lastTrade) {
        const pts: LinePoint[] = [];
        let k = 0;
        for (let i = lastTrade.index; i <= lastTrade.exitIndex; i++) {
          while (k + 1 < lastTrade.stopPath.length && lastTrade.stopPath[k + 1].index <= i) k++;
          pts.push({ time: at(i), value: lastTrade.stopPath[k].price });
        }
        series.push({
          key: 'stopPath',
          label: 'Trailing stop',
          type: 'line',
          color: down,
          data: pts,
          lineWidth: 2,
        });
        segments.push({
          time1: at(lastTrade.index),
          time2: at(lastTrade.exitIndex),
          price: lastTrade.entry,
          color: lastTrade.dir === 1 ? up : down,
          width: 2,
          label: {
            text: `Entry > ${formatPrice(lastTrade.entry)}`,
            background: lastTrade.dir === 1 ? up : down,
            color: '#fff',
          },
        });
      }

      const s = r.stats;
      const profitable = s.expectancy > 0;
      const rows: IndicatorPanelRow[] = [
        { label: 'Trades', value: String(s.trades) },
        {
          label: 'Result',
          value: s.trades === 0 ? '-' : profitable ? 'PROFIT' : 'LOSS',
          valueColor: profitable ? up : down,
        },
        {
          label: 'Expectancy',
          value: s.trades ? `${s.expectancy >= 0 ? '+' : ''}${s.expectancy.toFixed(3)}R` : '-',
          valueColor: profitable ? up : down,
        },
        {
          label: 'Total',
          value: s.trades ? `${s.totalR >= 0 ? '+' : ''}${s.totalR.toFixed(1)}R` : '-',
          valueColor: s.totalR > 0 ? up : down,
        },
        { label: 'Win rate', value: s.trades ? `${s.winRate.toFixed(1)}%` : '-' },
        {
          label: 'Profit factor',
          value: s.trades ? (Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : 'inf') : '-',
          valueColor: s.profitFactor >= 1 ? up : down,
        },
        {
          label: 'Avg win / loss',
          value: s.trades ? `+${s.avgWinR.toFixed(2)}R / ${s.avgLossR.toFixed(2)}R` : '-',
        },
        {
          label: 'Max drawdown',
          value: s.trades ? `${s.maxDrawdownR.toFixed(1)}R` : '-',
          valueColor: TV.orange,
        },
        // Trail එකෙන් හොඳම චලනයෙන් කොච්චරක් අල්ලගත්තාද — trail එකේ ගුණය.
        {
          label: 'Trail capture',
          value: s.trades ? `${(s.captureRatio * 100).toFixed(0)}% of best move` : '-',
        },
        {
          label: 'Exits',
          value:
            `stop ${s.byReason.stop} / trail ${s.byReason.trail} / ` +
            `TP ${s.byReason.target} / flip ${s.byReason.opposite}`,
        },
      ];

      // ── Money management ────────────────────────────────────────────
      // ⚠️ MM එකෙන් ඍණ expectancy එකක් ධන කරන්නේ නෑ — ඒක ගණිතයෙන්ම
      //    බැහැ. ඒ නිසා මුලින්ම "viable ද" කියන එක පෙන්නනවා.
      if (on('money') && r.trades.length > 0) {
        const mm = computeMoneyManagement(
          r.trades.filter((t) => t.reason !== 'open').map((t) => ({ index: t.index, r: t.r })),
          {
            ...MONEY_DEFAULTS,
            startEquity: num(p, 'startEquity', 1000),
            riskPct: num(p, 'riskPct', 1),
            compound: on('compound'),
            maxDrawdownStopPct: num(p, 'ddStop', 0),
          },
        );
        const viable = mm.expectancyR > 0;
        rows.push({ label: '', value: '' });
        rows.push({
          label: 'money management',
          value: '',
          labelColor: NEUTRAL,
        });
        rows.push({
          label: '  Viable?',
          // Expectancy ඍණ නම් sizing එකකින් හරියන්නේ නෑ — ඒක කෙලින්ම කියනවා.
          value: viable ? 'yes (edge > 0)' : 'NO - edge is negative',
          valueColor: viable ? up : down,
        });
        rows.push({
          label: '  Equity',
          value:
            `${formatPrice(num(p, 'startEquity', 1000))} > ${formatPrice(mm.finalEquity)} ` +
            `(${mm.returnPct >= 0 ? '+' : ''}${mm.returnPct.toFixed(1)}%)`,
          valueColor: mm.returnPct > 0 ? up : down,
        });
        rows.push({
          label: '  Max drawdown',
          value: `${mm.maxDrawdownPct.toFixed(1)}%`,
          valueColor: TV.orange,
        });
        rows.push({
          label: '  Kelly (optimal risk)',
          value:
            mm.kellyPct > 0
              ? `${mm.kellyPct.toFixed(1)}%  (half ${mm.halfKellyPct.toFixed(1)}%)`
              : 'negative - do not size up',
          valueColor: mm.kellyPct > 0 ? up : down,
        });
        rows.push({
          label: '  Risk of ruin',
          value: `${mm.riskOfRuinPct.toFixed(1)}%  (to -${MONEY_DEFAULTS.ruinLevelPct}%)`,
          valueColor: mm.riskOfRuinPct > 10 ? down : mm.riskOfRuinPct > 1 ? TV.orange : up,
        });
        rows.push({
          label: '  Losses to ruin',
          value: `${Number.isFinite(mm.lossesToRuin) ? mm.lossesToRuin : '-'} in a row`,
        });
        if (mm.stoppedOut) {
          rows.push({
            label: '  Stopped',
            value: `drawdown limit hit after ${mm.tradesTaken} trades`,
            valueColor: down,
          });
        }
      }

      if (on('compare', 'Off') && r.comparison.length > 0) {
        rows.push({ label: '', value: '' });
        rows.push({
          label: 'exit method',
          value: 'expectancy / total / win',
          labelColor: NEUTRAL,
          valueColor: NEUTRAL,
        });
        for (const v of r.comparison) {
          const ok = v.stats.expectancy > 0;
          rows.push({
            label: `  ${v.name}`,
            value:
              v.stats.trades === 0
                ? '-'
                : `${v.stats.expectancy >= 0 ? '+' : ''}${v.stats.expectancy.toFixed(3)}R / ` +
                  `${v.stats.totalR >= 0 ? '+' : ''}${v.stats.totalR.toFixed(1)}R / ` +
                  `${v.stats.winRate.toFixed(0)}%`,
            valueColor: ok ? up : down,
          });
        }
      }

      return { series, segments, markers, panel: { position: 'Top Right', rows } };
    },
  },
  {
    // "Bollinger + RSI, Double Strategy v1.1" (© ChartArt, 2016).
    id: 'bbrsi',
    name: 'Bollinger + RSI Double Strategy | ChartArt',
    pane: 'main',
    params: [
      { key: 'rsiLength', label: 'RSI Period Length', default: 6, min: 1, max: 200 },
      { key: 'bbLength', label: 'Bollinger Period Length', default: 200, min: 1, max: 1000 },
      // මුල් script එකේ මේක ස්ථිර 2ක් (input එකක් නෙවෙයි) — ඒත් මාරු
      // කරන්න පුළුවන් නම් ප්‍රයෝජනවත්, ඒ නිසා දාලා තියෙනවා.
      { key: 'bbMult', label: 'Bollinger Std Dev', default: 2, min: 0.1, max: 10, step: 0.1 },
      { key: 'switch1', label: 'Enable Bar Color?', kind: 'switch', default: 'On' },
      { key: 'switch2', label: 'Enable Background Color?', kind: 'switch', default: 'On' },
    ],
    compute: (candles, p) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const r = computeBbRsi(candles, {
        rsiLength: num(p, 'rsiLength', 6),
        bbLength: num(p, 'bbLength', 200),
        bbMult: num(p, 'bbMult', 2),
      });

      // Pine v2 built-in colours.
      const AQUA = '#00FFFF';
      const SILVER = '#C0C0C0';
      const RED = '#FF0000';
      const GREEN = '#008000';

      const series: IndicatorSeries[] = [
        {
          key: 'basis',
          label: `BB Basis ${num(p, 'bbLength', 200)}`,
          type: 'line',
          color: AQUA,
          data: toPoints(candles, r.basis),
          lineWidth: 1,
        },
        {
          key: 'upper',
          label: 'BB Upper',
          type: 'line',
          color: SILVER,
          data: toPoints(candles, r.upper),
          lineWidth: 1,
          lastValueVisible: false,
        },
        {
          key: 'lower',
          label: 'BB Lower',
          type: 'line',
          color: SILVER,
          data: toPoints(candles, r.lower),
          lineWidth: 1,
          lastValueVisible: false,
        },
      ];

      // Pine `fill(p1, p2)` — band දෙක අතර. v2 එකේ default පාට නිල්-ඉරි.
      const bandPoints: BandPoint[] = [];
      for (let i = 0; i < candles.length; i++) {
        if (Number.isNaN(r.upper[i]) || Number.isNaN(r.lower[i])) continue;
        bandPoints.push({
          time: candles[i].time,
          upper: r.upper[i],
          lower: r.lower[i],
          color: withAlpha('#2196F3', 92),
        });
      }
      const bands: IndicatorBand[] = [{ key: 'bbFill', points: bandPoints }];

      // Pine `barcolor(TrendColor)` — TrendColor na නම් bar එක එහෙම්මම.
      const barColors = on('switch1')
        ? r.trendColor.map((c) =>
            c === null
              ? undefined
              : { body: c === 'red' ? RED : GREEN, wick: c === 'red' ? RED : GREEN },
          )
        : undefined;

      // Pine `bgcolor(TrendColor, transp=50)` — ඒ bar එකේ පසුබිම.
      // Background channel එකක් නෑ, ඒ නිසා උස box එකක්. (Boxes autoscale
      // එකට බලපාන්නේ නෑ — primitive එකක්.)
      const boxes: ChartBox[] = [];
      if (on('switch2') && candles.length > 0) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const c of candles) {
          if (c.low < lo) lo = c.low;
          if (c.high > hi) hi = c.high;
        }
        const span = hi - lo;
        for (let i = 0; i < candles.length; i++) {
          const tc = r.trendColor[i];
          if (!tc) continue;
          boxes.push({
            time1: candles[i].time,
            time2: candles[Math.min(i + 1, candles.length - 1)].time,
            top: hi + span,
            bottom: Math.max(lo - span, 0),
            fill: withAlpha(tc === 'red' ? RED : GREEN, 50),
          });
        }
      }

      // Strategy entries — Pine `comment="RSI_BB_L"` / `"RSI_BB_S"`.
      const markers: IndicatorMarker[] = r.signals.map((sig) => ({
        time: candles[sig.index].time,
        position: sig.dir === 1 ? 'belowBar' : 'aboveBar',
        shape: sig.dir === 1 ? 'arrowUp' : 'arrowDown',
        color: sig.dir === 1 ? '#2962FF' : RED,
        text: sig.dir === 1 ? 'RSI_BB_L' : 'RSI_BB_S',
      }));

      return { series, bands, boxes, markers, barColors };
    },
  },
  {
    // Bollinger + RSI signals + අදියර දෙකක exit (break-even → trail).
    // මුල් port එක ('bbrsi') පිරිසිදුව තියෙනවා; මේක ඒකට උඩින්.
    id: 'bbrsitrail',
    name: 'Bollinger + RSI - Break-even & Trail Backtest',
    pane: 'main',
    params: [
      {
        key: 'direction',
        label: 'Direction',
        kind: 'select',
        default: 'both',
        options: ['both', 'long', 'short'],
      },
      { key: 'initialSl', label: 'Initial SL xATR', default: 2, min: 0.2, max: 10, step: 0.1 },
      // ලාභය මෙච්චර R එකක් වුණාම SL එක entry එකට — ඊට පස්සේ පාඩුවක් නෑ.
      // Ratio mode එකේදී මේක ඕන නෑ (BE එක ඉබේම එනවා) — 0 තියෙන්නේ ඒකයි.
      { key: 'beAt', label: 'Break-even at xR (0 = off)', default: 0, min: 0, max: 5, step: 0.1 },
      { key: 'beBuffer', label: 'Break-even buffer xR', default: 0.1, min: 0, max: 1, step: 0.05 },
      { key: 'trailAfter', label: 'Start trailing at xR', default: 0.5, min: 0, max: 10, step: 0.1 },
      {
        key: 'trailMode',
        label: 'Trail method',
        kind: 'select',
        default: 'ratio',
        options: ['ratio', 'atr'],
      },
      // 0.5 = 1:2 — ලාභය +2R වුණාම SL එක +1R ට. Break-even එකත් ඉබේම.
      { key: 'trailRatio', label: 'Lock ratio (0.7 = keep 70%)', default: 0.7, min: 0, max: 0.95, step: 0.05 },
      // SL එක entry එක ළඟින්ම නතර වෙන එක නවත්තනවා — trail පටන් ගත්ත
      // ගමන් අඩුම තරමේ මෙච්චර R එකක් අගුළු දානවා.
      { key: 'minLock', label: 'Min locked profit xR', default: 0.5, min: 0, max: 5, step: 0.1 },
      { key: 'trailAtr', label: 'Trail xATR (atr mode)', default: 2, min: 0, max: 15, step: 0.5 },
      { key: 'takeProfit', label: 'Take Profit xR (0 = off)', default: 0, min: 0, max: 20, step: 0.5 },
      { key: 'exitOpp', label: 'Exit on opposite signal', kind: 'switch', default: 'On' },
      { key: 'atrLength', label: 'ATR Length', default: 14, min: 1, max: 200 },
      { key: 'fee', label: 'Fee % (per side)', default: 0.045, min: 0, max: 0.2, step: 0.001 },
      // Trail එක තද වෙන තරමට මේක තීරණාත්මක — විස්තර bbRsiTrail.ts එකේ.
      { key: 'slip', label: 'Slippage % (per side)', default: 0.02, min: 0, max: 0.5, step: 0.005 },
      { key: 'maxRisk', label: 'Max Risk %', default: 10, min: 0.5, max: 50, step: 0.5 },
      { key: 'rsiLength', label: 'RSI Period Length', default: 6, min: 1, max: 200 },
      { key: 'bbLength', label: 'Bollinger Period Length', default: 200, min: 1, max: 1000 },
      { key: 'bbMult', label: 'Bollinger Std Dev', default: 2, min: 0.1, max: 10, step: 0.1 },
      { key: 'showBands', label: 'Show Bollinger Bands', kind: 'switch', default: 'On' },
      // Default එකට off — මේක පේළි 7ක් ගන්නවා, සහ ඒක දිගටම බලාගෙන
      // ඉන්න දෙයක් නෙවෙයි (exit ක්‍රමයක් තෝරගන්නකම් විතරයි).
      { key: 'compare', label: 'Compare exit methods', kind: 'switch', default: 'Off' },
      // ── Binance-style position panel ──────────────────────────────
      {
        key: 'detail',
        label: 'Panel detail',
        kind: 'select',
        default: 'simple',
        options: ['simple', 'full'],
      },
      { key: 'position', label: 'Position Panel', kind: 'switch', default: 'On' },
      // `risk`   — trade එකකට අහිමි වෙන්න පුළුවන් උපරිමය $X (SL එකෙන්
      //            size එක හැදෙනවා). Leverage එක margin එකට විතරයි.
      // `margin` — trade එකකට $X ක් දානවා, notional = $X × leverage.
      //            පාඩුව හැම trade එකකම වෙනස් — liquidation එකත් තියෙනවා.
      {
        key: 'sizing',
        label: 'Sizing',
        kind: 'select',
        default: 'margin',
        options: ['risk', 'margin'],
      },
      { key: 'riskUsd', label: 'Risk per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'marginUsd', label: 'Margin per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'leverage', label: 'Leverage (x)', default: 10, min: 1, max: 125 },
    ],
    compute: (candles, p, ctx) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const signalOpts = {
        rsiLength: num(p, 'rsiLength', 6),
        bbLength: num(p, 'bbLength', 200),
        bbMult: num(p, 'bbMult', 2),
      };
      const r = computeBbRsiTrail(candles, {
        ...BB_TRAIL_DEFAULTS,
        signal: signalOpts,
        direction: str(p, 'direction', 'both') as 'both' | 'long' | 'short',
        atrLength: num(p, 'atrLength', 14),
        initialSlAtr: num(p, 'initialSl', 2),
        breakEvenAtR: num(p, 'beAt', 0),
        breakEvenBufferR: num(p, 'beBuffer', 0.1),
        trailAfterR: num(p, 'trailAfter', 0.5),
        trailMode: str(p, 'trailMode', 'ratio') as 'ratio' | 'atr',
        trailRatio: num(p, 'trailRatio', 0.7),
        minLockR: num(p, 'minLock', 0.5),
        trailAtr: num(p, 'trailAtr', 2),
        takeProfitR: num(p, 'takeProfit', 0),
        exitOnOpposite: on('exitOpp'),
        feePct: num(p, 'fee', 0.045),
        slippagePct: num(p, 'slip', 0.02),
        maxRiskPct: num(p, 'maxRisk', 10),
      });

      const up = '#26a69a';
      const view = buildTrailView(candles, r, p, ctx);
      const { segments, markers, positions, rows } = view;
      const series = view.series;
      void up;

      if (on('showBands')) {
        const bb = computeBbRsi(candles, signalOpts);
        series.unshift({
          key: 'lower', label: 'BB Lower', type: 'line', color: withAlpha('#C0C0C0', 55),
          data: toPoints(candles, bb.lower), lineWidth: 1, lastValueVisible: false,
        });
        series.unshift({
          key: 'upper', label: 'BB Upper', type: 'line', color: withAlpha('#C0C0C0', 55),
          data: toPoints(candles, bb.upper), lineWidth: 1, lastValueVisible: false,
        });
      }

      return {
        series,
        segments,
        markers,
        positions,
        panel: { position: 'Top Right', rows },
      };
    },
  },
  {
    id: 'snipertrail',
    name: 'Sniper V.02 - Break-even & Trail Backtest',
    pane: 'main',
    // Sniper එකේ ලකුණු 7 න් එකක් 5m RSI එකෙන් — dashboard එකට ඕන.
    // (Entry signal එක EMA cross එකෙන් විතරයි, ඒකට 5m ඕන නෑ.)
    mtf: '5m',
    params: [
      {
        key: 'direction',
        label: 'Direction',
        kind: 'select',
        default: 'both',
        options: ['both', 'long', 'short'],
      },
      { key: 'fast', label: 'Fast EMA', default: 9, min: 2, max: 200 },
      { key: 'mid', label: 'Mid EMA', default: 21, min: 2, max: 200 },
      { key: 'slow', label: 'Slow EMA', default: 50, min: 2, max: 400 },
      // Sniper dashboard එකේ ලකුණු ප්‍රතිශතය — මේකට වඩා වැඩි නම්
      // විතරයි trade එකක් ගන්නේ. 0 = හැම cross එකක්ම.
      { key: 'minScore', label: 'Min score % (0 = off)', default: 0, min: 0, max: 100, step: 1 },
      { key: 'initialSl', label: 'Initial SL xATR', default: 2, min: 0.2, max: 10, step: 0.1 },
      { key: 'beAt', label: 'Break-even at xR (0 = off)', default: 0, min: 0, max: 5, step: 0.1 },
      { key: 'beBuffer', label: 'Break-even buffer xR', default: 0.1, min: 0, max: 1, step: 0.05 },
      { key: 'trailAfter', label: 'Start trailing at xR', default: 0.5, min: 0, max: 10, step: 0.1 },
      {
        key: 'trailMode',
        label: 'Trail method',
        kind: 'select',
        default: 'ratio',
        options: ['ratio', 'atr'],
      },
      { key: 'trailRatio', label: 'Lock ratio (0.7 = keep 70%)', default: 0.7, min: 0, max: 0.95, step: 0.05 },
      { key: 'minLock', label: 'Min locked profit xR', default: 0.5, min: 0, max: 5, step: 0.1 },
      { key: 'trailAtr', label: 'Trail xATR (atr mode)', default: 2, min: 0, max: 15, step: 0.5 },
      { key: 'takeProfit', label: 'Take Profit xR (0 = off)', default: 0, min: 0, max: 20, step: 0.5 },
      { key: 'exitOpp', label: 'Exit on opposite signal', kind: 'switch', default: 'On' },
      { key: 'atrLength', label: 'ATR Length', default: 14, min: 1, max: 200 },
      { key: 'fee', label: 'Fee % (per side)', default: 0.045, min: 0, max: 0.2, step: 0.001 },
      { key: 'slip', label: 'Slippage % (per side)', default: 0.02, min: 0, max: 0.5, step: 0.005 },
      { key: 'maxRisk', label: 'Max Risk %', default: 10, min: 0.5, max: 50, step: 0.5 },
      { key: 'showEmas', label: 'Show EMA ribbon', kind: 'switch', default: 'On' },
      { key: 'compare', label: 'Compare exit methods', kind: 'switch', default: 'Off' },
      {
        key: 'detail',
        label: 'Panel detail',
        kind: 'select',
        default: 'simple',
        options: ['simple', 'full'],
      },
      { key: 'position', label: 'Position Panel', kind: 'switch', default: 'On' },
      {
        key: 'sizing',
        label: 'Sizing',
        kind: 'select',
        default: 'margin',
        options: ['risk', 'margin'],
      },
      { key: 'riskUsd', label: 'Risk per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'marginUsd', label: 'Margin per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'leverage', label: 'Leverage (x)', default: 10, min: 1, max: 125 },
    ],
    compute: (candles, p, ctx) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      // Chart එකේදී 5m candles එනවා; Group PNL / Tune වලදී නෑ. Entry
      // signal එකට ඒක ඕන නෑ (EMA cross එකයි), ඒ නිසා දෙකේදීම signals
      // එකයි — `minScore` පෙරහනට විතරයි වෙනස.
      const htf = ctx.mtf['5m'] ?? [];
      const rsiHigherTf = alignHigherTimeframe(candles, htf, rsiOfPreviousClose(htf, 14));
      const signalOpts = {
        fast: num(p, 'fast', 9),
        mid: num(p, 'mid', 21),
        slow: num(p, 'slow', 50),
        rsiHigherTf,
      };

      const r = computeSniperTrail(candles, {
        ...SNIPER_TRAIL_DEFAULTS,
        signal: signalOpts,
        minScorePct: num(p, 'minScore', 0),
        direction: str(p, 'direction', 'both') as 'both' | 'long' | 'short',
        atrLength: num(p, 'atrLength', 14),
        initialSlAtr: num(p, 'initialSl', 2),
        breakEvenAtR: num(p, 'beAt', 0),
        breakEvenBufferR: num(p, 'beBuffer', 0.1),
        trailAfterR: num(p, 'trailAfter', 0.5),
        trailMode: str(p, 'trailMode', 'ratio') as 'ratio' | 'atr',
        trailRatio: num(p, 'trailRatio', 0.7),
        minLockR: num(p, 'minLock', 0.5),
        trailAtr: num(p, 'trailAtr', 2),
        takeProfitR: num(p, 'takeProfit', 0),
        exitOnOpposite: on('exitOpp'),
        feePct: num(p, 'fee', 0.045),
        slippagePct: num(p, 'slip', 0.02),
        maxRiskPct: num(p, 'maxRisk', 10),
      });

      const view = buildTrailView(candles, r, p, ctx);
      const series = view.series;

      if (on('showEmas')) {
        const sn = computeSniper(candles, signalOpts);
        // Ribbon එක යටින් — SL path එක උඩින් පේන්න ඕන.
        series.unshift({
          key: 'emaSlow', label: `EMA ${signalOpts.slow}`, type: 'line',
          color: withAlpha('#787b86', 70), data: toPoints(candles, sn.emaSlow),
          lineWidth: 1, lastValueVisible: false,
        });
        series.unshift({
          key: 'emaMid', label: `EMA ${signalOpts.mid}`, type: 'line',
          color: withAlpha('#ef5350', 70), data: toPoints(candles, sn.emaMid),
          lineWidth: 1, lastValueVisible: false,
        });
        series.unshift({
          key: 'emaFast', label: `EMA ${signalOpts.fast}`, type: 'line',
          color: withAlpha('#26a69a', 70), data: toPoints(candles, sn.emaFast),
          lineWidth: 1, lastValueVisible: false,
        });
      }

      return {
        series,
        segments: view.segments,
        markers: view.markers,
        positions: view.positions,
        panel: { position: 'Top Right', rows: view.rows },
      };
    },
  },
  {
    id: 'macdsmatrail2',
    name: 'MACD + SMA 200 - Break-even & Trail Backtest',
    pane: 'main',
    params: [
      {
        key: 'direction',
        label: 'Direction',
        kind: 'select',
        default: 'both',
        options: ['both', 'long', 'short'],
      },
      { key: 'fastLength', label: 'MACD Fast Length', default: 12, min: 1, max: 200 },
      { key: 'slowLength', label: 'MACD Slow Length', default: 26, min: 1, max: 400 },
      { key: 'signalLength', label: 'MACD Signal Length', default: 9, min: 1, max: 100 },
      { key: 'veryslowLength', label: 'SMA Length', default: 200, min: 1, max: 1000 },
      // ChartArt strategy එකේ `cancel` බ්ලොක් එක — SMA දෙක විරුද්ධ
      // පැත්තට තියෙනකොට order එක අවලංගු වෙනවා. Off කළොත් signals වැඩියි.
      { key: 'respectCancel', label: 'Respect cancel rule', kind: 'switch', default: 'On' },
      { key: 'initialSl', label: 'Initial SL xATR', default: 2, min: 0.2, max: 10, step: 0.1 },
      { key: 'beAt', label: 'Break-even at xR (0 = off)', default: 0, min: 0, max: 5, step: 0.1 },
      { key: 'beBuffer', label: 'Break-even buffer xR', default: 0.1, min: 0, max: 1, step: 0.05 },
      { key: 'trailAfter', label: 'Start trailing at xR', default: 0.5, min: 0, max: 10, step: 0.1 },
      {
        key: 'trailMode',
        label: 'Trail method',
        kind: 'select',
        default: 'ratio',
        options: ['ratio', 'atr'],
      },
      { key: 'trailRatio', label: 'Lock ratio (0.7 = keep 70%)', default: 0.7, min: 0, max: 0.95, step: 0.05 },
      { key: 'minLock', label: 'Min locked profit xR', default: 0.5, min: 0, max: 5, step: 0.1 },
      { key: 'trailAtr', label: 'Trail xATR (atr mode)', default: 2, min: 0, max: 15, step: 0.5 },
      { key: 'takeProfit', label: 'Take Profit xR (0 = off)', default: 0, min: 0, max: 20, step: 0.5 },
      { key: 'exitOpp', label: 'Exit on opposite signal', kind: 'switch', default: 'On' },
      { key: 'atrLength', label: 'ATR Length', default: 14, min: 1, max: 200 },
      { key: 'fee', label: 'Fee % (per side)', default: 0.045, min: 0, max: 0.2, step: 0.001 },
      { key: 'slip', label: 'Slippage % (per side)', default: 0.02, min: 0, max: 0.5, step: 0.005 },
      { key: 'maxRisk', label: 'Max Risk %', default: 10, min: 0.5, max: 50, step: 0.5 },
      { key: 'showMa', label: 'Show SMA 200', kind: 'switch', default: 'On' },
      { key: 'compare', label: 'Compare exit methods', kind: 'switch', default: 'Off' },
      {
        key: 'detail',
        label: 'Panel detail',
        kind: 'select',
        default: 'simple',
        options: ['simple', 'full'],
      },
      { key: 'position', label: 'Position Panel', kind: 'switch', default: 'On' },
      {
        key: 'sizing',
        label: 'Sizing',
        kind: 'select',
        default: 'margin',
        options: ['risk', 'margin'],
      },
      { key: 'riskUsd', label: 'Risk per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'marginUsd', label: 'Margin per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'leverage', label: 'Leverage (x)', default: 10, min: 1, max: 125 },
    ],
    compute: (candles, p, ctx) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const signalOpts = {
        ...MACD_SIGNAL_DEFAULTS,
        fastLength: num(p, 'fastLength', 12),
        slowLength: num(p, 'slowLength', 26),
        signalLength: num(p, 'signalLength', 9),
        veryslowLength: num(p, 'veryslowLength', 200),
      };

      const r = computeMacdSmaTrail2(candles, {
        ...MACD_TRAIL2_DEFAULTS,
        signal: signalOpts,
        respectCancel: on('respectCancel'),
        direction: str(p, 'direction', 'both') as 'both' | 'long' | 'short',
        atrLength: num(p, 'atrLength', 14),
        initialSlAtr: num(p, 'initialSl', 2),
        breakEvenAtR: num(p, 'beAt', 0),
        breakEvenBufferR: num(p, 'beBuffer', 0.1),
        trailAfterR: num(p, 'trailAfter', 0.5),
        trailMode: str(p, 'trailMode', 'ratio') as 'ratio' | 'atr',
        trailRatio: num(p, 'trailRatio', 0.7),
        minLockR: num(p, 'minLock', 0.5),
        trailAtr: num(p, 'trailAtr', 2),
        takeProfitR: num(p, 'takeProfit', 0),
        exitOnOpposite: on('exitOpp'),
        feePct: num(p, 'fee', 0.045),
        slippagePct: num(p, 'slip', 0.02),
        maxRiskPct: num(p, 'maxRisk', 10),
      });

      const view = buildTrailView(candles, r, p, ctx);
      const series = view.series;

      if (on('showMa')) {
        const ms = computeMacdSma(candles, signalOpts);
        // SMA 200 — trend පෙරහන. SL path එක උඩින් පේන්න ඕන නිසා යටට.
        series.unshift({
          key: 'sma200',
          label: `SMA ${signalOpts.veryslowLength}`,
          type: 'line',
          color: withAlpha('#2962ff', 75),
          data: toPoints(candles, ms.veryslowMA),
          lineWidth: 2,
          lastValueVisible: false,
        });
      }

      return {
        series,
        segments: view.segments,
        markers: view.markers,
        positions: view.positions,
        panel: { position: 'Top Right', rows: view.rows },
      };
    },
  },
  {
    id: 'breakouttrail',
    name: 'Breakout Targets - Break-even & Trail Backtest',
    pane: 'main',
    params: [
      {
        key: 'direction',
        label: 'Direction',
        kind: 'select',
        default: 'both',
        options: ['both', 'long', 'short'],
      },
      { key: 'length', label: 'Range Length', default: 99, min: 5, max: 500 },
      { key: 'overlap', label: 'Prevent Overlap', kind: 'switch', default: 'On' },
      { key: 'minAdx', label: 'Min ADX (0 = off)', default: 0, min: 0, max: 60, step: 1 },
      { key: 'adxLength', label: 'ADX Length', default: 14, min: 2, max: 100 },
      // AlgoAlpha එකේ SL එක 5×ATR — අනිත් backtest වල 2×.
      { key: 'initialSl', label: 'Initial SL xATR', default: 5, min: 0.2, max: 20, step: 0.1 },
      { key: 'beAt', label: 'Break-even at xR (0 = off)', default: 0, min: 0, max: 5, step: 0.1 },
      { key: 'beBuffer', label: 'Break-even buffer xR', default: 0.1, min: 0, max: 1, step: 0.05 },
      { key: 'trailAfter', label: 'Start trailing at xR', default: 0.5, min: 0, max: 10, step: 0.1 },
      {
        key: 'trailMode',
        label: 'Trail method',
        kind: 'select',
        default: 'ratio',
        options: ['ratio', 'atr'],
      },
      { key: 'trailRatio', label: 'Lock ratio (0.7 = keep 70%)', default: 0.7, min: 0, max: 0.95, step: 0.05 },
      { key: 'minLock', label: 'Min locked profit xR', default: 0.5, min: 0, max: 5, step: 0.1 },
      { key: 'trailAtr', label: 'Trail xATR (atr mode)', default: 2, min: 0, max: 15, step: 0.5 },
      // AlgoAlpha එකේ TP3 = 1.5R. 0 = trail එකෙන් විතරයි.
      { key: 'takeProfit', label: 'Take Profit xR (0 = off)', default: 0, min: 0, max: 20, step: 0.5 },
      { key: 'exitOpp', label: 'Exit on opposite signal', kind: 'switch', default: 'On' },
      { key: 'atrLength', label: 'ATR Length', default: 14, min: 1, max: 200 },
      { key: 'fee', label: 'Fee % (per side)', default: 0.045, min: 0, max: 0.2, step: 0.001 },
      { key: 'slip', label: 'Slippage % (per side)', default: 0.02, min: 0, max: 0.5, step: 0.005 },
      { key: 'maxRisk', label: 'Max Risk %', default: 10, min: 0.5, max: 50, step: 0.5 },
      { key: 'showBoxes', label: 'Show range boxes', kind: 'switch', default: 'On' },
      { key: 'compare', label: 'Compare exit methods', kind: 'switch', default: 'Off' },
      {
        key: 'detail',
        label: 'Panel detail',
        kind: 'select',
        default: 'simple',
        options: ['simple', 'full'],
      },
      { key: 'position', label: 'Position Panel', kind: 'switch', default: 'On' },
      {
        key: 'sizing',
        label: 'Sizing',
        kind: 'select',
        default: 'margin',
        options: ['risk', 'margin'],
      },
      { key: 'riskUsd', label: 'Risk per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'marginUsd', label: 'Margin per trade ($)', default: 6, min: 1, max: 100000 },
      { key: 'leverage', label: 'Leverage (x)', default: 10, min: 1, max: 125 },
    ],
    compute: (candles, p, ctx) => {
      const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const signalOpts = {
        ...BREAKOUT_SIGNAL_DEFAULTS,
        length: num(p, 'length', 99),
        preventOverlap: on('overlap'),
      };

      const r = computeBreakoutTrail(candles, {
        ...BREAKOUT_TRAIL_DEFAULTS,
        signal: signalOpts,
        minAdx: num(p, 'minAdx', 0),
        adxLength: num(p, 'adxLength', 14),
        direction: str(p, 'direction', 'both') as 'both' | 'long' | 'short',
        atrLength: num(p, 'atrLength', 14),
        initialSlAtr: num(p, 'initialSl', 5),
        breakEvenAtR: num(p, 'beAt', 0),
        breakEvenBufferR: num(p, 'beBuffer', 0.1),
        trailAfterR: num(p, 'trailAfter', 0.5),
        trailMode: str(p, 'trailMode', 'ratio') as 'ratio' | 'atr',
        trailRatio: num(p, 'trailRatio', 0.7),
        minLockR: num(p, 'minLock', 0.5),
        trailAtr: num(p, 'trailAtr', 2),
        takeProfitR: num(p, 'takeProfit', 0),
        exitOnOpposite: on('exitOpp'),
        feePct: num(p, 'fee', 0.045),
        slippagePct: num(p, 'slip', 0.02),
        maxRiskPct: num(p, 'maxRisk', 10),
      });

      const view = buildTrailView(candles, r, p, ctx);

      // Range boxes — AlgoAlpha එකේ වගේ, entry එක ආවේ කොහෙන්ද පේන්න.
      const boxes: ChartBox[] = [];
      if (on('showBoxes')) {
        const b = computeBreakoutTargets(candles, signalOpts);
        for (const box of b.boxes) {
          boxes.push({
            time1: candles[box.startIndex].time,
            time2: candles[Math.min(box.endIndex, candles.length - 1)].time,
            top: box.top,
            bottom: box.bottom,
            fill: withAlpha('#787b86', 12),
            border: withAlpha('#787b86', 45),
          });
        }
      }

      return {
        series: view.series,
        segments: view.segments,
        markers: view.markers,
        positions: view.positions,
        boxes,
        panel: { position: 'Top Right', rows: view.rows },
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

/**
 * Trail backtest එකක **chart + panel** කොටස.
 *
 * Bollinger+RSI එකයි Sniper එකයි දෙකටම එකම දේවල් ඕන: entry markers,
 * SL එකේ පඩිපෙළ, entry/SL රේඛා, position history, සහ panel එක. Signals
 * හදන විදිහ විතරයි වෙනස — ඒ නිසා මේක එක තැනක තියාගන්නවා.
 */
function buildTrailView(
  candles: Candle[],
  r: BbTrailResult,
  p: Params,
  ctx: { symbol: string; interval: string },
): {
  series: IndicatorSeries[];
  segments: ChartSegment[];
  markers: IndicatorMarker[];
  positions: PositionRecord[];
  rows: IndicatorPanelRow[];
} {
  const on = (key: string, fallback = 'On') => str(p, key, fallback) === 'On';
      const up = '#26a69a';
      const down = '#ef5350';
      const at = (index: number) => candles[index].time;
      const series: IndicatorSeries[] = [];
      const segments: ChartSegment[] = [];

      // Entry markers — ප්‍රතිඵලය R වලින්, exit වුණේ මොකෙන්ද පාටින්.
      const markers: IndicatorMarker[] = r.trades.map((t) => ({
        time: at(t.index),
        position: t.dir === 1 ? 'belowBar' : 'aboveBar',
        shape: t.dir === 1 ? 'arrowUp' : 'arrowDown',
        // breakeven = තැඹිලි (පාඩුවක් නෑ), trail/target = කොළ, stop = රතු
        color:
          t.reason === 'open' ? NEUTRAL
          : t.reason === 'breakeven' ? TV.orange
          : t.r > 0 ? up : down,
        text: `${t.dir === 1 ? 'L' : 'S'} ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R`,
      }));

      // ── අන්තිම trade එක විස්තරාත්මකව ────────────────────────────────
      // Replay එකේදී මේක **දැන් දුවන** trade එක — cursor එක ඉස්සරහට
      // යනකොට SL එකේ පඩිපෙළ එකින් එක හැදෙනවා. අදියර තුන වෙන වෙනම
      // පාටින් පේනවා:
      //     රතු    = මුල් SL එක      (පාඩුවක් වෙන්න පුළුවන්)
      //     තැඹිලි = break-even එකේ  (පාඩුවක් නෑ)
      //     කොළ    = trail වෙනවා     (ලාභය අගුළු දාලා)
      const lastTrade = r.trades[r.trades.length - 1];
      if (lastTrade) {
        const t = lastTrade;
        const beAt = t.breakEvenIndex;
        const trailAt = t.trailStartIndex;
        const stageColor = (i: number) =>
          trailAt >= 0 && i >= trailAt ? up : beAt >= 0 && i >= beAt ? TV.orange : down;

        const pts: LinePoint[] = [];
        let k = 0;
        for (let i = t.index; i <= t.exitIndex; i++) {
          while (k + 1 < t.stopPath.length && t.stopPath[k + 1].index <= i) k++;
          pts.push({ time: at(i), value: t.stopPath[k].price, color: stageColor(i) });
        }
        series.push({
          key: 'stopPath',
          label: 'Stop: red > orange (BE) > green (trail)',
          type: 'line',
          color: down,
          data: pts,
          lineWidth: 3,
        });

        segments.push({
          time1: at(t.index),
          time2: at(t.exitIndex),
          price: t.entry,
          color: t.dir === 1 ? up : down,
          width: 2,
          label: {
            text: `${t.dir === 1 ? 'LONG' : 'SHORT'} entry > ${formatPrice(t.entry)}`,
            background: t.dir === 1 ? up : down,
            color: '#fff',
          },
        });

        // මුල් SL එක තිත් රේඛාවක් විදිහට තියාගන්නවා — SL එක කොච්චර
        // දුරක් ගමන් කළාද කියලා ඇහැටම පේන්න.
        segments.push({
          time1: at(t.index),
          time2: at(t.exitIndex),
          price: t.initialSl,
          color: withAlpha(down, 60),
          width: 1,
          dashed: true,
          label: {
            text: `initial SL > ${formatPrice(t.initialSl)}`,
            background: withAlpha(down, 60),
            color: '#fff',
          },
        });

        // දැන් තියෙන SL එක — replay එකේදී මේක ඉස්සරහට ඇදෙනවා.
        const riskNow = Math.abs(t.entry - t.initialSl);
        const lockedR = ((t.finalSl - t.entry) * t.dir) / riskNow;
        const stageName = t.startedTrailing
          ? 'trailing'
          : t.reachedBreakEven
            ? 'break-even'
            : 'initial';
        segments.push({
          time1: at(t.exitIndex),
          time2: at(t.exitIndex),
          price: t.finalSl,
          color: stageColor(t.exitIndex),
          width: 2,
          label: {
            text:
              `SL (${stageName}) > ${formatPrice(t.finalSl)}  ` +
              `[${lockedR >= 0 ? '+' : ''}${lockedR.toFixed(2)}R locked]`,
            background: stageColor(t.exitIndex),
            color: '#fff',
          },
        });

        // අදියර මාරු වුණු bars — chart එකේ සලකුණු.
        if (beAt >= 0) {
          markers.push({
            time: at(beAt),
            position: t.dir === 1 ? 'belowBar' : 'aboveBar',
            shape: 'circle',
            color: TV.orange,
            text: 'SL > BE',
          });
        }
        if (trailAt >= 0) {
          markers.push({
            time: at(trailAt),
            position: t.dir === 1 ? 'belowBar' : 'aboveBar',
            shape: 'circle',
            color: up,
            text: 'trail on',
          });
        }
      }

      const s = r.stats;
      const profitable = s.expectancy > 0;
      const rows: IndicatorPanelRow[] = [];
      const riskUsd = num(p, 'riskUsd', 6);
      const leverage = num(p, 'leverage', 10);
      const posOpts = {
        ...POSITION_DEFAULTS,
        sizing: str(p, 'sizing', 'risk') as 'risk' | 'margin',
        riskUsd,
        marginUsd: num(p, 'marginUsd', 6),
        leverage,
      };
      const feePct = num(p, 'fee', 0.045);
      const slipPct = num(p, 'slip', 0.02);
      const byMargin = posOpts.sizing === 'margin';

      // ඩොලර් එකතුව — `risk` mode එකේදී මේක totalR × riskUsd ට සමානයි,
      // ඒත් `margin` mode එකේදී trade එකකට size එක වෙනස් නිසා එකින් එක
      // ගණන් හදන්නම ඕන (liquidation එකත් එක්කම).
      let netUsd = 0;
      let grossUsd = 0;
      let feesUsd = 0;
      let liquidations = 0;
      let usdWins = 0;
      let usdGross = 0;
      let usdLoss = 0;
      let usdTrades = 0;
      for (const t of r.trades) {
        if (t.reason === 'open') continue;
        const tu = tradeUsd(t.dir, t.entry, t.initialSl, t.exitPrice, posOpts, feePct, slipPct);
        if (!tu) continue;
        usdTrades++;
        netUsd += tu.netUsd;
        grossUsd += tu.grossUsd;
        feesUsd += tu.costUsd;
        if (tu.liquidated) liquidations++;
        if (tu.netUsd > 0) { usdWins++; usdGross += tu.netUsd; } else usdLoss += -tu.netUsd;
      }
      const usdPf = usdLoss > 0 ? usdGross / usdLoss : Infinity;
      // `simple` — ඩොලර් වලින්, සරල වචන වලින්. `full` — R, PF, expectancy
      // වගේ ඔක්කොම. Default එක simple.
      const simple = str(p, 'detail', 'simple') !== 'full';

      // ── දැන් තියෙන position එක ──────────────────────────────────────
      if (lastTrade) {
        const t = lastTrade;
        const riskNow = Math.abs(t.entry - t.initialSl);
        const lastClose = candles[candles.length - 1].close;
        const liveR = ((lastClose - t.entry) * t.dir) / riskNow;
        const lockedR = ((t.finalSl - t.entry) * t.dir) / riskNow;
        const live = t.reason === 'open';
        const pv = on('position')
          ? positionView(t.dir, t.entry, t.initialSl, t.finalSl, lastClose, posOpts)
          : null;
        // SL එක entry එක පනිලාද — ඒක තමයි වැදගත්ම දේ.
        const locked = lockedR > 0;
        const stageText = locked
          ? 'profit locked in'
          : t.reachedBreakEven
            ? 'no loss (break-even)'
            : 'still at risk';
        const stageColour = locked ? up : t.reachedBreakEven ? TV.orange : down;

        rows.push({
          label: live ? 'POSITION' : 'LAST TRADE',
          value: `${t.dir === 1 ? 'LONG' : 'SHORT'}${pv ? ` ${leverage}x` : ''}`,
          labelColor: live ? up : NEUTRAL,
          valueColor: t.dir === 1 ? up : down,
        });
        rows.push({ label: '  Stage', value: stageText, valueColor: stageColour });
        rows.push({
          label: '  Entry / Now',
          value: `${formatPrice(t.entry)} / ${formatPrice(lastClose)}`,
        });
        // ⭐ ඔබ ඉල්ලපු දේ: SL එක වැදුනොත් මොකද වෙන්නේ, ඩොලර් වලින්.
        rows.push({
          label: '  Stop',
          value:
            `${formatPrice(t.finalSl)}` +
            (pv ? `  →  ${formatUsd(pv.stopUsd)}` : `  (${lockedR >= 0 ? '+' : ''}${lockedR.toFixed(2)}R)`),
          valueColor: (pv ? pv.stopUsd : lockedR) >= 0 ? up : down,
        });
        const closedUsd = live
          ? null
          : tradeUsd(t.dir, t.entry, t.initialSl, t.exitPrice, posOpts, feePct, slipPct);
        rows.push({
          label: live ? '  Profit now' : '  Result',
          value: pv
            ? formatUsd(live ? pv.unrealizedUsd : (closedUsd?.netUsd ?? t.r * riskUsd)) +
              (closedUsd?.liquidated ? '  LIQUIDATED' : '')
            : `${(live ? liveR : t.r) >= 0 ? '+' : ''}${(live ? liveR : t.r).toFixed(2)}R`,
          valueColor: (live ? liveR : (closedUsd?.netUsd ?? t.r)) >= 0 ? up : down,
        });

        if (!simple) {
          if (pv) {
            rows.push({
              label: '  Size',
              value: `${formatSize(pv.size)}  ($${pv.notionalUsd.toFixed(2)})`,
            });
            rows.push({
              label: '  Liq. Price',
              value:
                `${formatPrice(pv.liquidationPrice)}  ` +
                `(${pv.liquidationDistancePct.toFixed(1)}% away)`,
              valueColor: pv.liquidationDistancePct < 10 ? down : NEUTRAL,
            });
            rows.push({ label: '  Margin', value: `$${pv.marginUsd.toFixed(2)}` });
          }
          rows.push({
            label: '  In R',
            value:
              `${(live ? liveR : t.r) >= 0 ? '+' : ''}${(live ? liveR : t.r).toFixed(2)}R now, ` +
              `${lockedR >= 0 ? '+' : ''}${lockedR.toFixed(2)}R locked`,
          });
          rows.push({
            label: '  Best so far',
            value: `${t.maxFavorableR >= 0 ? '+' : ''}${t.maxFavorableR.toFixed(2)}R`,
          });
        }
        rows.push({ label: '', value: '' });
      }

      // ── ප්‍රතිඵලය ────────────────────────────────────────────────────
      if (simple) {
        rows.push({
          label: 'RESULT',
          value: `${s.trades} trades`,
          labelColor: NEUTRAL,
        });
        // Gross − fees = booked. Fees කොපමණ කෑවාද කියන එක වෙන්ම පේන්න
        // ඕන — ඒක තමයි මේ strategy එකේ ලොකුම සතුරා.
        rows.push({
          label: '  Price move gave',
          value: usdTrades ? formatUsd(grossUsd) : '-',
          valueColor: grossUsd > 0 ? up : down,
        });
        rows.push({
          label: '  Fees took',
          value: usdTrades ? `-$${feesUsd.toFixed(2)}` : '-',
          valueColor: TV.orange,
        });
        rows.push({
          label: byMargin
            ? `  = booked ($${posOpts.marginUsd} x${leverage} each)`
            : `  = booked ($${riskUsd} risk each)`,
          value: usdTrades ? formatUsd(netUsd) : '-',
          valueColor: netUsd > 0 ? up : down,
        });
        rows.push({
          label: '  Won',
          value: usdTrades
            ? `${usdWins} of ${usdTrades}  (${((100 * usdWins) / usdTrades).toFixed(0)}%)`
            : '-',
        });
        if (byMargin) {
          rows.push({
            label: '  Liquidated',
            value: `${liquidations}  (-$${(liquidations * posOpts.marginUsd).toFixed(0)})`,
            valueColor: liquidations > 0 ? down : NEUTRAL,
          });
        }
        // Exit එක වුණේ මොකෙන්ද — සරල වචන වලින්.
        rows.push({
          label: '  Stopped at a loss',
          value: String(s.byReason.stop),
          valueColor: s.byReason.stop > 0 ? down : NEUTRAL,
        });
        rows.push({
          label: '  Closed with profit',
          value: String(s.byReason.trail + s.byReason.target),
          valueColor: up,
        });
        rows.push({
          label: '  Closed at break-even',
          value: String(s.byReason.breakeven),
          valueColor: TV.orange,
        });
      } else {
        rows.push(
          { label: 'Trades', value: String(s.trades) },
          {
            label: 'Result',
            value: s.trades === 0 ? '-' : profitable ? 'PROFIT' : 'LOSS',
            valueColor: profitable ? up : down,
          },
          {
            label: 'Expectancy',
            value: s.trades ? `${s.expectancy >= 0 ? '+' : ''}${s.expectancy.toFixed(3)}R` : '-',
            valueColor: profitable ? up : down,
          },
          {
            label: 'Total',
            value: s.trades ? `${s.totalR >= 0 ? '+' : ''}${s.totalR.toFixed(1)}R` : '-',
            valueColor: s.totalR > 0 ? up : down,
          },
          {
            label: 'Gross (price move)',
            value: usdTrades ? formatUsd(grossUsd) : '-',
            valueColor: grossUsd > 0 ? up : down,
          },
          {
            label: 'Fees + slippage',
            value: usdTrades ? `-$${feesUsd.toFixed(2)}` : '-',
            valueColor: TV.orange,
          },
          {
            label: byMargin
              ? `= Booked ($${posOpts.marginUsd} x${leverage})`
              : `= Booked ($${riskUsd} risk)`,
            value: usdTrades ? formatUsd(netUsd) : '-',
            valueColor: netUsd > 0 ? up : down,
          },
          {
            label: 'PF in dollars',
            value: usdTrades ? (Number.isFinite(usdPf) ? usdPf.toFixed(2) : 'inf') : '-',
            valueColor: usdPf >= 1 ? up : down,
          },
          {
            label: 'Liquidations',
            value: byMargin
              ? `${liquidations} of ${usdTrades}  (-$${(liquidations * posOpts.marginUsd).toFixed(0)})`
              : 'n/a (risk sizing)',
            valueColor: liquidations > 0 ? down : NEUTRAL,
          },
          { label: 'Win rate', value: s.trades ? `${s.winRate.toFixed(1)}%` : '-' },
          {
            label: 'Profit factor',
            value: s.trades
              ? Number.isFinite(s.profitFactor)
                ? s.profitFactor.toFixed(2)
                : 'inf'
              : '-',
            valueColor: s.profitFactor >= 1 ? up : down,
          },
          {
            label: 'Avg win / loss',
            value: s.trades ? `+${s.avgWinR.toFixed(2)}R / ${s.avgLossR.toFixed(2)}R` : '-',
          },
          {
            label: 'Max drawdown',
            value: s.trades ? `${s.maxDrawdownR.toFixed(1)}R` : '-',
            valueColor: TV.orange,
          },
          {
            label: 'Cost / trade',
            value: `fee ${num(p, 'fee', 0.045)}% + slip ${num(p, 'slip', 0.02)}%`,
            valueColor: TV.orange,
          },
          { label: '', value: '' },
          { label: 'exit breakdown', value: 'count', labelColor: NEUTRAL, valueColor: NEUTRAL },
          { label: '  Stop (loss)', value: String(s.byReason.stop), valueColor: down },
          {
            label: '  Break-even (no loss)',
            value: String(s.byReason.breakeven),
            valueColor: TV.orange,
          },
          { label: '  Trail (locked profit)', value: String(s.byReason.trail), valueColor: up },
          { label: '  Target / flip', value: `${s.byReason.target} / ${s.byReason.opposite}` },
          {
            label: '  Trail capture',
            value: s.trades ? `${(s.captureRatio * 100).toFixed(0)}% of best move` : '-',
          },
        );

        if (r.longStats.trades > 0 || r.shortStats.trades > 0) {
          rows.push({ label: '', value: '' });
          rows.push({
            label: 'side',
            value: 'PF / expectancy / trades',
            labelColor: NEUTRAL,
            valueColor: NEUTRAL,
          });
          const side = (name: string, st: typeof s) => {
            if (st.trades === 0) return;
            rows.push({
              label: `  ${name}`,
              value:
                `${Number.isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : 'inf'} / ` +
                `${st.expectancy >= 0 ? '+' : ''}${st.expectancy.toFixed(3)}R / ${st.trades}`,
              valueColor: st.expectancy > 0 ? up : down,
            });
          };
          side('Long', r.longStats);
          side('Short', r.shortStats);
        }

        if (on('compare', 'Off') && r.comparison.length > 0) {
          rows.push({ label: '', value: '' });
          rows.push({
            label: 'exit method',
            value: 'PF / expectancy / trades',
            labelColor: NEUTRAL,
            valueColor: NEUTRAL,
          });
          for (const v of r.comparison) {
            rows.push({
              label: `  ${v.name}`,
              value:
                v.stats.trades === 0
                  ? '-'
                  : `${Number.isFinite(v.stats.profitFactor) ? v.stats.profitFactor.toFixed(2) : 'inf'} / ` +
                    `${v.stats.expectancy >= 0 ? '+' : ''}${v.stats.expectancy.toFixed(3)}R / ${v.stats.trades}`,
              valueColor: v.stats.expectancy > 0 ? up : down,
            });
          }
        }
      }

      // ── Binance-style position history ──────────────────────────────
      // Trade එකක් = position එකක්. `open` වුණු එක උඩම (Binance එකේ
      // Positions tab එක වගේ), ඉතුරු ඒවා අලුත්ම එක මුලට.
      const positions: PositionRecord[] = [];
      for (const t of r.trades) {
        const live = t.reason === 'open';
        const tu = tradeUsd(t.dir, t.entry, t.initialSl, t.exitPrice, posOpts, feePct, slipPct);
        if (!tu) continue;
        positions.push({
          symbol: ctx.symbol,
          interval: ctx.interval,
          dir: t.dir,
          leverage,
          size: tu.size,
          notionalUsd: tu.notionalUsd,
          marginUsd: tu.marginUsd,
          entryPrice: t.entry,
          closePrice: t.exitPrice,
          grossUsd: tu.grossUsd,
          openedAt: at(t.index) as number,
          closedAt: at(t.exitIndex) as number,
          open: live,
          realizedUsd: tu.netUsd,
          feeUsd: tu.costUsd,
          roePct: tu.roePct,
          r: t.r,
          reason: t.reason,
          liquidated: tu.liquidated,
        });
      }
      positions.reverse();
  return { series, segments, markers, positions, rows };
}

