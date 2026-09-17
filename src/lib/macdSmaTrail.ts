import { atrArray } from './indicators';
import { computeMacdSma, type MacdSmaOptions } from './macdSma';
import type { Candle } from './types';

/**
 * MACD + SMA 200 signals එකට **trailing stop** එකක් දාලා, ලාභ/පාඩුව
 * මනිනවා.
 *
 * Entry එක: ChartArt ගේ Bullish/Bearish signal එක (macdSma.ts).
 * Exit එක මෙතන — පිළිවෙළට:
 *
 *   1. Stop එක (මුලදී ATR එකකින්, පස්සේ trail වෙනවා)
 *   2. Take profit එකක් තියෙනවා නම් ඒක
 *   3. විරුද්ධ signal එකක් ආවොත් (ඕන නම්)
 *
 * ⚠️ Bar එකක් ඇතුළේ stop එකයි TP එකයි දෙකම වැදුනොත් **stop එක කලින්**
 *    කියලා ගන්නවා — candle data එකෙන් ඇත්ත පිළිවෙළ දැනගන්න බෑ, ඒ නිසා
 *    ප්‍රතිඵල අලංකාර කරනවාට වඩා පරිස්සම් වීම හොඳයි.
 *
 * ⚠️ Entry එක signal bar එකේ close එකට. මුල් Pine strategy එකේ
 *    `stop=low` කියන pending order එකක් — ඒක fill වෙන්නේ කවදාද කියන එක
 *    strategy engine එකක වැඩක්, ඒ නිසා මෙතන සරල, අවංක model එකක්.
 */

export type ExitReason = 'stop' | 'trail' | 'target' | 'opposite' | 'open';

export interface TrailOptions {
  signal: MacdSmaOptions;
  atrLength: number;
  /** මුල් stop එක entry එකෙන් කොච්චර ඈතද (×ATR). */
  initialSlAtr: number;
  /** Trail දුර (×ATR). 0 = trail නෑ. */
  trailAtr: number;
  /** ලාභය මෙච්චර R එකක් වුණාට පස්සේ trail පටන් ගන්නවා. */
  trailAfterR: number;
  /** ස්ථිර take profit (R). 0 = නෑ, trail එකට භාරයි. */
  takeProfitR: number;
  /** විරුද්ධ signal එකකදී අයින් වෙනවද. */
  exitOnOpposite: boolean;
  /** පැත්තකට fee (%). */
  feePct: number;
  /** Risk එක price එකෙන් මීට වඩා නම් trade එක අත්හරිනවා (%). */
  maxRiskPct: number;
}

export const TRAIL_DEFAULTS: Omit<TrailOptions, 'signal'> = {
  atrLength: 14,
  initialSlAtr: 2,
  trailAtr: 3,
  trailAfterR: 0,
  takeProfitR: 0,
  exitOnOpposite: true,
  feePct: 0.045,
  maxRiskPct: 10,
};

export interface TrailTrade {
  index: number;
  dir: 1 | -1;
  entry: number;
  /** මුල් stop එක (risk එක මනින්නේ මේකෙන්). */
  initialSl: number;
  /** අවසානයේ stop එක තිබුණු තැන. */
  finalSl: number;
  exitIndex: number;
  exitPrice: number;
  reason: ExitReason;
  /** R වලින් ප්‍රතිඵලය — fees ඇතුළත්ව. */
  r: number;
  /** Trade එක ඇතුළේ ගිය හොඳම දුර (R) — trail එකෙන් කොච්චර අල්ලගත්තාද බලන්න. */
  maxFavorableR: number;
  /** Bar එකෙන් bar එකට stop එක තිබුණු තැන (chart එකේ අඳින්න). */
  stopPath: { index: number; price: number }[];
}

export interface TrailStats {
  trades: number;
  wins: number;
  winRate: number;
  /** Trade එකකට සාමාන්‍යය, R වලින් (fees ඇතුළත්ව). මේකයි ලාභ/පාඩුව. */
  expectancy: number;
  totalR: number;
  avgWinR: number;
  avgLossR: number;
  /** ලාභ එකතුව ÷ පාඩු එකතුව. 1ට වඩා වැඩි නම් ලාභදායී. */
  profitFactor: number;
  /** Equity curve එකේ ලොකුම වැටීම (R). */
  maxDrawdownR: number;
  /** Trade එකකට සාමාන්‍ය fee (R). */
  feeR: number;
  /** Exit එක වුණේ මොකෙන්ද කියන ගණන. */
  byReason: Record<ExitReason, number>;
  /** Trail එකෙන් අල්ලගත්ත ලාභයේ කොටස — exit R ÷ හොඳම R. */
  captureRatio: number;
}

export interface TrailResult {
  trades: TrailTrade[];
  stats: TrailStats;
  /** වෙනස් exit ක්‍රම කිහිපයක් — කොයි එකද හොඳ කියලා බලන්න. */
  comparison: { name: string; stats: TrailStats }[];
}

function emptyStats(): TrailStats {
  return {
    trades: 0, wins: 0, winRate: 0, expectancy: 0, totalR: 0,
    avgWinR: 0, avgLossR: 0, profitFactor: 0, maxDrawdownR: 0, feeR: 0,
    byReason: { stop: 0, trail: 0, target: 0, opposite: 0, open: 0 },
    captureRatio: 0,
  };
}

function summarise(trades: TrailTrade[]): TrailStats {
  const closed = trades.filter((t) => t.reason !== 'open');
  const s = emptyStats();
  for (const t of trades) s.byReason[t.reason]++;
  if (closed.length === 0) return s;

  const wins = closed.filter((t) => t.r > 0);
  const losses = closed.filter((t) => t.r <= 0);
  const grossWin = wins.reduce((a, t) => a + t.r, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.r, 0);
  const totalR = closed.reduce((a, t) => a + t.r, 0);

  let peak = 0;
  let equity = 0;
  let maxDd = 0;
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
  s.avgWinR = wins.length ? grossWin / wins.length : 0;
  s.avgLossR = losses.length ? -grossLoss / losses.length : 0;
  s.profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  s.maxDrawdownR = maxDd;
  s.captureRatio = capturable.length
    ? capturable.reduce((a, t) => a + t.r / t.maxFavorableR, 0) / capturable.length
    : 0;
  return s;
}

/** Signal එකකින් trade එකක් දුවවනවා. */
function runTrade(
  candles: Candle[],
  atr: number[],
  i: number,
  dir: 1 | -1,
  o: TrailOptions,
  /** විරුද්ධ signal එන bar indices (exitOnOpposite එකට). */
  opposite: Set<number>,
): TrailTrade | null {
  const a = atr[i];
  if (!(a > 0)) return null;

  const entry = candles[i].close;
  const risk = a * o.initialSlAtr;
  if (!(risk > 0) || (risk / entry) * 100 > o.maxRiskPct) return null;

  const initialSl = entry - dir * risk;
  const target = o.takeProfitR > 0 ? entry + dir * risk * o.takeProfitR : NaN;
  const feeR = ((o.feePct * 2) / 100) * (entry / risk);

  let stop = initialSl;
  let best = 0; // R වලින් හොඳම චලනය
  let trailed = false;
  const stopPath: { index: number; price: number }[] = [{ index: i, price: stop }];

  for (let j = i + 1; j < candles.length; j++) {
    const b = candles[j];

    // 1. Stop — bar එකේ අනිත් දේට කලින්.
    const stopHit = dir === 1 ? b.low <= stop : b.high >= stop;
    if (stopHit) {
      const r = ((stop - entry) * dir) / risk - feeR;
      return {
        index: i, dir, entry, initialSl, finalSl: stop,
        exitIndex: j, exitPrice: stop,
        reason: trailed && Math.abs(stop - initialSl) > 1e-12 ? 'trail' : 'stop',
        r, maxFavorableR: best, stopPath,
      };
    }

    // 2. Take profit
    if (!Number.isNaN(target) && (dir === 1 ? b.high >= target : b.low <= target)) {
      const r = o.takeProfitR - feeR;
      return {
        index: i, dir, entry, initialSl, finalSl: stop,
        exitIndex: j, exitPrice: target, reason: 'target',
        r, maxFavorableR: Math.max(best, o.takeProfitR), stopPath,
      };
    }

    // හොඳම චලනය යාවත්කාලීන
    const reach = (((dir === 1 ? b.high : b.low) - entry) * dir) / risk;
    if (reach > best) best = reach;

    // 3. Trail — ලාභය දිහාවට විතරයි, ආපහු නෑ.
    if (o.trailAtr > 0 && best >= o.trailAfterR) {
      const at = atr[j] > 0 ? atr[j] : a;
      const candidate = dir === 1 ? b.high - at * o.trailAtr : b.low + at * o.trailAtr;
      if (dir === 1 ? candidate > stop : candidate < stop) {
        stop = candidate;
        trailed = true;
        stopPath.push({ index: j, price: stop });
      }
    }

    // 4. විරුද්ධ signal එකක්
    if (o.exitOnOpposite && opposite.has(j)) {
      const r = ((b.close - entry) * dir) / risk - feeR;
      return {
        index: i, dir, entry, initialSl, finalSl: stop,
        exitIndex: j, exitPrice: b.close, reason: 'opposite',
        r, maxFavorableR: best, stopPath,
      };
    }
  }

  // තාම වහලා නෑ
  const lastBar = candles[candles.length - 1];
  return {
    index: i, dir, entry, initialSl, finalSl: stop,
    exitIndex: candles.length - 1, exitPrice: lastBar.close,
    reason: 'open',
    r: ((lastBar.close - entry) * dir) / risk - feeR,
    maxFavorableR: best, stopPath,
  };
}

function runAll(candles: Candle[], atr: number[], signals: { index: number; dir: 1 | -1 }[], o: TrailOptions) {
  const trades: TrailTrade[] = [];
  let busyUntil = -1;
  for (const s of signals) {
    if (s.index <= busyUntil) continue;
    // විරුද්ධ පැත්තේ signals — exitOnOpposite එකට
    const opposite = new Set(signals.filter((x) => x.dir !== s.dir).map((x) => x.index));
    const t = runTrade(candles, atr, s.index, s.dir, o, opposite);
    if (!t) continue;
    trades.push(t);
    busyUntil = t.exitIndex;
  }
  return trades;
}

export function computeMacdSmaTrail(candles: Candle[], o: TrailOptions): TrailResult {
  if (candles.length < 60) {
    return { trades: [], stats: emptyStats(), comparison: [] };
  }

  const base = computeMacdSma(candles, o.signal);
  const signals = base.signals.map((s) => ({ index: s.index, dir: s.dir }));
  const atr = atrArray(candles, o.atrLength);

  const trades = runAll(candles, atr, signals, o);

  // වෙනස් exit ක්‍රම — trail එකෙන් ඇත්තටම වෙනසක් වෙනවද බලන්න.
  const variants: { name: string; opts: Partial<TrailOptions> }[] = [
    { name: 'Trail 2×ATR', opts: { trailAtr: 2, takeProfitR: 0 } },
    { name: 'Trail 3×ATR', opts: { trailAtr: 3, takeProfitR: 0 } },
    { name: 'Trail 5×ATR', opts: { trailAtr: 5, takeProfitR: 0 } },
    { name: 'Fixed TP 1R', opts: { trailAtr: 0, takeProfitR: 1 } },
    { name: 'Fixed TP 2R', opts: { trailAtr: 0, takeProfitR: 2 } },
    { name: 'Fixed TP 3R', opts: { trailAtr: 0, takeProfitR: 3 } },
    { name: 'No exit rule', opts: { trailAtr: 0, takeProfitR: 0 } },
  ];
  const comparison = variants.map((v) => ({
    name: v.name,
    stats: summarise(runAll(candles, atr, signals, { ...o, ...v.opts })),
  }));

  return { trades, stats: summarise(trades), comparison };
}
