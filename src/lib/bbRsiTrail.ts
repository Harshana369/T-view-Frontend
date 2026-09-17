import { computeBbRsi, type BbRsiOptions } from './bbRsi';
import { atrArray } from './indicators';
import type { Candle } from './types';

/**
 * Bollinger + RSI signals එකට **අදියර දෙකක exit** එකක්.
 *
 * Trade එකක ජීවිතය:
 *
 *   1. **මුල් SL** — entry එකෙන් ATR කිහිපයක් ඈතින්.
 *   2. **Break-even** — ලාභය `breakEvenAtR` ක් වුණාම SL එක **entry එකට**
 *      ගෙනෙනවා. ඊට පස්සේ SL එක වැදුනත් **පාඩුවක් නෑ**.
 *   3. **Trail** — ලාභය `trailAfterR` ක් වුණාම, SL එක හොඳම මිලෙන්
 *      `trailAtr × ATR` ක් පිටිපස්සෙන් ඇදෙනවා. Short එකකදී ඒක entry
 *      එකට **පහළින්** යනවා (= අගුළු දාපු ලාභයක්), long එකකදී උඩින්.
 *
 * SL එක **කිසිදාක පිටිපස්සට යන්නේ නෑ** — ලාභය දිහාවට විතරයි.
 *
 * ⚠️ Bar එකක් ඇතුළේ SL එකයි TP එකයි දෙකම වැදුනොත් **SL එක කලින්** කියලා
 *    ගන්නවා. Candle එකකින් ඇත්ත පිළිවෙළ දැනගන්න බෑ, ඒ නිසා ප්‍රතිඵල
 *    අලංකාර කරනවාට වඩා පරිස්සම් වීම හොඳයි.
 */

export type BbExitReason =
  | 'stop'       // මුල් SL එක — පාඩුවක්
  | 'breakeven'  // BE එකට ගෙනාපු SL එක — පාඩුවක් නෑ
  | 'trail'      // trail වෙච්ච SL එක — ලාභයක්
  | 'target'
  | 'opposite'
  | 'open';

export interface BbRsiTrailOptions {
  signal: BbRsiOptions;
  direction: 'both' | 'long' | 'short';
  atrLength: number;
  /** මුල් SL එක entry එකෙන් කොච්චර ඈතද (×ATR). */
  initialSlAtr: number;
  /** ලාභය මෙච්චර R එකක් වුණාම SL එක entry එකට. 0 = break-even නෑ. */
  breakEvenAtR: number;
  /** BE එකේදී entry එකට වඩා ටිකක් ලාභ පැත්තට (fees ආවරණය කරන්න). */
  breakEvenBufferR: number;
  /** ලාභය මෙච්චර R එකක් වුණාම trail පටන් ගන්නවා. */
  trailAfterR: number;
  /** Trail දුර (×ATR). 0 = trail නෑ, BE එකේ නවතිනවා. */
  trailAtr: number;
  /** ස්ථිර take profit (R). 0 = නෑ. */
  takeProfitR: number;
  exitOnOpposite: boolean;
  feePct: number;
  maxRiskPct: number;
}

export const BB_TRAIL_DEFAULTS: Omit<BbRsiTrailOptions, 'signal'> = {
  direction: 'both',
  atrLength: 14,
  initialSlAtr: 2,
  breakEvenAtR: 1,
  breakEvenBufferR: 0.1,
  trailAfterR: 1.5,
  trailAtr: 2,
  takeProfitR: 0,
  exitOnOpposite: true,
  feePct: 0.045,
  maxRiskPct: 10,
};

export interface BbTrade {
  index: number;
  dir: 1 | -1;
  entry: number;
  initialSl: number;
  finalSl: number;
  exitIndex: number;
  exitPrice: number;
  reason: BbExitReason;
  /** R වලින් ප්‍රතිඵලය — fees ඇතුළත්ව. */
  r: number;
  /** Trade එක ඇතුළේ ගිය හොඳම දුර (R). */
  maxFavorableR: number;
  /** Break-even එකට ගියාද. */
  reachedBreakEven: boolean;
  /** Trail පටන් ගත්තාද. */
  startedTrailing: boolean;
  /** SL එක ගමන් කරපු මග — chart එකේ පඩිපෙළ අඳින්න. */
  stopPath: { index: number; price: number }[];
}

export interface BbTrailStats {
  trades: number;
  wins: number;
  winRate: number;
  expectancy: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgWinR: number;
  avgLossR: number;
  byReason: Record<BbExitReason, number>;
  /**
   * Break-even එකට ගිහින්, ඊට පස්සේ SL එක වැදුනු trades. මේවා
   * break-even නැත්නම් **පාඩු** වෙන්න තිබුණු ඒවා.
   */
  savedByBreakEven: number;
  /** හොඳම චලනයෙන් අල්ලගත්ත කොටස. */
  captureRatio: number;
}

export interface BbTrailResult {
  trades: BbTrade[];
  stats: BbTrailStats;
  longStats: BbTrailStats;
  shortStats: BbTrailStats;
  /** Break-even එක තිබ්බම/නැතුව — ඒකෙන් ඇත්තටම වෙනසක් වෙනවද. */
  comparison: { name: string; stats: BbTrailStats }[];
}

function emptyStats(): BbTrailStats {
  return {
    trades: 0, wins: 0, winRate: 0, expectancy: 0, totalR: 0,
    profitFactor: 0, maxDrawdownR: 0, avgWinR: 0, avgLossR: 0,
    byReason: { stop: 0, breakeven: 0, trail: 0, target: 0, opposite: 0, open: 0 },
    savedByBreakEven: 0, captureRatio: 0,
  };
}

function summarise(trades: BbTrade[]): BbTrailStats {
  const s = emptyStats();
  for (const t of trades) s.byReason[t.reason]++;
  const closed = trades.filter((t) => t.reason !== 'open');
  if (closed.length === 0) return s;

  const wins = closed.filter((t) => t.r > 0);
  const losses = closed.filter((t) => t.r <= 0);
  const gw = wins.reduce((a, t) => a + t.r, 0);
  const gl = -losses.reduce((a, t) => a + t.r, 0);
  const totalR = closed.reduce((a, t) => a + t.r, 0);

  let peak = 0, equity = 0, maxDd = 0;
  for (const t of closed) {
    equity += t.r;
    if (equity > peak) peak = equity;
    maxDd = Math.max(maxDd, peak - equity);
  }

  const capturable = closed.filter((t) => t.maxFavorableR > 0.1);
  s.trades = closed.length;
  s.wins = wins.length;
  s.winRate = (wins.length / closed.length) * 100;
  s.expectancy = totalR / closed.length;
  s.totalR = totalR;
  s.avgWinR = wins.length ? gw / wins.length : 0;
  s.avgLossR = losses.length ? -gl / losses.length : 0;
  s.profitFactor = gl > 0 ? gw / gl : gw > 0 ? Infinity : 0;
  s.maxDrawdownR = maxDd;
  s.savedByBreakEven = closed.filter((t) => t.reason === 'breakeven').length;
  s.captureRatio = capturable.length
    ? capturable.reduce((a, t) => a + t.r / t.maxFavorableR, 0) / capturable.length
    : 0;
  return s;
}

function runTrade(
  candles: Candle[],
  atr: number[],
  i: number,
  dir: 1 | -1,
  o: BbRsiTrailOptions,
  opposite: Set<number>,
): BbTrade | null {
  const a = atr[i];
  if (!(a > 0)) return null;

  const entry = candles[i].close;
  const risk = a * o.initialSlAtr;
  if (!(risk > 0) || (risk / entry) * 100 > o.maxRiskPct) return null;

  const initialSl = entry - dir * risk;
  const target = o.takeProfitR > 0 ? entry + dir * risk * o.takeProfitR : NaN;
  const feeR = ((o.feePct * 2) / 100) * (entry / risk);

  let stop = initialSl;
  let best = 0;
  let reachedBreakEven = false;
  let startedTrailing = false;
  const stopPath: { index: number; price: number }[] = [{ index: i, price: stop }];

  const finish = (j: number, price: number, reason: BbExitReason): BbTrade => ({
    index: i, dir, entry, initialSl, finalSl: stop,
    exitIndex: j, exitPrice: price, reason,
    r: ((price - entry) * dir) / risk - feeR,
    maxFavorableR: best, reachedBreakEven, startedTrailing, stopPath,
  });

  for (let j = i + 1; j < candles.length; j++) {
    const b = candles[j];

    // 1. SL එක — bar එකේ අනිත් දේට කලින්.
    if (dir === 1 ? b.low <= stop : b.high >= stop) {
      // SL එක තිබුණේ කොහෙද කියලා reason එක තීරණය වෙනවා:
      //   entry එකට එහා (ලාභ පැත්තේ) → trail
      //   entry එක ළඟ                → breakeven (පාඩුවක් නෑ)
      //   මුල් තැනේම                 → stop (පාඩුවක්)
      const beyondEntry = dir === 1 ? stop > entry : stop < entry;
      const reason: BbExitReason = startedTrailing && beyondEntry
        ? 'trail'
        : reachedBreakEven
          ? 'breakeven'
          : 'stop';
      return finish(j, stop, reason);
    }

    // 2. Take profit
    if (!Number.isNaN(target) && (dir === 1 ? b.high >= target : b.low <= target)) {
      return finish(j, target, 'target');
    }

    // හොඳම චලනය
    const reach = (((dir === 1 ? b.high : b.low) - entry) * dir) / risk;
    if (reach > best) best = reach;

    // 3. Break-even — ලාභය `breakEvenAtR` ක් වුණාම SL එක entry එකට.
    if (o.breakEvenAtR > 0 && !reachedBreakEven && best >= o.breakEvenAtR) {
      const be = entry + dir * risk * o.breakEvenBufferR;
      if (dir === 1 ? be > stop : be < stop) {
        stop = be;
        stopPath.push({ index: j, price: stop });
      }
      reachedBreakEven = true;
    }

    // 4. Trail — ලාභය දිහාවට විතරයි, ආපහු නෑ.
    if (o.trailAtr > 0 && best >= o.trailAfterR) {
      const at = atr[j] > 0 ? atr[j] : a;
      const candidate = dir === 1 ? b.high - at * o.trailAtr : b.low + at * o.trailAtr;
      if (dir === 1 ? candidate > stop : candidate < stop) {
        stop = candidate;
        startedTrailing = true;
        stopPath.push({ index: j, price: stop });
      }
    }

    // 5. විරුද්ධ signal එකක්
    if (o.exitOnOpposite && opposite.has(j)) return finish(j, b.close, 'opposite');
  }

  const lastBar = candles[candles.length - 1];
  return finish(candles.length - 1, lastBar.close, 'open');
}

function runAll(
  candles: Candle[],
  atr: number[],
  signals: { index: number; dir: 1 | -1 }[],
  o: BbRsiTrailOptions,
): BbTrade[] {
  const trades: BbTrade[] = [];
  let busyUntil = -1;
  for (const s of signals) {
    if (s.index <= busyUntil) continue;
    const opposite = new Set(signals.filter((x) => x.dir !== s.dir).map((x) => x.index));
    const t = runTrade(candles, atr, s.index, s.dir, o, opposite);
    if (!t) continue;
    trades.push(t);
    busyUntil = t.exitIndex;
  }
  return trades;
}

export function computeBbRsiTrail(candles: Candle[], o: BbRsiTrailOptions): BbTrailResult {
  if (candles.length < 60) {
    return {
      trades: [], stats: emptyStats(),
      longStats: emptyStats(), shortStats: emptyStats(), comparison: [],
    };
  }

  const base = computeBbRsi(candles, o.signal);
  const signals = base.signals
    .filter((s) =>
      o.direction === 'long' ? s.dir === 1 : o.direction === 'short' ? s.dir === -1 : true,
    )
    .map((s) => ({ index: s.index, dir: s.dir }));
  const atr = atrArray(candles, o.atrLength);

  const trades = runAll(candles, atr, signals, o);

  // Break-even එකෙන් ඇත්තටම වෙනසක් වෙනවද — ඒක මනින්න.
  const variants: { name: string; opts: Partial<BbRsiTrailOptions> }[] = [
    { name: 'BE + trail (current)', opts: {} },
    { name: 'BE only, no trail', opts: { trailAtr: 0 } },
    { name: 'Trail only, no BE', opts: { breakEvenAtR: 0 } },
    { name: 'Plain stop (no BE/trail)', opts: { breakEvenAtR: 0, trailAtr: 0 } },
  ];
  const comparison = variants.map((v) => ({
    name: v.name,
    stats: summarise(runAll(candles, atr, signals, { ...o, ...v.opts })),
  }));

  return {
    trades,
    stats: summarise(trades),
    longStats: summarise(trades.filter((t) => t.dir === 1)),
    shortStats: summarise(trades.filter((t) => t.dir === -1)),
    comparison,
  };
}
