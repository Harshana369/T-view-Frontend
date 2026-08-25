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
  | '1d';

/** එක timeframe එකක් — UI label එක, Coinbase granularity නම, තත්පර ගණන. */
export interface Timeframe {
  code: Interval;
  label: string;
  /** Coinbase INTX API එකේ `granularity` query parameter එකේ අගය. */
  granularity: string;
  /** එක candle එකක කාලය තත්පර වලින් (paging + polling ගණන් වලට). */
  seconds: number;
}

/** Coinbase perpetual futures market එකක් (උදා: BTC-PERP). */
export interface PerpSymbol {
  /** Coinbase instrument symbol — API calls වලට යොදන id එක. */
  symbol: string;
  /** Base asset එක (BTC, ETH, SOL ...). */
  base: string;
  /** Quote asset එක — perps වල සාමාන්‍යයෙන් USDC. */
  quote: string;
  /** අන්තිම trade price එක (list එකේ පෙන්වන්න). */
  price: number;
  /** පැය 24 notional volume එක — liquidity අනුව sort කරන්න. */
  notional24h: number;
}
