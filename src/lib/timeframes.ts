import type { Interval, Timeframe } from './types';

/**
 * Coinbase INTX candles endpoint එක support කරන granularity ටික විතරයි
 * මෙතන තියෙන්නේ. (12h සහ 1w request කළොත් හිස් array එකක් එනවා, ඒ නිසා
 * ඒවා list එකෙන් අයින් කරලා තියෙනවා.)
 */
export const TIMEFRAMES: Timeframe[] = [
  { code: '1m', label: '1m', granularity: 'ONE_MINUTE', seconds: 60 },
  { code: '5m', label: '5m', granularity: 'FIVE_MINUTE', seconds: 300 },
  { code: '15m', label: '15m', granularity: 'FIFTEEN_MINUTE', seconds: 900 },
  { code: '30m', label: '30m', granularity: 'THIRTY_MINUTE', seconds: 1800 },
  { code: '1h', label: '1H', granularity: 'ONE_HOUR', seconds: 3600 },
  { code: '2h', label: '2H', granularity: 'TWO_HOUR', seconds: 7200 },
  { code: '4h', label: '4H', granularity: 'FOUR_HOUR', seconds: 14400 },
  { code: '6h', label: '6H', granularity: 'SIX_HOUR', seconds: 21600 },
  { code: '1d', label: '1D', granularity: 'ONE_DAY', seconds: 86400 },
];

/** Interval code එකකින් අදාළ Timeframe object එක හොයාගන්නවා. */
export function timeframeOf(code: Interval): Timeframe {
  return TIMEFRAMES.find((t) => t.code === code) ?? TIMEFRAMES[2];
}
