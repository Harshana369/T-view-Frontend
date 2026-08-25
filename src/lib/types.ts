import type { UTCTimestamp } from 'lightweight-charts';

/** Chart එකට දෙන එක candle එකක සම්මත හැඩය (time = seconds, UTC). */
export interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Load කරගත්ත candles ටිකයි, ඒ market එකේ price decimals ගණනයි. */
export interface CandleSet {
  candles: Candle[];
  /** උදා: BTCUSDT = 2, 1000SATSUSDT = 8. Chart price scale එකට. */
  priceDecimals: number;
}

/** UI එකේ තෝරන්න පුළුවන් timeframe code ටික. */
export type Interval =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d'
  | '1w';

/** එක timeframe එකක් — UI label එක, Binance interval නම, තත්පර ගණන. */
export interface Timeframe {
  code: Interval;
  label: string;
  /** Binance klines endpoint එකේ `interval` query parameter එකේ අගය. */
  apiInterval: string;
  /** එක candle එකක කාලය තත්පර වලින් (paging + polling ගණන් වලට). */
  seconds: number;
}

/** Binance USDT-M perpetual futures market එකක් (උදා: BTCUSDT). */
export interface PerpSymbol {
  /** Binance symbol — API calls වලට යොදන id එක. */
  symbol: string;
  /** Base asset එක (BTC, ETH, SOL ...). */
  base: string;
  /** Quote asset එක — මේ markets ඔක්කොම USDT. */
  quote: string;
  /** අන්තිම trade price එක (list එකේ පෙන්වන්න). */
  price: number;
  /** ඒ price එකේ decimal ගණන — format කරලා පෙන්වන්න. */
  priceDecimals: number;
  /** පැය 24ේ % change එක (Binance එකෙන්ම එනවා). */
  changePct: number | null;
  /** පැය 24 quote volume එක (USDT) — liquidity අනුව sort කරන්න. */
  notional24h: number;
}
