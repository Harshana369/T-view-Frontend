import type { Interval, Timeframe } from './types';

/**
 * Binance USDT-M futures klines endpoint එක support කරන interval ටිකෙන්
 * අපි UI එකේ පෙන්නන ඒවා. (Binance 12h සහ 1w දෙකත් දෙන නිසා ඒවත් තියෙනවා.)
 */
export const TIMEFRAMES: Timeframe[] = [
  { code: '1m', label: '1m', apiInterval: '1m', seconds: 60 },
  { code: '5m', label: '5m', apiInterval: '5m', seconds: 300 },
  { code: '15m', label: '15m', apiInterval: '15m', seconds: 900 },
  { code: '30m', label: '30m', apiInterval: '30m', seconds: 1800 },
  { code: '1h', label: '1H', apiInterval: '1h', seconds: 3600 },
  { code: '2h', label: '2H', apiInterval: '2h', seconds: 7200 },
  { code: '4h', label: '4H', apiInterval: '4h', seconds: 14400 },
  { code: '6h', label: '6H', apiInterval: '6h', seconds: 21600 },
  { code: '12h', label: '12H', apiInterval: '12h', seconds: 43200 },
  { code: '1d', label: '1D', apiInterval: '1d', seconds: 86400 },
  { code: '1w', label: '1W', apiInterval: '1w', seconds: 604800 },
];

/** Interval code එකකින් අදාළ Timeframe object එක හොයාගන්නවා. */
export function timeframeOf(code: Interval): Timeframe {
  return TIMEFRAMES.find((t) => t.code === code) ?? TIMEFRAMES[2];
}
