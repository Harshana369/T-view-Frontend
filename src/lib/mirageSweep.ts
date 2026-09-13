import { atrArray, emaArray, smaArray } from './indicators';
import type { Candle } from './types';

/**
 * "Mirage Liquidity Sweep Pro [WillyAlgoTrader]" (© Willy | WillyAlgoTrader,
 * open-source TradingView script) එකේ ගණන් හදන කොටස.
 *
 * අදහස: price එක random support/resistance වලින් හැරෙන්නේ නෑ — resting
 * orders (liquidity) පරිභෝජනය වෙන තැන් වලින් හැරෙනවා. Swing high එකක් උඩ
 * Buy-Side Liquidity (BSL), swing low එකක් යට Sell-Side Liquidity (SSL).
 * Price එක ඒ level එකෙන් එහාට wick එකක් දාලා **ආපහු ඇතුළට වහනවා** නම්
 * ඒක sweep එකක් — liquidity එක අරන් reject වුණා.
 *
 * Pipeline එක:
 *   Swing memory → sweep detection → 5-factor score → CHoCH confirmation
 *   → wick-anchored risk (SL/TP1-3/BE) → liquidity target → outcome stats
 */

export interface MirageOptions {
  /** Major pivot lookback — sweep කරන liquidity pools. */
  swingLength: number;
  /** Swing එකක් හැදිලා මේ bars ගාණ ඇතුළත විතරයි sweep කරන්න පුළුවන්. */
  maxSweepDistance: number;
  /** 0-100 quality gate. */
  minScore: number;

  /** Sweep එකට පස්සේ structure break එකක් (CHoCH) එනකම් බලාගෙන ඉන්නවද. */
  requireChoch: boolean;
  /** CHoCH හොයන minor pivots වල length. */
  structurePivotLength: number;
  /** Pending setup එකක් expire වෙන්න කලින් බලාගෙන ඉන්න bars ගාණ. */
  confirmWindow: number;

  useVolume: boolean;
  volumeLength: number;
  volumeMult: number;

  useHtfBias: boolean;
  /** HTF EMA length (HTF candles Chart එකෙන් එනවා). */
  htfEmaLength: number;

  atrLength: number;
  /** Sweep wick එකෙන් එහාට SL එකට දෙන ඉඩ (×ATR). */
  slBuffer: number;
  tp1Mult: number;
  tp2Mult: number;
  tp3Mult: number;
  breakEvenAfterTp1: boolean;

  /** EQH/EQL "සමාන" කියලා ගණන් ගන්න tolerance (×ATR). */
  equalTolerance: number;
}

/** Risk presets — SL buffer (×ATR) සහ TP1/TP2/TP3 (R වලින්). */
export const MIRAGE_PRESETS: Record<
  string,
  { slBuffer: number; tp1: number; tp2: number; tp3: number }
> = {
  Conservative: { slBuffer: 0.5, tp1: 1.0, tp2: 2.0, tp3: 4.0 },
  Balanced: { slBuffer: 0.25, tp1: 1.0, tp2: 2.0, tp3: 3.0 },
  Aggressive: { slBuffer: 0.15, tp1: 1.5, tp2: 2.5, tp3: 4.0 },
  Scalping: { slBuffer: 0.1, tp1: 0.8, tp2: 1.5, tp3: 2.0 },
};

/** Memory එකේ තියෙන එක swing එකක් — swept වුණාම `used` වෙනවා. */
interface SwingLevel {
  level: number;
  /** Swing එක හැදුණු bar index එක. */
  barIndex: number;
  used: boolean;
}

/** Score එක pass වුණු sweep එකක් (trade එකක් වුණාට වුණේ නැතත්). */
export interface Sweep {
  index: number;
  dir: 1 | -1;
  /** Swept වුණු swing level එක. */
  level: number;
  /** ඒ swing එක හැදුණු bar index එක — level line එක අඳින්න. */
  levelIndex: number;
  /** Level එකෙන් එහාට ගිය wick එකේ කෙළවර. */
  wick: number;
  score: number;
}

export interface MirageTrade {
  index: number;
  dir: 1 | -1;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  score: number;
  /** Trade එක අරගත්ත sweep එකේ level එක. */
  level: number;
  /** SL/TP3 වැදුනු bar එක — තාම open නම් අන්තිම bar එක. */
  endIndex: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  /** TP1 වැදිලා SL එක entry එකට ගෙනාවද. */
  breakEven: boolean;
  status: 'open' | 'won' | 'lost';
}

/** Un-swept liquidity pool එකක් — chart එකේ BSL/SSL විදිහට පේනවා. */
export interface LiquidityLevel {
  level: number;
  barIndex: number;
  side: 'bsl' | 'ssl';
}

/** සමාන swings දෙකක් — liquidity magnets. */
export interface EqualLevel {
  level: number;
  fromIndex: number;
  toIndex: number;
  side: 'eqh' | 'eql';
}

export interface MirageResult {
  sweeps: Sweep[];
  trades: MirageTrade[];
  /** තාම sweep වෙලා නැති levels (අන්තිම bar එකට). */
  liquidity: LiquidityLevel[];
  equals: EqualLevel[];
  /** අන්තිම trade එක (chart එකේ SL/TP අඳින්නේ මේකට). */
  active: MirageTrade | null;
  wins: number;
  losses: number;
  /** අන්තිම 10 outcome (අලුත්ම අන්තිමට). */
  form: ('win' | 'loss')[];
  htfBullish: boolean | null;
}

/**
 * Pine `ta.pivothigh(len, len)` — දෙපැත්තේම `len` bars ට වඩා උසයි නම්
 * pivot එකක්. Confirm වෙන්නේ `len` bars ට පස්සේ (repaint නෑ, delayed).
 */
function isPivotHigh(candles: Candle[], i: number, len: number): boolean {
  if (i - len < 0 || i + len >= candles.length) return false;
  const v = candles[i].high;
  for (let k = i - len; k <= i + len; k++) {
    if (k !== i && candles[k].high >= v) return false;
  }
  return true;
}

function isPivotLow(candles: Candle[], i: number, len: number): boolean {
  if (i - len < 0 || i + len >= candles.length) return false;
  const v = candles[i].low;
  for (let k = i - len; k <= i + len; k++) {
    if (k !== i && candles[k].low <= v) return false;
  }
  return true;
}

/**
 * Sweep quality score 0-100 — Mirage එකේ හදවත.
 *
 *   wick depth   0.30  — ATR එකට සාපේක්ෂව rejection wick එක කොච්චර ලොකුද
 *   reclaim      0.25  — level එකට ආපහු කොච්චර තීරණාත්මකව වහුවද
 *   close pos    0.20  — candle එක rejection extreme එකට ළඟ වහුවද
 *   volume       0.15  — volume spike එකක් උඩද (volume නැත්නම් 0.5)
 *   HTF bias     0.10  — HTF trend එකට ගැලපෙනවද (filter off නම් 0.5)
 */
function scoreSweep(
  c: Candle,
  dir: 1 | -1,
  level: number,
  atr: number,
  volComp: number,
  htfComp: number,
): number {
  const range = c.high - c.low;
  if (!(range > 0) || !(atr > 0) || Number.isNaN(level)) return 0;

  const wick = dir === 1 ? Math.min(c.open, c.close) - c.low : c.high - Math.max(c.open, c.close);
  const reclaim = dir === 1 ? c.close - level : level - c.close;
  const closePos = (c.close - c.low) / range;
  const cpComp = dir === 1 ? closePos : 1 - closePos;
  const wickComp = Math.min(Math.max(wick, 0) / atr, 1);
  const rclComp = Math.min(Math.max(reclaim, 0) / atr, 1);

  return (wickComp * 0.3 + rclComp * 0.25 + cpComp * 0.2 + volComp * 0.15 + htfComp * 0.1) * 100;
}

export function computeMirage(
  candles: Candle[],
  o: MirageOptions,
  /** HTF candles (Chart එකෙන්) — bias filter එකට. නැත්නම් filter එක neutral. */
  htfCandles: Candle[] = [],
): MirageResult {
  const n = candles.length;
  const empty: MirageResult = {
    sweeps: [],
    trades: [],
    liquidity: [],
    equals: [],
    active: null,
    wins: 0,
    losses: 0,
    form: [],
    htfBullish: null,
  };
  if (n === 0) return empty;

  const atr = atrArray(candles, o.atrLength);
  const volumes = candles.map((c) => c.volume);
  const volSma = smaArray(volumes, o.volumeLength);
  const hasVolume = volumes.some((v) => v > 0);

  // ── HTF bias ────────────────────────────────────────────────────────
  // Pine එකේ `request.security(..., [close[1], ema[1]])` — කලින් bar එකේ
  // confirmed අගය, ඒ නිසා repaint වෙන්නේ නෑ. මෙතනත් එහෙමම: chart bar
  // එකකට ගැලපෙන අන්තිම *වහපු* HTF bar එකේ අගය ගන්නවා.
  const htfBias = new Array<number | null>(n).fill(null);
  if (o.useHtfBias && htfCandles.length > 0) {
    const htfEma = emaArray(
      htfCandles.map((c) => c.close),
      o.htfEmaLength,
    );
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = candles[i].time;
      if (t < htfCandles[0].time) continue;
      while (j + 1 < htfCandles.length && htfCandles[j + 1].time <= t) j++;
      // කලින් වහපු HTF bar එක (Pine එකේ [1] එකට සමානයි).
      const prev = j - 1;
      if (prev < 0 || Number.isNaN(htfEma[prev])) continue;
      htfBias[i] = htfCandles[prev].close > htfEma[prev] ? 1 : -1;
    }
  }

  // ── Swing memory ────────────────────────────────────────────────────
  const highs: SwingLevel[] = [];
  const lows: SwingLevel[] = [];
  const equals: EqualLevel[] = [];
  const sweeps: Sweep[] = [];
  const trades: MirageTrade[] = [];

  // ── Position state ──────────────────────────────────────────────────
  let active: MirageTrade | null = null;
  let wins = 0;
  let losses = 0;
  const form: ('win' | 'loss')[] = [];

  // CHoCH වලට minor structure
  let lastMinorHigh = NaN;
  let lastMinorLow = NaN;

  // Pending setup (CHoCH එනකම් බලාගෙන)
  let pendingDir: 0 | 1 | -1 = 0;
  let pendingStart = 0;
  let pendingLevel = NaN;
  let pendingWick = NaN;
  let pendingScore = NaN;

  const warmup = Math.max(o.swingLength * 2, 50);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const a = atr[i];

    // 1. Swings confirm වෙනවා (මේ bar එකේදී `swingLength` bars කලින් එකක්)
    const cand = i - o.swingLength;
    if (cand >= 0) {
      if (isPivotHigh(candles, cand, o.swingLength)) {
        const level = candles[cand].high;
        // EQH — කලින් swing high එකට සමානද
        const prev = highs[highs.length - 1];
        if (prev && a > 0 && Math.abs(level - prev.level) <= a * o.equalTolerance) {
          equals.push({
            level: Math.max(level, prev.level),
            fromIndex: prev.barIndex,
            toIndex: cand,
            side: 'eqh',
          });
        }
        highs.push({ level, barIndex: cand, used: false });
      }
      if (isPivotLow(candles, cand, o.swingLength)) {
        const level = candles[cand].low;
        const prev = lows[lows.length - 1];
        if (prev && a > 0 && Math.abs(level - prev.level) <= a * o.equalTolerance) {
          equals.push({
            level: Math.min(level, prev.level),
            fromIndex: prev.barIndex,
            toIndex: cand,
            side: 'eql',
          });
        }
        lows.push({ level, barIndex: cand, used: false });
      }
    }

    // Minor pivots — CHoCH වලට. මේවා confirm වෙන්නේ `structurePivotLength`
    // bars වලින්, major swings වගේ `swingLength` වලින් නෙවෙයි (Pine
    // `ta.pivothigh(minorLen, minorLen)`). වැරදි bar එකේ බැලුවොත් pivots
    // ප්‍රමාද වෙලා confirm window එකට හසු වෙන්නේ නෑ.
    const minor = i - o.structurePivotLength;
    if (minor >= 0) {
      if (isPivotHigh(candles, minor, o.structurePivotLength)) {
        lastMinorHigh = candles[minor].high;
      }
      if (isPivotLow(candles, minor, o.structurePivotLength)) {
        lastMinorLow = candles[minor].low;
      }
    }

    // 2. Sweep detection — අලුත්ම level එකේ ඉඳන් පිටිපස්සට
    let bullSweep: { level: number; levelIndex: number } | null = null;
    let bearSweep: { level: number; levelIndex: number } | null = null;

    for (let k = lows.length - 1; k >= 0; k--) {
      const s = lows[k];
      if (s.used || i - s.barIndex > o.maxSweepDistance) continue;
      if (c.close < s.level) {
        // හරි breakdown එකක් — level එක පරිභෝජනය වුණා, signal එකක් නෑ.
        s.used = true;
      } else if (c.low < s.level && c.close > s.level) {
        s.used = true;
        if (!bullSweep) bullSweep = { level: s.level, levelIndex: s.barIndex };
      }
    }
    for (let k = highs.length - 1; k >= 0; k--) {
      const s = highs[k];
      if (s.used || i - s.barIndex > o.maxSweepDistance) continue;
      if (c.close > s.level) {
        s.used = true;
      } else if (c.high > s.level && c.close < s.level) {
        s.used = true;
        if (!bearSweep) bearSweep = { level: s.level, levelIndex: s.barIndex };
      }
    }

    // 3. Score
    const volRatio =
      hasVolume && !Number.isNaN(volSma[i]) && volSma[i] > 0 ? volumes[i] / volSma[i] : NaN;
    const volComp = !o.useVolume
      ? 0.5
      : Number.isNaN(volRatio)
        ? 0.5
        : Math.min(Math.max((volRatio - 1) / Math.max(o.volumeMult - 1, 0.1), 0), 1);

    const bias = htfBias[i];
    const htfCompBull = !o.useHtfBias ? 0.5 : bias === 1 ? 1 : 0;
    const htfCompBear = !o.useHtfBias ? 0.5 : bias === -1 ? 1 : 0;

    const warmedUp = i >= warmup;
    let bullQ = false;
    let bearQ = false;
    let bullScore = 0;
    let bearScore = 0;

    if (bullSweep && warmedUp) {
      bullScore = scoreSweep(c, 1, bullSweep.level, a, volComp, htfCompBull);
      bullQ = bullScore >= o.minScore;
      if (bullQ) {
        sweeps.push({
          index: i,
          dir: 1,
          level: bullSweep.level,
          levelIndex: bullSweep.levelIndex,
          wick: c.low,
          score: bullScore,
        });
      }
    }
    if (bearSweep && warmedUp) {
      bearScore = scoreSweep(c, -1, bearSweep.level, a, volComp, htfCompBear);
      bearQ = bearScore >= o.minScore;
      if (bearQ) {
        sweeps.push({
          index: i,
          dir: -1,
          level: bearSweep.level,
          levelIndex: bearSweep.levelIndex,
          wick: c.high,
          score: bearScore,
        });
      }
    }

    // 4. Signal resolution — වහාම, නැත්නම් CHoCH එනකම්
    let fireDir: 0 | 1 | -1 = 0;
    let sigScore = NaN;
    let sigWick = NaN;
    let sigLevel = NaN;

    if (o.requireChoch) {
      if (pendingDir !== 0 && i - pendingStart > o.confirmWindow) pendingDir = 0;

      if (bullQ && bullSweep) {
        pendingDir = 1;
        pendingStart = i;
        pendingLevel = bullSweep.level;
        pendingWick = c.low;
        pendingScore = bullScore;
      }
      if (bearQ && bearSweep) {
        pendingDir = -1;
        pendingStart = i;
        pendingLevel = bearSweep.level;
        pendingWick = c.high;
        pendingScore = bearScore;
      }

      if (pendingDir === 1 && !Number.isNaN(lastMinorHigh) && c.close > lastMinorHigh) {
        fireDir = 1;
        sigScore = pendingScore;
        sigWick = pendingWick;
        sigLevel = pendingLevel;
        pendingDir = 0;
      } else if (pendingDir === -1 && !Number.isNaN(lastMinorLow) && c.close < lastMinorLow) {
        fireDir = -1;
        sigScore = pendingScore;
        sigWick = pendingWick;
        sigLevel = pendingLevel;
        pendingDir = 0;
      }
    } else {
      if (bullQ && bullSweep) {
        fireDir = 1;
        sigScore = bullScore;
        sigWick = c.low;
        sigLevel = bullSweep.level;
      } else if (bearQ && bearSweep) {
        fireDir = -1;
        sigScore = bearScore;
        sigWick = c.high;
        sigLevel = bearSweep.level;
      }
    }

    // 5. දැන් තියෙන trade එක manage කරනවා (entry bar එකට පස්සේ bars වලදී)
    if (active && i > active.index) {
      const long = active.dir === 1;
      const slHit = long ? c.low <= active.sl : c.high >= active.sl;
      const tp1 = long ? c.high >= active.tp1 : c.low <= active.tp1;
      const tp2 = long ? c.high >= active.tp2 : c.low <= active.tp2;
      const tp3 = long ? c.high >= active.tp3 : c.low <= active.tp3;

      if (tp1 && !active.tp1Hit && !slHit) {
        active.tp1Hit = true;
        // TP1 වැදුනාම SL එක entry එකට — ඊළඟ bar එකේ ඉඳන් break-even.
        if (o.breakEvenAfterTp1 && !active.breakEven) {
          active.sl = active.entry;
          active.breakEven = true;
        }
      }
      if (tp2 && !active.tp2Hit && !slHit) active.tp2Hit = true;
      if (tp3 && !active.tp3Hit && !slHit) active.tp3Hit = true;

      if (slHit || tp3) {
        // TP1 වැදිලා තිබ්බා නම් win — break-even එකට ආපහු ආවත්.
        active.status = active.tp1Hit ? 'won' : 'lost';
        active.endIndex = i;
        if (active.tp1Hit) wins++;
        else losses++;
        form.push(active.tp1Hit ? 'win' : 'loss');
        if (form.length > 10) form.shift();
        active = null;
      } else {
        active.endIndex = i;
      }
    }

    // 6. අලුත් trade එකක් — flat නම් විතරයි (එකවර එකයි)
    if (fireDir !== 0 && !active && a > 0 && !Number.isNaN(sigWick)) {
      const entry = c.close;
      let sl = fireDir === 1 ? sigWick - a * o.slBuffer : sigWick + a * o.slBuffer;
      let dist = Math.abs(entry - sl);
      // ගොඩක් තදට SL එකක් හැදුනොත් ATR×0.5 ට පළල් කරනවා.
      if (dist < a * 0.5) {
        dist = a * 0.5;
        sl = fireDir === 1 ? entry - dist : entry + dist;
      }
      const trade: MirageTrade = {
        index: i,
        dir: fireDir,
        entry,
        sl,
        tp1: entry + fireDir * dist * o.tp1Mult,
        tp2: entry + fireDir * dist * o.tp2Mult,
        tp3: entry + fireDir * dist * o.tp3Mult,
        score: sigScore,
        level: sigLevel,
        endIndex: i,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        breakEven: false,
        status: 'open',
      };
      trades.push(trade);
      active = trade;
    }
  }

  // තාම sweep වෙලා නැති levels — chart එකේ BSL/SSL
  const liquidity: LiquidityLevel[] = [
    ...highs
      .filter((s) => !s.used)
      .map((s) => ({ level: s.level, barIndex: s.barIndex, side: 'bsl' as const })),
    ...lows
      .filter((s) => !s.used)
      .map((s) => ({ level: s.level, barIndex: s.barIndex, side: 'ssl' as const })),
  ];

  const lastBias = htfBias[n - 1];
  return {
    sweeps,
    trades,
    liquidity,
    equals,
    active,
    wins,
    losses,
    form,
    htfBullish: lastBias === null ? null : lastBias === 1,
  };
}
