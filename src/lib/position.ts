/**
 * Binance USDT-M Futures එකේ position panel එක වගේ අගයන්.
 *
 * Backtest එකක් R වලින් කතා කරනවා — ඒත් Binance එකේ පේන්නේ size,
 * margin, liq. price, unrealized PnL, ROE%. මේ file එක ඒ දෙක සම්බන්ධ
 * කරනවා: **risk එකෙන්** size එක හදලා, ඒකෙන් අනිත් ඔක්කොම.
 *
 *   size (coin)  = risk ($) ÷ |entry − SL|
 *   notional ($) = size × entry
 *   margin ($)   = notional ÷ leverage
 *
 * ඒ කියන්නේ SL එක ළඟ නම් size එක ලොකුයි, ඈත නම් පොඩියි — risk එක
 * හැම trade එකකටම එකමයි. (Leverage එකෙන් risk එක වෙනස් වෙන්නේ නෑ;
 * ඒකෙන් වෙනස් වෙන්නේ **margin** එකයි **liq. price** එකයි විතරයි.)
 */

export interface PositionOptions {
  /** Trade එකකට අවදානමට දාන ඩොලර් ගණන. */
  riskUsd: number;
  leverage: number;
  /** Maintenance margin rate — Binance එකේ tier 1 එකට 0.4% විතර. */
  maintenanceMarginRate: number;
}

export const POSITION_DEFAULTS: PositionOptions = {
  riskUsd: 6,
  leverage: 10,
  maintenanceMarginRate: 0.004,
};

export interface PositionView {
  dir: 1 | -1;
  /** Coin ගාණ. */
  size: number;
  /** Position එකේ ඩොලර් වටිනාකම. */
  notionalUsd: number;
  /** තියාගන්න ඕන margin එක. */
  marginUsd: number;
  entryPrice: number;
  /** දැන් තියෙන මිල (Binance එකේ "Mark Price"). */
  markPrice: number;
  /** ඒ මොහොතේ ලාභය/පාඩුව (book කරලා නෑ). */
  unrealizedUsd: number;
  /** Margin එකට සාපේක්ෂව — Binance එකේ පේන ROE%. */
  roePct: number;
  /**
   * Liquidation price (ආසන්න). Isolated margin, fees/funding ගණන් ගන්නේ නෑ.
   * Binance එකේ ඇත්ත අගය මීට ටිකක් වෙනස් වෙන්න පුළුවන්.
   */
  liquidationPrice: number;
  /** Liq. price එකට තියෙන දුර (%). */
  liquidationDistancePct: number;
  /** SL එකේ වැදුනොත් යන ඩොලර් ගණන (ඍණ = පාඩුව). */
  stopUsd: number;
  stopPrice: number;
}

/**
 * Trade එකක තත්ත්වය Binance එකේ පේන විදිහට.
 *
 * @param entry     ඇතුළු වුණු මිල
 * @param stop      දැන් තියෙන SL එක (trail වෙලා නම් ඒක)
 * @param mark      දැන් තියෙන මිල
 * @param initialSl මුල් SL එක — size එක ගණන් හදන්නේ මේකෙන් (risk එක ඒකයි)
 */
export function positionView(
  dir: 1 | -1,
  entry: number,
  initialSl: number,
  stop: number,
  mark: number,
  o: PositionOptions,
): PositionView | null {
  const riskPerCoin = Math.abs(entry - initialSl);
  if (!(riskPerCoin > 0) || !(entry > 0) || !(o.leverage > 0)) return null;

  const size = o.riskUsd / riskPerCoin;
  const notionalUsd = size * entry;
  const marginUsd = notionalUsd / o.leverage;

  const unrealizedUsd = size * (mark - entry) * dir;
  const roePct = marginUsd > 0 ? (unrealizedUsd / marginUsd) * 100 : 0;

  // Isolated liq. — margin එකයි maintenance එකයි ඉවර වෙන තැන.
  //   long:  entry × (1 − 1/lev + mmr)
  //   short: entry × (1 + 1/lev − mmr)
  const edge = 1 / o.leverage - o.maintenanceMarginRate;
  const liquidationPrice = dir === 1 ? entry * (1 - edge) : entry * (1 + edge);

  return {
    dir,
    size,
    notionalUsd,
    marginUsd,
    entryPrice: entry,
    markPrice: mark,
    unrealizedUsd,
    roePct,
    liquidationPrice,
    liquidationDistancePct: (Math.abs(mark - liquidationPrice) / mark) * 100,
    stopUsd: size * (stop - entry) * dir,
    stopPrice: stop,
  };
}

/** Coin ගාණක් කියවන්න පුළුවන් විදිහට (BTC 0.0012, PEPE 1.2M). */
export function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`;
  if (size >= 1000) return `${(size / 1000).toFixed(2)}K`;
  if (size >= 1) return size.toFixed(3);
  return size.toPrecision(3);
}

/** ඩොලර් ගණනක් +/− සලකුණත් එක්ක. */
export function formatUsd(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
