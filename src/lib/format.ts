/**
 * List/watchlist වල අගයන් පෙන්නන විදිහ — coin 500කට වඩා තියෙන නිසා
 * BTC (79,905.60) සිට 1000SATS (0.00012340) දක්වා හැම එකක්ම හරියට පේන්න ඕන.
 */

/**
 * Price එක Binance දෙන decimals ගණනටම format කරනවා.
 * `decimals` දුන්නේ නැත්නම් අගය අනුව තෝරගන්නවා.
 */
export function formatPrice(n: number, decimals?: number): string {
  const d = decimals ?? (n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 4 : 8);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** +3.78% / -1.20% විදිහට. */
export function formatChange(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

/** ලොකු ඉලක්කම් කෙටියෙන් පෙන්වනවා (1.2B, 340M, 12K වගේ). */
export function compact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
