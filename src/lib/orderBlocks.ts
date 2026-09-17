import type { Candle } from './types';

/**
 * "Order Block Finder (Experimental)" (© wugamlo, MPL-2.0) එකේ port එක.
 *
 * Bullish OB = උඩට යන candles මාලාවකට **කලින් තිබුණු අන්තිම රතු candle**.
 * Bearish OB = පහළට යන candles මාලාවකට කලින් තිබුණු අන්තිම කොළ candle.
 *
 * ⚠️ මේක **repaint වෙනවා — අර්ථ දැක්වීමෙන්ම**. OB එකක් හඳුනාගන්න පුළුවන්
 *    ඊට පස්සේ candles `periods` ගාණක් වහුනාට පස්සේ විතරයි (default 5).
 *    ඒ කියන්නේ OB එකේ label එක chart එකට එන්නේ ඒක සිද්ධ වෙලා bars 5කට
 *    පස්සේ. මුල් author ගේම වචන වලින්: **මේවා BUY/SELL signals නෙවෙයි** —
 *    price එක පස්සේ ආපහු එන්න ඉඩ තියෙන "උනන්දුවක් තියෙන කලාප" විතරයි.
 */

export interface OrderBlockOptions {
  /** Pine `periods` — OB එකකට පස්සේ ඕන එකම දිශාවේ candles ගාණ. */
  periods: number;
  /** Pine `threshold` — ඒ චලනය අවම වශයෙන් කීයක් වෙන්න ඕනද (%). */
  threshold: number;
  /** Pine `usewicks` — මුළු High/Low range එකද, නැත්නම් Open සිට විතරද. */
  useWicks: boolean;
}

export interface OrderBlock {
  /** OB candle එකේ index (label එක එතන). */
  index: number;
  /** මේක හඳුනාගත්ත bar එක — `index + periods + 1`. */
  detectedAt: number;
  dir: 1 | -1;
  high: number;
  low: number;
  /** Pine `OB_*_avg` — equilibrium. */
  avg: number;
}

export interface OrderBlockResult {
  blocks: OrderBlock[];
  latestBull: OrderBlock | null;
  latestBear: OrderBlock | null;
}

export function computeOrderBlocks(
  candles: Candle[],
  o: OrderBlockOptions,
): OrderBlockResult {
  const n = candles.length;
  const periods = Math.max(1, Math.floor(o.periods));
  // Pine `ob_period = periods + 1` — OB candle එක තියෙන්නේ මෙච්චර පිටිපස්සේ.
  const obPeriod = periods + 1;
  const blocks: OrderBlock[] = [];

  for (let i = obPeriod; i < n; i++) {
    // Pine එකේ `close[k]` කියන්නේ මේ bar එකෙන් k ක් පිටිපස්සට.
    const ob = candles[i - obPeriod];
    const last = candles[i - 1];

    // absmove = |close[ob_period] − close[1]| / close[ob_period] × 100
    if (!(ob.close > 0)) continue;
    const absmove = (Math.abs(ob.close - last.close) / ob.close) * 100;
    if (!(absmove >= o.threshold)) continue;

    // ⚠️ දැන් තියෙන bar එක (i) පරීක්ෂාවට ගන්නේ නෑ — Pine loop එක
    //    `for k = 1 to periods`, ඒ කියන්නේ bars i−1 සිට i−periods දක්වා.
    let up = 0;
    let down = 0;
    for (let k = 1; k <= periods; k++) {
      const c = candles[i - k];
      if (c.close > c.open) up++;
      if (c.close < c.open) down++;
    }

    // Bullish OB — රතු candle එකක්, පස්සේ ඔක්කොම කොළ
    if (ob.close < ob.open && up === periods) {
      const high = o.useWicks ? ob.high : ob.open;
      const low = ob.low;
      blocks.push({
        index: i - obPeriod,
        detectedAt: i,
        dir: 1,
        high,
        low,
        avg: (high + low) / 2,
      });
    }

    // Bearish OB — කොළ candle එකක්, පස්සේ ඔක්කොම රතු
    if (ob.close > ob.open && down === periods) {
      const high = ob.high;
      const low = o.useWicks ? ob.low : ob.open;
      blocks.push({
        index: i - obPeriod,
        detectedAt: i,
        dir: -1,
        high,
        low,
        avg: (low + high) / 2,
      });
    }
  }

  let latestBull: OrderBlock | null = null;
  let latestBear: OrderBlock | null = null;
  for (const b of blocks) {
    if (b.dir === 1) latestBull = b;
    else latestBear = b;
  }

  return { blocks, latestBull, latestBear };
}
