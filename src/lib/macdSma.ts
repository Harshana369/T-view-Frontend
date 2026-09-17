import { smaArray } from './indicators';
import { sourceSeries } from './madLoop';
import type { Candle } from './types';

/**
 * "MACD + SMA 200 Strategy" (© ChartArt, 2015) එකේ port එක.
 *
 * ⚠️ මේකේ MACD එක **SMA වලින්** හදන එකක් — සාමාන්‍ය MACD එකේ වගේ EMA
 *    නෙවෙයි. මුල් script එකේ `sma(source, fastLength)` කියලා තියෙනවා,
 *    ඒ නිසා ඒක එහෙම්මම තියාගෙන තියෙනවා.
 *
 * Long signal එකක් එන්නේ මේ ඔක්කොම එකවර සපිරුණාම:
 *   • hist එක 0 පනිනවා (crossover)
 *   • macd > 0
 *   • fastMA > slowMA
 *   • `slowLength` bars කලින් තිබුණු close එක veryslowMA එකට උඩින්
 * Short එකට ඔක්කොම අනිත් පැත්තට.
 *
 * ⚠️ මුල් එක **strategy** එකක් — `strategy.entry(..., stop=low)` කියලා
 *    pending stop order එකක් තියනවා, `slowMA < veryslowMA` වුණාම ඒක
 *    cancel කරනවා, සහ 50% max intraday loss filter එකක් තියෙනවා. මේ
 *    app එක chart එකට indicators අඳිනවා මිසක් orders දුවවන්නේ නෑ, ඒ නිසා
 *    මෙතන තියෙන්නේ **signals සහ visuals** — fills, equity, drawdown නෑ.
 */

export type ChartArtColor = 'green' | 'red' | 'blue';

export interface MacdSmaOptions {
  source: string;
  fastLength: number;
  slowLength: number;
  signalLength: number;
  veryslowLength: number;
}

export interface MacdSmaSignal {
  index: number;
  dir: 1 | -1;
  /** Pine `stop=` අගය — long එකට `low`, short එකට `high`. */
  stop: number;
  /** ඒ bar එකේදීම cancel කොන්දේසිය සත්‍යද (`slowMA` vs `veryslowMA`). */
  cancelled: boolean;
}

export interface MacdSmaResult {
  fastMA: number[];
  slowMA: number[];
  veryslowMA: number[];
  macd: number[];
  signal: number[];
  hist: number[];
  /** fastMA/slowMA රේඛා වල පාට (Pine `trendcolor`). */
  trendColor: ChartArtColor[];
  /** Candles වල පාට (Pine `bartrendcolor`). */
  barColor: ChartArtColor[];
  /** veryslowMA එකේ පාට (Pine `MAtrendcolor`) — 'blue' එන්නේ නෑ. */
  maTrendColor: ChartArtColor[];
  /** Background එක පාට වෙන bars (Pine `backgroundcolor`). */
  background: (ChartArtColor | null)[];
  signals: MacdSmaSignal[];
}

/** Pine `change(x) > 0` — NaN තිබුණොත් false. */
function rising(values: number[], i: number): boolean {
  if (i === 0) return false;
  const a = values[i];
  const b = values[i - 1];
  return !Number.isNaN(a) && !Number.isNaN(b) && a - b > 0;
}

function falling(values: number[], i: number): boolean {
  if (i === 0) return false;
  const a = values[i];
  const b = values[i - 1];
  return !Number.isNaN(a) && !Number.isNaN(b) && a - b < 0;
}

export function computeMacdSma(candles: Candle[], o: MacdSmaOptions): MacdSmaResult {
  const n = candles.length;
  const src = sourceSeries(candles, o.source);

  // ⚠️ SMA — මුල් script එකේ ඒක එහෙමයි (EMA නෙවෙයි).
  const fastMA = smaArray(src, o.fastLength);
  const slowMA = smaArray(src, o.slowLength);
  const veryslowMA = smaArray(src, o.veryslowLength);
  const macd = fastMA.map((v, i) => v - slowMA[i]);
  const signal = smaArray(macd, o.signalLength);
  const hist = macd.map((v, i) => v - signal[i]);

  const trendColor = new Array<ChartArtColor>(n).fill('blue');
  const barColor = new Array<ChartArtColor>(n).fill('blue');
  const maTrendColor = new Array<ChartArtColor>(n).fill('red');
  const background = new Array<ChartArtColor | null>(n).fill(null);
  const signals: MacdSmaSignal[] = [];

  for (let i = 0; i < n; i++) {
    const close = candles[i].close;
    const veryslowUp = rising(veryslowMA, i);
    const veryslowDown = falling(veryslowMA, i);

    // MAtrendcolor = change(veryslowMA) > 0 ? green : red
    maTrendColor[i] = veryslowUp ? 'green' : 'red';

    // trendcolor
    if (fastMA[i] > slowMA[i] && veryslowUp && close > slowMA[i]) trendColor[i] = 'green';
    else if (fastMA[i] < slowMA[i] && veryslowDown && close < slowMA[i]) trendColor[i] = 'red';
    else trendColor[i] = 'blue';

    // bartrendcolor
    const slowUp = rising(slowMA, i);
    const slowDown = falling(slowMA, i);
    if (close > fastMA[i] && close > slowMA[i] && close > veryslowMA[i] && slowUp) {
      barColor[i] = 'green';
    } else if (close < fastMA[i] && close < slowMA[i] && close < veryslowMA[i] && slowDown) {
      barColor[i] = 'red';
    } else {
      barColor[i] = 'blue';
    }

    // crossover(hist, 0) / crossunder(hist, 0)
    const crossUp = i > 0 && hist[i] > 0 && !(hist[i - 1] > 0);
    const crossDown = i > 0 && hist[i] < 0 && !(hist[i - 1] < 0);

    // close[slowLength] — `slowLength` bars කලින් තිබුණු close එක
    const back = i - o.slowLength;
    const closeBack = back >= 0 ? candles[back].close : NaN;

    const longSetup =
      crossUp &&
      macd[i] > 0 &&
      fastMA[i] > slowMA[i] &&
      !Number.isNaN(closeBack) &&
      closeBack > veryslowMA[i];
    const shortSetup =
      crossDown &&
      macd[i] < 0 &&
      fastMA[i] < slowMA[i] &&
      !Number.isNaN(closeBack) &&
      closeBack < veryslowMA[i];

    // backgroundcolor — entry කොන්දේසියට `slowMA` vs `veryslowMA` එකත් එකතු.
    if (slowMA[i] > veryslowMA[i] && longSetup) background[i] = 'green';
    else if (slowMA[i] < veryslowMA[i] && shortSetup) background[i] = 'red';

    // Strategy entries. Pine එකේ cancel බ්ලොක් එක entry එකට කලින් දුවනවා,
    // ඒත් ඒකෙන් අවලංගු වෙන්නේ **කලින් තිබුණු** order එකයි — මේ bar එකේ
    // අලුත් එකක් තියෙන්න පුළුවන්. ඒ තත්ත්වය `cancelled` එකේ සලකුණු කරනවා.
    if (longSetup) {
      signals.push({
        index: i,
        dir: 1,
        stop: candles[i].low,
        cancelled: slowMA[i] < veryslowMA[i],
      });
    }
    if (shortSetup) {
      signals.push({
        index: i,
        dir: -1,
        stop: candles[i].high,
        cancelled: slowMA[i] > veryslowMA[i],
      });
    }
  }

  return {
    fastMA, slowMA, veryslowMA, macd, signal, hist,
    trendColor, barColor, maTrendColor, background, signals,
  };
}
