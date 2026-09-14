import type { Candle } from './types';

/**
 * "Elliott Wave Detector PRO [TGTBTB]" v3.1 — MTF Edition
 * (© GoodBadBitcoin, MPL-2.0) එකේ port එක.
 *
 * මේකේ අරමුණ: swing එකකට අනුමාන wave number එකක් ගහන එක නෙවෙයි —
 * Elliott Wave එකේ **කඩන්න බැරි නීති 3** පරීක්ෂා කරලා, ඒවා pass වුණොත්
 * විතරක් label එකක් පෙන්නන එක. Pass නොවුණොත් "මම දන්නේ නෑ" කියනවා.
 *
 *   1. Wave 2, Wave 1 පටන්ගත්ත තැනට වඩා පිටිපස්සට යන්නේ නෑ
 *   2. Wave 3, waves 1/3/5 අතරින් කොටම එක වෙන්නේ නෑ
 *   3. Wave 4, Wave 1 ගේ price ප්‍රදේශයට ඇතුළු වෙන්නේ නෑ (diagonal එකක් නම් හැර)
 *
 * Patterns 5ක්: impulse, diagonal, zigzag, flat (regular/expanded), triangle.
 * ඒ එක්කම guidelines දෙකක් (alternation, sub-wave structure) confidence
 * score එකට බලපානවා, සහ HTF දෙකක wave context එකෙන් alignment score එකක්.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface EwPivot {
  index: number;
  price: number;
  isHigh: boolean;
}

export interface EwWave {
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  /** "1".."5" හෝ "A".."E". */
  number: string;
  isMotive: boolean;
  isBullish: boolean;
  /** Corrective waves වලට — කලින් wave එකෙන් කීයක් retrace කළාද (%). */
  retracePct: number;
  /** Motive waves වලට — Wave 1 ට සාපේක්ෂ දිග (%). */
  extensionPct: number;
  subWaveCount: number;
}

export type EwPatternType =
  | 'impulse'
  | 'diagonal'
  | 'zigzag'
  | 'regular flat'
  | 'expanded flat'
  | 'triangle';

export interface EwPattern {
  patternType: EwPatternType;
  waves: EwWave[];
  confidence: number;
  isBullish: boolean;
  startIndex: number;
  endIndex: number;
  /** Guideline results — confidence එකට බලපානවා, gate එකක් නෙවෙයි. */
  alternationMet: boolean;
  subWavesValid: boolean;
}

export type EwPhase = 'motive' | 'corrective' | 'unknown';

/** HTF එකක තත්ත්වය — pattern එකක් නැත්නම් trend structure එකට වැටෙනවා. */
export interface EwHtfContext {
  phase: EwPhase;
  /** Pattern එකක් හම්බුණොත් ඒකේ නම, නැත්නම් 'trend_up'/'trend_down'/'ranging'/'none'. */
  pattern: string;
  isBullish: boolean;
  confidence: number;
  pivotCount: number;
  trendBias: 'bullish' | 'bearish' | 'neutral';
}

export type EwAlignmentLabel = 'ALIGNED' | 'PARTIAL' | 'NEUTRAL' | 'CONFLICTING' | 'N/A';

export interface EwMtf {
  htf1: EwHtfContext;
  htf2: EwHtfContext;
  /** -1.0 (සම්පූර්ණ ගැටුම) සිට +1.0 (සම්පූර්ණ එකඟතාව). */
  score: number;
  label: EwAlignmentLabel;
}

export interface EwFibLevel {
  ratio: number;
  price: number;
  kind: 'retracement' | 'extension';
}

export interface EwForecast {
  /** ඊළඟට එන්නේ මොකක්ද — "Wave 3 (impulse)" වගේ. */
  nextWave: string;
  scenario: string;
  targetHigh: number;
  targetLow: number;
  stopLevel: number;
  /** 0-5 තරු. */
  stars: number;
  /** Pattern එකක් validate වුණාද — නැත්නම් pivot geometry විතරයි. */
  confirmed: boolean;
  /** HTF එකෙන් එන අනතුරු ඇඟවීම (තිබේ නම්). */
  mtfNote: string;
}

export type EwSignalKind = 'Wave 3 Entry' | 'Wave 5 Exit' | 'Wave C Reversal';

export interface EwSignal {
  index: number;
  kind: EwSignalKind;
  isBullish: boolean;
  price: number;
  /** MTF CONFLICTING නිසා මර්දනය වුණාද. */
  gated: boolean;
}

export interface EwOptions {
  primarySwingLength: number;
  secondarySwingLength: number;
  /** Primary wave එකක් වෙන්න ඕන අවම චලනය (%). */
  minSwingPct: number;
  minSubSwingPct: number;

  detectImpulse: boolean;
  detectDiagonal: boolean;
  detectZigzag: boolean;
  detectFlat: boolean;
  detectTriangle: boolean;

  useMtf: boolean;
  htfSwingLength: number;
  htfMinSwingPct: number;
  /** HTF alignment එක CTF confidence එකට කොච්චර බලපානවද (0-0.5). */
  htfConfidenceWeight: number;

  enableSignals: boolean;
  projectionBars: number;
}

export interface EwResult {
  primaryPivots: EwPivot[];
  secondaryPivots: EwPivot[];
  pattern: EwPattern | null;
  mtf: EwMtf | null;
  fib: EwFibLevel[];
  forecast: EwForecast | null;
  signals: EwSignal[];
  /** Pattern එකක් validate වුණේ නැත්නම් confidence එකට කලින් තිබුණු අගය. */
  rawConfidence: number;
}

// ── Utilities ─────────────────────────────────────────────────────────

const FIB_RETRACE = [0.236, 0.382, 0.5, 0.618, 0.786];
const FIB_EXTEND = [1.0, 1.272, 1.618, 2.0, 2.618];

function pctMove(from: number, to: number): number {
  return from !== 0 ? Math.abs((to - from) / from) * 100 : 0;
}

/** Wave එකකින් කීයක් retrace වුණාද (0-1+). */
function retracementRatio(waveStart: number, waveEnd: number, retraceTo: number): number {
  const waveLen = Math.abs(waveEnd - waveStart);
  return waveLen !== 0 ? Math.abs(retraceTo - waveEnd) / waveLen : 0;
}

/**
 * Pine `ta.pivothigh(len, len)` + alternating swing filter එක.
 *
 * Pivot එකක් හම්බුණාම:
 *   • කලින් එක අනිත් පැත්තේ එකක් නම් සහ චලනය `minPct` ට වඩා ලොකු නම් →
 *     අලුත් pivot එකක්
 *   • කලින් එකත් එකම පැත්තේ නම් සහ මේක ඊට වඩා අන්තයි නම් → පරණ එක යාවත්කාලීන
 *   • නැත්නම් නොසලකා හරිනවා
 * ඒ නිසා pivots හැමවිටම high/low විකල්ප වශයෙන් එනවා.
 */
function collectPivots(candles: Candle[], swingLength: number, minPct: number): EwPivot[] {
  const n = candles.length;
  const pivots: EwPivot[] = [];
  const len = swingLength;

  const isPivotHigh = (i: number) => {
    const v = candles[i].high;
    for (let k = i - len; k <= i + len; k++) {
      if (k !== i && candles[k].high >= v) return false;
    }
    return true;
  };
  const isPivotLow = (i: number) => {
    const v = candles[i].low;
    for (let k = i - len; k <= i + len; k++) {
      if (k !== i && candles[k].low <= v) return false;
    }
    return true;
  };

  const push = (index: number, price: number, isHigh: boolean) => {
    const last = pivots[pivots.length - 1];
    if (!last) {
      pivots.push({ index, price, isHigh });
      return;
    }
    if (last.isHigh !== isHigh) {
      if (pctMove(last.price, price) >= minPct) pivots.push({ index, price, isHigh });
    } else if (isHigh ? price > last.price : price < last.price) {
      // එකම පැත්තේ තවත් අන්ත එකක් — swing එක දිගු වෙනවා.
      last.price = price;
      last.index = index;
    }
  };

  // Pivot එකක් confirm වෙන්නේ `len` bars ට පස්සේ. Bar එකෙන් bar එකට
  // යනකොට confirm වෙන අනුපිළිවෙළටම එකතු කරනවා (repaint නෑ).
  for (let i = len; i + len < n; i++) {
    if (isPivotHigh(i)) push(i, candles[i].high, true);
    if (isPivotLow(i)) push(i, candles[i].low, false);
  }

  return pivots;
}

/** Wave එකක් ඇතුළේ තියෙන secondary pivots ගාණ. */
function countSubWaves(secondary: EwPivot[], fromIndex: number, toIndex: number): number {
  let count = 0;
  for (const p of secondary) {
    if (p.index > fromIndex && p.index < toIndex) count++;
  }
  return count;
}

/** Motive waves 5කට, corrective waves 3කට කැඩෙන්න ඕන (ලිහිල් පරීක්ෂාවක්). */
function subWaveCountValid(subCount: number, isMotive: boolean): boolean {
  return isMotive ? subCount >= 3 : subCount >= 1 && subCount <= 5;
}

// ── Alternation guideline ─────────────────────────────────────────────

function classifyCorrection(retracePct: number, durationBars: number, prevDuration: number): string {
  let result = retracePct > 50 ? 'sharp' : 'sideways';
  if (durationBars > prevDuration * 1.5 && retracePct < 55) result = 'sideways';
  return result;
}

/** Wave 2 තියුණු නම් Wave 4 පැතලි වෙන්න ඕන — සහ අනිත් පැත්තට. */
function checkAlternation(
  w2RetracePct: number,
  w2Duration: number,
  w1Duration: number,
  w4RetracePct: number,
  w4Duration: number,
  w3Duration: number,
): boolean {
  const w2Type = classifyCorrection(w2RetracePct, w2Duration, w1Duration);
  const w4Type = classifyCorrection(w4RetracePct, w4Duration, w3Duration);
  return w2Type !== w4Type;
}

// ── Cardinal rules ────────────────────────────────────────────────────

/** Rule 1 — Wave 2, Wave 1 පටන්ගත්ත තැන පනින්නේ නෑ. */
function rule1Valid(w1Start: number, w2End: number, bullish: boolean): boolean {
  return bullish ? w2End > w1Start : w2End < w1Start;
}

/** Rule 2 — Wave 3, 1/3/5 අතරින් කොටම එක වෙන්නේ නෑ. */
function rule2Valid(w1Len: number, w3Len: number, w5Len: number): boolean {
  return !(w3Len < w1Len && w3Len < w5Len);
}

/** Rule 3 — Wave 4, Wave 1 ගේ ප්‍රදේශයට ඇතුළු වෙන්නේ නෑ (diagonal එකක් හැර). */
function rule3Valid(w1End: number, w4End: number, bullish: boolean, isDiagonal: boolean): boolean {
  return isDiagonal ? true : bullish ? w4End > w1End : w4End < w1End;
}

/** Pivots 6ක් alternating high/low ද කියලා. */
function alternatingStructure(p: EwPivot[], bullish: boolean): boolean {
  // Bullish impulse එකක් පටන් ගන්නේ low එකකින්: L H L H L H
  for (let i = 0; i < p.length; i++) {
    const wantHigh = bullish ? i % 2 === 1 : i % 2 === 0;
    if (p[i].isHigh !== wantHigh) return false;
  }
  return true;
}

// ── Pattern detectors ─────────────────────────────────────────────────
// Pine එකේ වගේම, හැම එකක්ම බලන්නේ **අන්තිම** pivots ටික විතරයි — දැන්
// තියෙන count එක මොකක්ද කියන එකයි ප්‍රශ්නය, ඉතිහාසය ඔක්කොම නෙවෙයි.

function detectImpulse(pivots: EwPivot[], secondary: EwPivot[]): EwPattern | null {
  const n = pivots.length;
  if (n < 6) return null;
  const [p0, p1, p2, p3, p4, p5] = pivots.slice(n - 6);

  const bullish = p0.price < p1.price;
  if (!alternatingStructure([p0, p1, p2, p3, p4, p5], bullish)) return null;

  const w1Len = Math.abs(p1.price - p0.price);
  const w3Len = Math.abs(p3.price - p2.price);
  const w5Len = Math.abs(p5.price - p4.price);
  const w2Retrace = retracementRatio(p0.price, p1.price, p2.price) * 100;
  const w4Retrace = retracementRatio(p2.price, p3.price, p4.price) * 100;

  const w1Dur = p1.index - p0.index;
  const w2Dur = p2.index - p1.index;
  const w3Dur = p3.index - p2.index;
  const w4Dur = p4.index - p3.index;
  const w5Dur = p5.index - p4.index;

  const sw1 = countSubWaves(secondary, p0.index, p1.index);
  const sw2 = countSubWaves(secondary, p1.index, p2.index);
  const sw3 = countSubWaves(secondary, p2.index, p3.index);
  const sw4 = countSubWaves(secondary, p3.index, p4.index);
  const sw5 = countSubWaves(secondary, p4.index, p5.index);

  // නීති 3ම pass වෙන්න ඕන — එකක් වැරදුනොත් count එක වැරදියි, තර්කයක් නෑ.
  if (!rule1Valid(p0.price, p2.price, bullish)) return null;
  if (!rule2Valid(w1Len, w3Len, w5Len)) return null;
  if (!rule3Valid(p1.price, p4.price, bullish, false)) return null;

  const altOk = checkAlternation(w2Retrace, w2Dur, w1Dur, w4Retrace, w4Dur, w3Dur);
  const swOk =
    subWaveCountValid(sw1, true) &&
    subWaveCountValid(sw2, false) &&
    subWaveCountValid(sw3, true) &&
    subWaveCountValid(sw4, false) &&
    subWaveCountValid(sw5, true);

  // Confidence — Fibonacci සම්බන්ධතා කොච්චර හොඳට ගැලපෙනවද.
  let conf = 0.4;
  if (Math.abs(w2Retrace - 61.8) < 10) conf += 0.1;
  else if (Math.abs(w2Retrace - 50) < 10) conf += 0.07;
  if (Math.abs(w3Len / w1Len - 1.618) < 0.3) conf += 0.12;
  else if (w3Len / w1Len > 1) conf += 0.05;
  if (Math.abs(w4Retrace - 38.2) < 10) conf += 0.08;
  if (altOk) conf += 0.1;
  if (swOk) conf += 0.1;
  if (w3Len > w1Len && w3Len > w5Len) conf += 0.05;
  if (Math.abs(w5Len / w1Len - 1) < 0.3) conf += 0.05;

  const wave = (
    a: EwPivot,
    b: EwPivot,
    number: string,
    isMotive: boolean,
    retracePct: number,
    extensionPct: number,
    subWaveCount: number,
  ): EwWave => ({
    startIndex: a.index,
    startPrice: a.price,
    endIndex: b.index,
    endPrice: b.price,
    number,
    isMotive,
    isBullish: isMotive ? bullish : !bullish,
    retracePct,
    extensionPct,
    subWaveCount,
  });

  void w5Dur;
  return {
    patternType: 'impulse',
    waves: [
      wave(p0, p1, '1', true, 0, 0, sw1),
      wave(p1, p2, '2', false, w2Retrace, 0, sw2),
      wave(p2, p3, '3', true, 0, (w3Len / w1Len) * 100, sw3),
      wave(p3, p4, '4', false, w4Retrace, 0, sw4),
      wave(p4, p5, '5', true, 0, (w5Len / w1Len) * 100, sw5),
    ],
    confidence: Math.min(conf, 1),
    isBullish: bullish,
    startIndex: p0.index,
    endIndex: p5.index,
    alternationMet: altOk,
    subWavesValid: swOk,
  };
}

function detectDiagonal(pivots: EwPivot[]): EwPattern | null {
  const n = pivots.length;
  if (n < 6) return null;
  const [p0, p1, p2, p3, p4, p5] = pivots.slice(n - 6);

  const bullish = p0.price < p1.price;
  if (!alternatingStructure([p0, p1, p2, p3, p4, p5], bullish)) return null;

  // Diagonal එකේ සලකුණ — Wave 4, Wave 1 ගේ ප්‍රදේශයට ඇතුළු වෙනවා.
  const hasOverlap = bullish ? p4.price < p1.price : p4.price > p1.price;
  if (!hasOverlap) return null;
  if (!rule1Valid(p0.price, p2.price, bullish)) return null;

  const w1Len = Math.abs(p1.price - p0.price);
  const w3Len = Math.abs(p3.price - p2.price);
  const w5Len = Math.abs(p5.price - p4.price);
  if (!rule2Valid(w1Len, w3Len, w5Len)) return null;

  // Wedge එකක් වගේ හැකිලෙනවද.
  const slope1 = (p3.price - p1.price) / Math.max(p3.index - p1.index, 1);
  const slope2 = (p5.price - p3.price) / Math.max(p5.index - p3.index, 1);
  const converging = bullish
    ? slope2 < slope1 || (w5Len < w3Len && w3Len < w1Len)
    : Math.abs(slope2) < Math.abs(slope1) || (w5Len < w3Len && w3Len < w1Len);
  if (!converging) return null;

  let conf = 0.45;
  if (w3Len < w1Len && w5Len < w3Len) conf += 0.15;
  if (w5Len < w1Len) conf += 0.05;

  const all = [p0, p1, p2, p3, p4, p5];
  const waves: EwWave[] = [];
  for (let i = 0; i < 5; i++) {
    const motive = i % 2 === 0;
    waves.push({
      startIndex: all[i].index,
      startPrice: all[i].price,
      endIndex: all[i + 1].index,
      endPrice: all[i + 1].price,
      number: String(i + 1),
      isMotive: motive,
      isBullish: motive ? bullish : !bullish,
      retracePct: 0,
      extensionPct: 0,
      subWaveCount: 0,
    });
  }

  return {
    patternType: 'diagonal',
    waves,
    confidence: Math.min(conf, 1),
    isBullish: bullish,
    startIndex: p0.index,
    endIndex: p5.index,
    alternationMet: false,
    subWavesValid: false,
  };
}

function detectZigzag(pivots: EwPivot[]): EwPattern | null {
  const n = pivots.length;
  if (n < 4) return null;
  const [p0, p1, p2, p3] = pivots.slice(n - 4);

  const bearish = p0.price > p1.price;
  if (!alternatingStructure([p0, p1, p2, p3], !bearish)) return null;
  // C, A ගේ කෙළවරෙන් එහාට යන්න ඕන; B, A ගේ මූලාරම්භය පනින්නේ නෑ.
  if (bearish) {
    if (!(p2.price < p0.price && p3.price <= p1.price)) return null;
  } else {
    if (!(p2.price > p0.price && p3.price >= p1.price)) return null;
  }

  const waveALen = Math.abs(p1.price - p0.price);
  const waveBRetrace = retracementRatio(p0.price, p1.price, p2.price);
  const waveCLen = Math.abs(p3.price - p2.price);
  const cRatio = waveALen > 0 ? waveCLen / waveALen : 0;

  // Zigzag එකක B, A එකෙන් 30-85%ක් විතරයි retrace කරන්නේ (තියුණු correction).
  if (!(waveBRetrace >= 0.3 && waveBRetrace <= 0.85)) return null;

  let conf = 0.45;
  if (Math.abs(waveBRetrace - 0.618) < 0.1) conf += 0.15;
  else if (Math.abs(waveBRetrace - 0.5) < 0.1) conf += 0.1;
  if (Math.abs(cRatio - 1) < 0.2) conf += 0.12;
  else if (Math.abs(cRatio - 1.618) < 0.25) conf += 0.08;

  const bullish = !bearish;
  return {
    patternType: 'zigzag',
    waves: [
      {
        startIndex: p0.index, startPrice: p0.price, endIndex: p1.index, endPrice: p1.price,
        number: 'A', isMotive: true, isBullish: bullish,
        retracePct: 0, extensionPct: 0, subWaveCount: 0,
      },
      {
        startIndex: p1.index, startPrice: p1.price, endIndex: p2.index, endPrice: p2.price,
        number: 'B', isMotive: false, isBullish: bearish,
        retracePct: waveBRetrace * 100, extensionPct: 0, subWaveCount: 0,
      },
      {
        startIndex: p2.index, startPrice: p2.price, endIndex: p3.index, endPrice: p3.price,
        number: 'C', isMotive: true, isBullish: bullish,
        retracePct: 0, extensionPct: cRatio * 100, subWaveCount: 0,
      },
    ],
    confidence: Math.min(conf, 1),
    isBullish: bullish,
    startIndex: p0.index,
    endIndex: p3.index,
    alternationMet: false,
    subWavesValid: false,
  };
}

function detectFlat(pivots: EwPivot[]): EwPattern | null {
  const n = pivots.length;
  if (n < 4) return null;
  const [p0, p1, p2, p3] = pivots.slice(n - 4);

  const bearish = p0.price > p1.price;
  if (!alternatingStructure([p0, p1, p2, p3], !bearish)) return null;

  const waveALen = Math.abs(p1.price - p0.price);
  const waveBRetrace = retracementRatio(p0.price, p1.price, p2.price);
  const waveCLen = Math.abs(p3.price - p2.price);
  const cRatio = waveALen > 0 ? waveCLen / waveALen : 0;

  // Flat එකක B, A එකෙන් හැටියක්ම (80-145%) retrace කරනවා.
  if (!(waveBRetrace >= 0.8 && waveBRetrace <= 1.45)) return null;

  let conf = 0.4;
  if (waveBRetrace >= 0.9 && waveBRetrace <= 1.05) conf += 0.15;
  else if (waveBRetrace > 1.05 && waveBRetrace <= 1.38) conf += 0.1;
  if (Math.abs(cRatio - 1) < 0.2) conf += 0.12;
  else if (cRatio > 1 && cRatio < 1.8) conf += 0.08;

  const cTerminatesValid = bearish ? p3.price <= p1.price * 1.05 : p3.price >= p1.price * 0.95;
  if (cTerminatesValid) conf += 0.08;

  // B, A එකෙන් එහාට ගියොත් expanded flat — trading implications වෙනස්.
  const flatType: EwPatternType = waveBRetrace > 1.05 ? 'expanded flat' : 'regular flat';
  const bullish = !bearish;

  return {
    patternType: flatType,
    waves: [
      {
        startIndex: p0.index, startPrice: p0.price, endIndex: p1.index, endPrice: p1.price,
        number: 'A', isMotive: false, isBullish: bullish,
        retracePct: 0, extensionPct: 0, subWaveCount: 0,
      },
      {
        startIndex: p1.index, startPrice: p1.price, endIndex: p2.index, endPrice: p2.price,
        number: 'B', isMotive: false, isBullish: bearish,
        retracePct: waveBRetrace * 100, extensionPct: 0, subWaveCount: 0,
      },
      {
        startIndex: p2.index, startPrice: p2.price, endIndex: p3.index, endPrice: p3.price,
        number: 'C', isMotive: true, isBullish: bullish,
        retracePct: 0, extensionPct: cRatio * 100, subWaveCount: 0,
      },
    ],
    confidence: Math.min(conf, 1),
    isBullish: bullish,
    startIndex: p0.index,
    endIndex: p3.index,
    alternationMet: false,
    subWavesValid: false,
  };
}

function detectTriangle(pivots: EwPivot[]): EwPattern | null {
  const n = pivots.length;
  if (n < 6) return null;
  const [p0, p1, p2, p3, p4, p5] = pivots.slice(n - 6);

  // Highs පහත් වෙමින්, lows උස් වෙමින් — එකට හැකිලෙනවා.
  let validStructure = false;
  if (p0.isHigh && !p1.isHigh && p2.isHigh && !p3.isHigh && p4.isHigh && !p5.isHigh) {
    validStructure =
      p2.price < p0.price && p4.price < p2.price && p3.price > p1.price && p5.price > p3.price;
  } else if (!p0.isHigh && p1.isHigh && !p2.isHigh && p3.isHigh && !p4.isHigh && p5.isHigh) {
    validStructure =
      p2.price > p0.price && p4.price > p2.price && p3.price < p1.price && p5.price < p3.price;
  }
  if (!validStructure) return null;

  const lens = [
    Math.abs(p1.price - p0.price),
    Math.abs(p2.price - p1.price),
    Math.abs(p3.price - p2.price),
    Math.abs(p4.price - p3.price),
    Math.abs(p5.price - p4.price),
  ];

  // හැම wave එකක්ම කලින් එකට වඩා කොට වෙන්න ඕන — ඒත් හැබෑ markets
  // පරිපූර්ණ ජ්‍යාමිතික නෑ, ඒ නිසා 4න් 3ක් ඇති.
  let contractCount = 0;
  for (let i = 1; i < 5; i++) if (lens[i] < lens[i - 1]) contractCount++;
  if (contractCount < 3) return null;
  const contracting = contractCount === 4;

  let conf = 0.4 + (contracting ? 0.15 : 0.05);
  const eRetrace = retracementRatio(p3.price, p4.price, p5.price);
  if (Math.abs(eRetrace - 0.618) < 0.15) conf += 0.1;
  const bRetrace = retracementRatio(p0.price, p1.price, p2.price);
  if (bRetrace >= 0.55 && bRetrace <= 0.85) conf += 0.08;

  const all = [p0, p1, p2, p3, p4, p5];
  const names = ['A', 'B', 'C', 'D', 'E'];
  const waves: EwWave[] = [];
  for (let i = 0; i < 5; i++) {
    waves.push({
      startIndex: all[i].index,
      startPrice: all[i].price,
      endIndex: all[i + 1].index,
      endPrice: all[i + 1].price,
      number: names[i],
      isMotive: false,
      isBullish: all[i + 1].price > all[i].price,
      retracePct: 0,
      extensionPct: 0,
      subWaveCount: 0,
    });
  }

  return {
    patternType: 'triangle',
    waves,
    confidence: Math.min(conf, 1),
    isBullish: !p0.isHigh,
    startIndex: p0.index,
    endIndex: p5.index,
    alternationMet: false,
    subWavesValid: false,
  };
}

/** Enabled detectors ඔක්කොම දුවලා හොඳම confidence එක තෝරනවා. */
function detectBest(
  pivots: EwPivot[],
  secondary: EwPivot[],
  o: Pick<
    EwOptions,
    'detectImpulse' | 'detectDiagonal' | 'detectZigzag' | 'detectFlat' | 'detectTriangle'
  >,
): EwPattern | null {
  const candidates: (EwPattern | null)[] = [
    o.detectImpulse ? detectImpulse(pivots, secondary) : null,
    o.detectDiagonal ? detectDiagonal(pivots) : null,
    o.detectZigzag ? detectZigzag(pivots) : null,
    o.detectFlat ? detectFlat(pivots) : null,
    o.detectTriangle ? detectTriangle(pivots) : null,
  ];
  let best: EwPattern | null = null;
  for (const c of candidates) {
    if (c && (!best || c.confidence > best.confidence)) best = c;
  }
  return best;
}

// ── HTF trend structure fallback ──────────────────────────────────────

/**
 * EW pattern එකක් validate නොවුණොත්, HH/HL එකතුව බලලා trend එකක්ද
 * range එකක්ද කියලා තීරණය කරනවා.
 */
function classifyTrendStructure(pivots: EwPivot[]): {
  phase: EwPhase;
  isBullish: boolean;
  confidence: number;
  trendBias: 'bullish' | 'bearish' | 'neutral';
} {
  const count = pivots.length;
  let phase: EwPhase = 'unknown';
  let isBullish = true;
  let confidence = 0;
  let trendBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  if (count >= 4) {
    const recent = pivots.slice(Math.max(0, count - 6));
    const highs = recent.filter((p) => p.isHigh).map((p) => p.price);
    const lows = recent.filter((p) => !p.isHigh).map((p) => p.price);

    if (highs.length >= 2 && lows.length >= 2) {
      let hh = 0;
      let lh = 0;
      let hl = 0;
      let ll = 0;
      for (let i = 1; i < highs.length; i++) (highs[i] > highs[i - 1] ? hh++ : lh++);
      for (let i = 1; i < lows.length; i++) (lows[i] > lows[i - 1] ? hl++ : ll++);

      const bullPoints = hh + hl;
      const bearPoints = lh + ll;
      const total = bullPoints + bearPoints;

      if (total > 0) {
        if (bullPoints !== bearPoints) {
          const winning = bullPoints > bearPoints ? bullPoints : bearPoints;
          isBullish = bullPoints > bearPoints;
          trendBias = isBullish ? 'bullish' : 'bearish';
          // ⚠️ Pine මුල් පිටපතේ මේක `int / int` — Pine එකේ ඒක integer
          // division, ඒ නිසා ratio එක හැමවිටම 0 හෝ 1. 0.8/0.6 thresholds
          // තියෙන්නේ float එකක් අපේක්ෂා කරලා, ඒ නිසා මෙතන float division.
          const ratio = winning / total;
          if (ratio >= 0.8) {
            phase = 'motive';
            confidence = 0.7 + (ratio - 0.8) * 1.5;
          } else if (ratio >= 0.6) {
            phase = 'motive';
            confidence = 0.4 + (ratio - 0.6) * 1.5;
          } else {
            phase = 'corrective';
            confidence = 0.3;
          }
        } else {
          phase = 'corrective';
          trendBias = 'neutral';
          confidence = 0.2;
        }
      }

      // Overlap එකක් තියෙනවා නම් ඒක corrective ලක්ෂණයක් — motive කියලා
      // තීරණය කරලා තිබ්බත් ආපහු පහත් කරනවා.
      const recentHigh = highs[highs.length - 1];
      const prevHigh = highs[highs.length - 2];
      const recentLow = lows[lows.length - 1];
      const prevLow = lows[lows.length - 2];
      if (isBullish && recentLow < prevHigh) {
        if (phase === 'motive') {
          phase = 'corrective';
          confidence *= 0.7;
        }
      } else if (!isBullish && recentHigh > prevLow) {
        if (phase === 'motive') {
          phase = 'corrective';
          confidence *= 0.7;
        }
      }
    }
  } else if (count >= 2) {
    isBullish = pivots[count - 1].price > pivots[count - 2].price;
    trendBias = isBullish ? 'bullish' : 'bearish';
    phase = 'unknown';
    confidence = 0.1;
  }

  return { phase, isBullish, confidence: Math.min(confidence, 1), trendBias };
}

/** HTF එකක් විශ්ලේෂණය — pattern එකක්, නැත්නම් trend structure එකක්. */
function analyzeHtf(pivots: EwPivot[], o: EwOptions): EwHtfContext {
  const ctx: EwHtfContext = {
    phase: 'unknown',
    pattern: 'none',
    isBullish: true,
    confidence: 0,
    pivotCount: pivots.length,
    trendBias: 'neutral',
  };
  if (pivots.length < 3) return ctx;

  // HTF එකේ sub-wave counting නෑ — ඒ degree එකේ secondary pivots නෑ.
  const best = detectBest(pivots, [], o);

  if (best) {
    const isCorrective =
      best.patternType === 'zigzag' ||
      best.patternType.includes('flat') ||
      best.patternType === 'triangle';
    ctx.phase = isCorrective ? 'corrective' : 'motive';
    ctx.pattern = best.patternType;
    ctx.isBullish = best.isBullish;
    ctx.confidence = best.confidence;
    ctx.trendBias = best.isBullish ? 'bullish' : 'bearish';
  } else {
    const t = classifyTrendStructure(pivots);
    ctx.phase = t.phase;
    ctx.pattern = t.phase === 'motive' ? (t.isBullish ? 'trend_up' : 'trend_down') : 'ranging';
    ctx.isBullish = t.isBullish;
    ctx.confidence = t.confidence;
    ctx.trendBias = t.trendBias;
  }
  return ctx;
}

// ── MTF alignment ─────────────────────────────────────────────────────

/**
 * CTF pattern එක HTF දෙකට සසඳලා -1..+1 score එකක්.
 *
 * මානය දෙකක්:
 *   • දිශාව — දෙකම එකම පැත්තටද
 *   • Phase coherence — HTF impulse එකක් ඇතුළේ CTF correction එකක්
 *     (සාමාන්‍යයි) ද, නැත්නම් HTF corrective එකකට එරෙහිව CTF impulse
 *     එකක් (දුර්වලයි) ද
 */
function computeAlignment(
  pattern: EwPattern | null,
  ctfPhase: EwPhase,
  htf1: EwHtfContext,
  htf2: EwHtfContext,
): { score: number; label: EwAlignmentLabel } {
  if (!pattern) return { score: 0, label: 'N/A' };

  const scoreOne = (htf: EwHtfContext): number | null => {
    if (htf.pivotCount < 3 || htf.confidence <= 0.1) return null;
    let s = pattern.isBullish === htf.isBullish ? 0.5 : -0.5;

    if (ctfPhase === 'corrective' && htf.phase === 'motive') {
      // ලොකු impulse එකක් ඇතුළේ පොඩි correction එකක් — නිකම්ම සාමාන්‍යයි.
      s += 0.5;
    } else if (ctfPhase === 'motive' && htf.phase === 'corrective') {
      // ලොකු correction එකකට එරෙහිව පොඩි impulse එකක් — දුර්වලයි.
      s -= 0.5;
    } else if (ctfPhase === htf.phase) {
      s += 0.25;
    }

    return Math.max(-1, Math.min(1, s));
  };

  const scores = [scoreOne(htf1), scoreOne(htf2)].filter((s): s is number => s !== null);
  if (scores.length === 0) return { score: 0, label: 'N/A' };

  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const label: EwAlignmentLabel =
    score >= 0.5 ? 'ALIGNED' : score >= 0.15 ? 'PARTIAL' : score <= -0.35 ? 'CONFLICTING' : 'NEUTRAL';
  return { score, label };
}

// ── Fibonacci ─────────────────────────────────────────────────────────

/**
 * Retracements අන්තිම සම්පූර්ණ wave එකෙන්; extensions නම් **හරි Elliott
 * ක්‍රමයට** — කලින් impulse එකේ දිග, corrective එක ඉවර වුණු තැනින්
 * ප්‍රක්ෂේපණය කරනවා (අහඹු reference එකකින් නෙවෙයි).
 */
function buildFib(pattern: EwPattern | null, showRetrace: boolean, showExt: boolean): EwFibLevel[] {
  if (!pattern || pattern.waves.length < 2) return [];
  const levels: EwFibLevel[] = [];
  const waves = pattern.waves;
  const lastWave = waves[waves.length - 1];

  if (showRetrace) {
    const from = lastWave.startPrice;
    const to = lastWave.endPrice;
    for (const ratio of FIB_RETRACE) {
      levels.push({ ratio, price: to - (to - from) * ratio, kind: 'retracement' });
    }
  }

  if (showExt) {
    // අන්තිම motive wave එකේ දිග, අන්තිම corrective එක ඉවර වුණු තැනින්.
    let impulseLen = Math.abs(lastWave.endPrice - lastWave.startPrice);
    let anchor = lastWave.endPrice;
    let direction = lastWave.endPrice >= lastWave.startPrice ? 1 : -1;

    const lastMotive = [...waves].reverse().find((w) => w.isMotive);
    const lastCorrective = [...waves].reverse().find((w) => !w.isMotive);
    if (lastMotive && lastCorrective && lastCorrective.endIndex > lastMotive.startIndex) {
      impulseLen = Math.abs(lastMotive.endPrice - lastMotive.startPrice);
      anchor = lastCorrective.endPrice;
      direction = lastMotive.endPrice >= lastMotive.startPrice ? 1 : -1;
    }
    for (const ratio of FIB_EXTEND) {
      levels.push({ ratio, price: anchor + direction * impulseLen * ratio, kind: 'extension' });
    }
  }

  return levels;
}

// ── Forecast ──────────────────────────────────────────────────────────

function buildForecast(
  pattern: EwPattern | null,
  pivots: EwPivot[],
  lastClose: number,
  mtf: EwMtf | null,
): EwForecast | null {
  if (pivots.length < 2) return null;

  let mtfNote = '';
  if (mtf && mtf.label !== 'N/A') {
    if (mtf.label === 'CONFLICTING') mtfNote = '⚠ Counter-trend to HTF';
    else if (mtf.label === 'ALIGNED') mtfNote = '✓ HTF trend supports entry';
    else if (mtf.label === 'PARTIAL') mtfNote = '✓ HTF partially supports';
  }

  if (!pattern) {
    // Pattern එකක් නෑ — pivot geometry එකෙන් පරිස්සමෙන් කියන්න පුළුවන් දේ
    // විතරයි. "Wave 3 පටන් ගන්නවා!" වගේ කතා නෑ.
    const last = pivots[pivots.length - 1];
    const prev = pivots[pivots.length - 2];
    const rising = last.price > prev.price;
    const leg = Math.abs(last.price - prev.price);
    return {
      nextWave: 'Unknown',
      scenario: rising
        ? 'Price structure rising — no validated wave count'
        : 'Price structure falling — no validated wave count',
      targetHigh: lastClose + leg * 0.5,
      targetLow: lastClose - leg * 0.5,
      stopLevel: rising ? prev.price : prev.price,
      stars: 1,
      confirmed: false,
      mtfNote,
    };
  }

  const waves = pattern.waves;
  const lastWave = waves[waves.length - 1];
  const corrective =
    pattern.patternType === 'zigzag' ||
    pattern.patternType.includes('flat') ||
    pattern.patternType === 'triangle';

  // Confidence → තරු (HTF එකඟතාවෙන් උස්/පහත් වෙනවා).
  let stars = Math.round(pattern.confidence * 5);
  if (mtf) {
    if (mtf.label === 'ALIGNED') stars += 1;
    else if (mtf.label === 'CONFLICTING') stars -= 1;
  }
  stars = Math.max(1, Math.min(5, stars));

  if (corrective) {
    // Correction එකක් ඉවරයි — ඊළඟට ඒ දිශාවට impulse එකක්.
    const aWave = waves[0];
    const impulseLen = Math.abs(aWave.endPrice - aWave.startPrice);
    const up = pattern.isBullish;
    const dir = up ? 1 : -1;
    return {
      nextWave: `Wave 1 (impulse, ${up ? 'up' : 'down'})`,
      scenario: `${pattern.patternType} correction complete — expecting impulse ${up ? 'higher' : 'lower'}`,
      targetHigh: up ? lastClose + impulseLen * 1.618 : lastClose - impulseLen * 0.618,
      targetLow: up ? lastClose + impulseLen * 0.618 : lastClose - impulseLen * 1.618,
      stopLevel: lastWave.endPrice - dir * impulseLen * 0.2,
      stars,
      confirmed: true,
      mtfNote,
    };
  }

  // Impulse/diagonal එකක් ඉවරයි — ඊළඟට correction එකක්.
  const w1 = waves[0];
  const impulseRange = Math.abs(pattern.waves[4].endPrice - w1.startPrice);
  const up = pattern.isBullish;
  const dir = up ? 1 : -1;
  return {
    nextWave: 'Wave A (correction)',
    scenario: `${pattern.patternType} complete — expecting corrective phase ${up ? 'lower' : 'higher'}`,
    targetHigh: lastWave.endPrice - dir * impulseRange * 0.382,
    targetLow: lastWave.endPrice - dir * impulseRange * 0.618,
    stopLevel: lastWave.endPrice + dir * impulseRange * 0.1,
    stars,
    confirmed: true,
    mtfNote,
  };
}

// ── Signals ───────────────────────────────────────────────────────────

/**
 * Signals 3යි, හැම එකකටම pattern confirmation එකක් ඕන. Count එක ගැන
 * විශ්වාසයක් නැත්නම් entry එකක් දෙන්නේ නෑ.
 */
function buildSignals(
  pattern: EwPattern | null,
  o: EwOptions,
  mtf: EwMtf | null,
): EwSignal[] {
  if (!pattern || !o.enableSignals) return [];
  const signals: EwSignal[] = [];
  const conflicting = mtf?.label === 'CONFLICTING';
  const waves = pattern.waves;

  if (pattern.patternType === 'impulse' || pattern.patternType === 'diagonal') {
    // Wave 3 Entry — Wave 2 හරියට retrace වුණාද (38.2-78.6%) + විශ්වාසය.
    const w2 = waves[1];
    if (w2 && w2.retracePct >= 38.2 && w2.retracePct <= 78.6 && pattern.confidence >= 0.5) {
      signals.push({
        index: w2.endIndex,
        kind: 'Wave 3 Entry',
        isBullish: pattern.isBullish,
        price: w2.endPrice,
        // MTF ගැටුමක් තියෙනකොට ලොකු structure එකට එරෙහිව entry නෑ.
        gated: conflicting,
      });
    }

    // Wave 5 Exit — momentum අඩු වෙනවා (අන්තිම wave එක මුළු චලනයට වඩා කොටයි).
    const w5 = waves[4];
    if (w5) {
      const w5Len = Math.abs(w5.endPrice - w5.startPrice);
      const total = Math.abs(w5.endPrice - waves[0].startPrice);
      if (total > 0 && w5Len / total < 0.35) {
        signals.push({
          index: w5.endIndex,
          kind: 'Wave 5 Exit',
          isBullish: !pattern.isBullish,
          price: w5.endPrice,
          gated: false, // exit signal එකක් — MTF ගැටුමකින් මර්දනය වෙන්නේ නෑ
        });
      }
    }
  }

  // Wave C Reversal — validate වුණු zigzag/flat එකක් ඉවරයි.
  if (pattern.patternType === 'zigzag' || pattern.patternType.includes('flat')) {
    const c = waves[2];
    if (c) {
      signals.push({
        index: c.endIndex,
        kind: 'Wave C Reversal',
        isBullish: pattern.isBullish,
        price: c.endPrice,
        gated: conflicting,
      });
    }
  }

  return signals;
}

// ── Main ──────────────────────────────────────────────────────────────

export function computeElliottWave(
  candles: Candle[],
  o: EwOptions,
  htf1Candles: Candle[] = [],
  htf2Candles: Candle[] = [],
  fib: { retracements: boolean; extensions: boolean } = { retracements: true, extensions: true },
): EwResult {
  const empty: EwResult = {
    primaryPivots: [],
    secondaryPivots: [],
    pattern: null,
    mtf: null,
    fib: [],
    forecast: null,
    signals: [],
    rawConfidence: 0,
  };
  if (candles.length < o.primarySwingLength * 2 + 2) return empty;

  const primaryPivots = collectPivots(candles, o.primarySwingLength, o.minSwingPct);
  const secondaryPivots = collectPivots(candles, o.secondarySwingLength, o.minSubSwingPct);

  const pattern = detectBest(primaryPivots, secondaryPivots, o);
  const rawConfidence = pattern?.confidence ?? 0;

  // ── MTF ────────────────────────────────────────────────────────────
  let mtf: EwMtf | null = null;
  if (o.useMtf && (htf1Candles.length > 0 || htf2Candles.length > 0)) {
    const htf1 = analyzeHtf(collectPivots(htf1Candles, o.htfSwingLength, o.htfMinSwingPct), o);
    const htf2 = analyzeHtf(collectPivots(htf2Candles, o.htfSwingLength, o.htfMinSwingPct), o);
    const ctfPhase: EwPhase = pattern
      ? pattern.patternType === 'impulse' || pattern.patternType === 'diagonal'
        ? 'motive'
        : 'corrective'
      : 'unknown';
    const { score, label } = computeAlignment(pattern, ctfPhase, htf1, htf2);
    mtf = { htf1, htf2, score, label };

    // HTF එකඟ නම් confidence එක උස්සනවා, ගැටුමක් නම් අඩු කරනවා.
    if (pattern && o.htfConfidenceWeight > 0 && label !== 'N/A') {
      pattern.confidence = Math.max(
        0,
        Math.min(1, pattern.confidence * (1 + score * o.htfConfidenceWeight)),
      );
    }
  }

  const lastClose = candles[candles.length - 1].close;
  return {
    primaryPivots,
    secondaryPivots,
    pattern,
    mtf,
    fib: buildFib(pattern, fib.retracements, fib.extensions),
    forecast: buildForecast(pattern, primaryPivots, lastClose, mtf),
    signals: buildSignals(pattern, o, mtf),
    rawConfidence,
  };
}
