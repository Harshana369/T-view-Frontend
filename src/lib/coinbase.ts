import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle, PerpSymbol, Timeframe } from './types';

/**
 * හැම request එකක්ම මේ prefix එකෙන් යනවා:
 *  - dev වලදී vite proxy එක (vite.config.ts)
 *  - production වලදී apps2/server proxy එක
 * දෙකේම /intx/xxx => https://api.international.coinbase.com/api/v1/xxx
 */
const API = '/intx';

/** එක request එකකින් Coinbase දෙන උපරිම candle ගණන. */
const MAX_PER_REQUEST = 300;

interface RawInstrument {
  symbol: string;
  type: string;
  trading_state: string;
  base_asset_name: string;
  quote_asset_name: string;
  notional_24hr?: string;
  quote?: { trade_price?: string };
}

interface RawCandle {
  start: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/** JSON එකක් ගෙනල්ලා error status එකක් ආවොත් තේරෙන message එකක් විසි කරනවා. */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Coinbase request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Coinbase INTX එකේ තියෙන *සියලුම* perpetual (PERP) markets ටික ගේනවා.
 * Trading නවත්තලා තියෙන ඒවා අයින් කරලා, 24h notional volume එක අනුව
 * ලොකුම ඒවා මුලට එන විදිහට sort කරනවා.
 */
export async function fetchPerpSymbols(): Promise<PerpSymbol[]> {
  const raw = await getJson<RawInstrument[]>(`${API}/instruments`);
  return raw
    .filter((i) => i.type === 'PERP' && i.trading_state === 'TRADING')
    .map((i) => ({
      symbol: i.symbol,
      base: i.base_asset_name,
      quote: i.quote_asset_name,
      price: Number(i.quote?.trade_price ?? 0),
      notional24h: Number(i.notional_24hr ?? 0),
    }))
    .sort((a, b) => b.notional24h - a.notional24h);
}

/** Coinbase candle row එකක් අපේ Candle හැඩයට හරවනවා. */
function toCandle(row: RawCandle): Candle {
  return {
    time: (Date.parse(row.start) / 1000) as UTCTimestamp,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

/**
 * එක page එකක් (උපරිම 300 candles) ගේනවා — `endMs` දුන්නොත් ඒ මොහොතට
 * පරණ පැත්තට. Coinbase newest-first දෙන නිසා මෙතනදී ascending කරනවා.
 */
async function fetchCandlePage(
  symbol: string,
  tf: Timeframe,
  endMs: number,
  bars = MAX_PER_REQUEST,
): Promise<Candle[]> {
  const startMs = endMs - bars * tf.seconds * 1000;
  const params = new URLSearchParams({
    granularity: tf.granularity,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  });
  const res = await getJson<{ aggregations: RawCandle[] }>(
    `${API}/instruments/${encodeURIComponent(symbol)}/candles?${params}`,
  );
  return (res.aggregations ?? []).map(toCandle).sort((a, b) => a.time - b.time);
}

/**
 * අවශ්‍ය ගණනට candles ගේනවා. Coinbase එක request එකකට 300ක් විතරයි දෙන නිසා,
 * ඊට වඩා ඕන නම් පරණ පැත්තට page කරමින් කීප වතාවක් ඉල්ලනවා. එකම time එකේ
 * candles දෙකක් නොඑන විදිහට Map එකකින් dedupe කරනවා.
 */
export async function fetchCandles(
  symbol: string,
  tf: Timeframe,
  want = 900,
): Promise<Candle[]> {
  const byTime = new Map<number, Candle>();
  let endMs = Date.now();

  while (byTime.size < want) {
    const page = await fetchCandlePage(symbol, tf, endMs);
    if (page.length === 0) break; // තව history නෑ — නවතිනවා
    for (const c of page) byTime.set(c.time, c);
    // ඊළඟ page එක මේ page එකේ පරණම candle එකට කලින් සිට
    endMs = page[0].time * 1000 - tf.seconds * 1000;
    if (page.length < MAX_PER_REQUEST) break; // page එක පිරුණේ නෑ = history ඉවරයි
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Coinbase INTX වල public market-data websocket එකට API key ඕන නිසා,
 * live update එකට කරන්නේ අන්තිම candles කීපය නැවත නැවත poll කිරීමයි.
 * හැම poll එකකදීම අලුත්/වෙනස් වුණු candles ටික `onCandles` එකට යවනවා.
 * Return වෙන function එක call කළාම polling නවතිනවා.
 */
export function subscribeCandles(
  symbol: string,
  tf: Timeframe,
  onCandles: (candles: Candle[]) => void,
  onError?: (message: string) => void,
): () => void {
  // කෙටි timeframe වලට ඉක්මනට, දිග ඒවාට හෙමින් — 5s සිට 20s දක්වා.
  const periodMs = Math.min(20_000, Math.max(5_000, tf.seconds * 200));
  let stopped = false;

  const tick = async () => {
    try {
      // අන්තිම candles 3ක් ඇති — දැන් හැදෙන එකයි, කලින් වහපු ඒවායි.
      const recent = await fetchCandlePage(symbol, tf, Date.now(), 3);
      if (!stopped && recent.length > 0) onCandles(recent);
    } catch (err) {
      if (!stopped) onError?.(err instanceof Error ? err.message : String(err));
    }
  };

  const timer = setInterval(tick, periodMs);
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
