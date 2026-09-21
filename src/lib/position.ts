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

/**
 * Size එක තීරණය වෙන ක්‍රම දෙක.
 *
 * `risk`   — "trade එකකට වැඩිම වශයෙන් $X ක් අහිමි වෙන්න පුළුවන්".
 *            SL එක ළඟ නම් size එක ලොකුයි, ඈත නම් පොඩියි. Leverage
 *            එකෙන් පාඩුව වෙනස් වෙන්නේ නෑ — margin එක විතරයි.
 *
 * `margin` — "trade එකකට $X ක් දානවා, 10x වලින්".
 *            notional = $X × leverage. Size එක SL එක ගැන බලන්නේ නෑ,
 *            ඒ නිසා **හැම trade එකකම පාඩුව වෙනස්**. SL එක ඈත නම්
 *            පාඩුව ලොකුයි — සහ liquidation එකට වැදෙන්නත් පුළුවන්.
 */
export type SizingMode = 'risk' | 'margin';

export interface PositionOptions {
  /** Size එක හදන ක්‍රමය. */
  sizing: SizingMode;
  /** `risk` mode — trade එකකට අවදානමට දාන ඩොලර් ගණන. */
  riskUsd: number;
  /** `margin` mode — trade එකකට දාන ඩොලර් ගණන (notional = මේක × lev). */
  marginUsd: number;
  leverage: number;
  /** Maintenance margin rate — Binance එකේ tier 1 එකට 0.4% විතර. */
  maintenanceMarginRate: number;
}

export const POSITION_DEFAULTS: PositionOptions = {
  // හැම trade එකකටම එකම size එක — $6 දාලා 10x, ඒ කියන්නේ notional $60.
  // (`risk` mode එකේදී size එක SL එකේ දුර අනුව වෙනස් වෙනවා; මෙතන නෑ.)
  sizing: 'margin',
  riskUsd: 6,
  marginUsd: 6,
  leverage: 10,
  maintenanceMarginRate: 0.004,
};

/**
 * Size එකයි notional එකයi margin එකයි — mode එක අනුව.
 * `risk` mode එකට SL එක ඕන; `margin` mode එකට ඕන නෑ.
 */
export function sizeFor(
  entry: number,
  initialSl: number,
  o: PositionOptions,
): { size: number; notionalUsd: number; marginUsd: number } | null {
  if (!(entry > 0) || !(o.leverage > 0)) return null;
  if (o.sizing === 'margin') {
    if (!(o.marginUsd > 0)) return null;
    const notionalUsd = o.marginUsd * o.leverage;
    return { size: notionalUsd / entry, notionalUsd, marginUsd: o.marginUsd };
  }
  const riskPerCoin = Math.abs(entry - initialSl);
  if (!(riskPerCoin > 0)) return null;
  const size = o.riskUsd / riskPerCoin;
  const notionalUsd = size * entry;
  return { size, notionalUsd, marginUsd: notionalUsd / o.leverage };
}

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
  const sz = sizeFor(entry, initialSl, o);
  if (!sz) return null;
  const { size, notionalUsd, marginUsd } = sz;

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

export interface TradeUsd {
  size: number;
  notionalUsd: number;
  marginUsd: number;
  /** Fees/slippage වලට කලින්. */
  grossUsd: number;
  /** Fees + slippage, පැත්ත දෙකටම. */
  costUsd: number;
  /** අන්තිම ප්‍රතිඵලය — liquidation එකෙන් කපලා. */
  netUsd: number;
  /** Margin එකට සාපේක්ෂව. */
  roePct: number;
  /**
   * SL එකට කලින් liquidation එකට වැදුණාද.
   *
   * 10x වලදී liq. එක entry එකෙන් ~9.6%ක් ඈතයි. SL එක 2×ATR ක් නම්,
   * ATR එක මිලෙන් 4.8% ට වඩා ලොකු වුණොත් **SL එකට කලින්** liq. එකට
   * වැදෙනවා — එතකොට දාපු මුළු margin එකම යනවා.
   */
  liquidated: boolean;
}

/**
 * Trade එකක ප්‍රතිඵලය ඩොලර් වලින්.
 *
 * ⚠️ `margin` mode එකේදී පාඩුව margin එකෙන් කපනවා — isolated margin
 *    එකක liquidation එකෙන් එහාට යන්න බෑ. ඒ නිසා ඍණ පැත්ත සීමිතයි,
 *    ඒත් **ඒ සීමාවට ගොඩක් trades වදිනවා** නම් ඒක හොඳ ලකුණක් නෙවෙයි.
 */
export function tradeUsd(
  dir: 1 | -1,
  entry: number,
  initialSl: number,
  exitPrice: number,
  o: PositionOptions,
  feePct: number,
  slippagePct: number,
): TradeUsd | null {
  const sz = sizeFor(entry, initialSl, o);
  if (!sz) return null;
  const { size, notionalUsd, marginUsd } = sz;

  const grossUsd = size * (exitPrice - entry) * dir;
  // පැත්ත දෙකේම notional එකට — ඇතුළු වෙනකොට සහ පිටවෙනකොට.
  const rate = (feePct + slippagePct) / 100;
  const costUsd = size * entry * rate + size * exitPrice * rate;

  let netUsd = grossUsd - costUsd;
  // Isolated — margin එකට වඩා අහිමි වෙන්නේ නෑ.
  const liquidated = netUsd < -marginUsd;
  if (liquidated) netUsd = -marginUsd;

  return {
    size,
    notionalUsd,
    marginUsd,
    grossUsd,
    costUsd,
    netUsd,
    roePct: marginUsd > 0 ? (netUsd / marginUsd) * 100 : 0,
    liquidated,
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
