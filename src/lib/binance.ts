import type { UTCTimestamp } from 'lightweight-charts';
import { liveStream } from './stream';
import type { Candle, CandleSet, PerpSymbol, Timeframe } from './types';

/**
 * හැම request එකක්ම මේ prefix එකෙන් යනවා:
 *  - dev වලදී vite proxy එක (vite.config.ts)
 *  - production වලදී apps2/server proxy එක
 * දෙකේම /fapi/xxx => https://fapi.binance.com/fapi/xxx
 */
const API = '/fapi';

/** එක klines request එකකින් Binance දෙන උපරිම candle ගණන. */
const MAX_PER_REQUEST = 1500;

/** exchangeInfo එක 1MB විතර ලොකුයි, නිතර වෙනස් වෙන්නෙත් නෑ — මේ කාලෙට cache කරනවා. */
const INFO_TTL_MS = 10 * 60_000;

interface RawSymbol {
  symbol: string;
  pair: string;
  contractType: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

interface RawTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

/** Binance kline එකක් — array එකක්, index අනුව අර්ථ දෙනවා. */
type RawKline = [
  openTime: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  ...rest: unknown[],
];

/** JSON එකක් ගෙනල්ලා error status එකක් ආවොත් තේරෙන message එකක් විසි කරනවා. */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * "0.0000123" වගේ price string එකක තියෙන decimal ගණන.
 * Binance හැම price එකක්ම ඒ market එකේ tick size එකට pad කරලා දෙන නිසා,
 * chart එකේ/list එකේ decimals ගණන මෙතනින් හරියටම ගන්න පුළුවන්.
 */
function decimalsOf(price: string): number {
  const dot = price.indexOf('.');
  return dot < 0 ? 0 : Math.min(8, price.length - dot - 1);
}

let infoCache: { at: number; symbols: RawSymbol[] } | null = null;

/** Trading state එකේ තියෙන USDT perpetual markets ටික (cache එකෙන්). */
async function perpetualInfo(): Promise<RawSymbol[]> {
  if (infoCache && Date.now() - infoCache.at < INFO_TTL_MS) return infoCache.symbols;
  const raw = await getJson<{ symbols: RawSymbol[] }>(`${API}/v1/exchangeInfo`);
  const symbols = raw.symbols.filter(
    (s) => s.contractType === 'PERPETUAL' && s.status === 'TRADING' && s.quoteAsset === 'USDT',
  );
  infoCache = { at: Date.now(), symbols };
  return symbols;
}

/**
 * Binance USDT-M එකේ තියෙන *සියලුම* perpetual markets ටික ගේනවා
 * (දැනට 500කට වඩා). exchangeInfo එකෙන් market list එකයි, ticker/24hr
 * එකෙන් price + පැය 24 change එකයි අරන් join කරනවා. 24h notional volume
 * එක අනුව ලොකුම ඒවා මුලට එන විදිහට sort කරනවා.
 */
export async function fetchPerpSymbols(): Promise<PerpSymbol[]> {
  const [info, tickers] = await Promise.all([
    perpetualInfo(),
    getJson<RawTicker[]>(`${API}/v1/ticker/24hr`),
  ]);

  const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));

  return info
    .map((s) => {
      const t = bySymbol.get(s.symbol);
      return {
        symbol: s.symbol,
        base: s.baseAsset,
        quote: s.quoteAsset,
        price: Number(t?.lastPrice ?? 0),
        priceDecimals: decimalsOf(t?.lastPrice ?? '0.00'),
        changePct: t ? Number(t.priceChangePercent) : null,
        notional24h: Number(t?.quoteVolume ?? 0),
      };
    })
    .sort((a, b) => b.notional24h - a.notional24h);
}

/** Binance kline row එකක් අපේ Candle හැඩයට හරවනවා. */
function toCandle(row: RawKline): Candle {
  return {
    time: (row[0] / 1000) as UTCTimestamp,
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

/**
 * එක page එකක් ගේනවා — `endMs` දුන්නොත් ඒ මොහොතට පරණ පැත්තට.
 * Binance ascending order එකෙන්ම දෙනවා.
 */
async function fetchKlines(
  symbol: string,
  tf: Timeframe,
  endMs?: number,
  bars = MAX_PER_REQUEST,
): Promise<RawKline[]> {
  const params = new URLSearchParams({
    symbol,
    interval: tf.apiInterval,
    limit: String(bars),
  });
  if (endMs !== undefined) params.set('endTime', String(endMs));
  return getJson<RawKline[]>(`${API}/v1/klines?${params}`);
}

/**
 * අවශ්‍ය ගණනට candles ගේනවා. Binance එක request එකකට 1500ක් දෙනවා,
 * ඊට වඩා ඕන නම් පරණ පැත්තට page කරමින් කීප වතාවක් ඉල්ලනවා. එකම time එකේ
 * candles දෙකක් නොඑන විදිහට Map එකකින් dedupe කරනවා.
 *
 * Price එකේ decimals ගණනත් එක්කම දෙනවා — coin එකෙන් coin එකට ඒක
 * හුඟක් වෙනස් (BTC 79889.30, 1000SATS 0.00012340), chart එකේ price scale
 * එක හදන්න ඒක ඕන.
 */
export async function fetchCandles(
  symbol: string,
  tf: Timeframe,
  want = 900,
): Promise<CandleSet> {
  // apps2/server එක දුවනවා නම් Postgres එකෙන් — Binance එකට request
  // එකක්වත් යන්නේ නෑ (DB එකේ අලුත්ම closed candle එක තියෙනවා නම්).
  const fromDb = await fetchCandlesFromDb(symbol, tf, want);
  if (fromDb !== null) return fromDb;

  const byTime = new Map<number, Candle>();
  let endMs: number | undefined;
  let priceDecimals = 2;

  while (byTime.size < want) {
    const page = await fetchKlines(symbol, tf, endMs);
    if (page.length === 0) break; // තව history නෑ — නවතිනවා
    priceDecimals = Math.max(priceDecimals, decimalsOf(page[0][4]));
    for (const row of page) {
      const c = toCandle(row);
      byTime.set(c.time, c);
    }
    // ඊළඟ page එක මේ page එකේ පරණම candle එකට කලින් සිට
    endMs = page[0][0] - 1;
    if (page.length < MAX_PER_REQUEST) break; // page එක පිරුණේ නෑ = history ඉවරයි
  }

  return {
    candles: [...byTime.values()].sort((a, b) => a.time - b.time),
    priceDecimals,
  };
}

/**
 * apps2/server එකේ `/api/klines` (Postgres backed) එකෙන් candles ගේනවා.
 *
 * Scanner එකට මේක තමයි වැදගත්: coins 500+ක් cycle එකකට scan කරද්දී,
 * server එකේ DB එකේ දැනටමත් අලුත්ම closed candle එක තියෙනවා නම් Binance
 * එකට request එකක්වත් යන්නේ නෑ (rate limit එකට ගැටෙන එක නවතිනවා).
 *
 * Server එක නැති වෙලාවක (Vite dev, `npm run dev` විතරක්) `/api/klines`
 * 404 වෙනවා — ඒ වෙලාවට කෙලින්ම Binance එකට යනවා. පළමු වතාවේදීම බලලා
 * මතක තියාගන්නවා, හැම call එකකදීම නාස්ති request එකක් යවන්නේ නෑ.
 */
let dbCandlesAvailable: boolean | null = null;

async function fetchCandlesFromDb(
  symbol: string,
  tf: Timeframe,
  limit: number,
): Promise<CandleSet | null> {
  if (dbCandlesAvailable === false) return null;

  const params = new URLSearchParams({
    symbol,
    interval: tf.code,
    limit: String(limit),
  });
  try {
    const res = await fetch(`/api/klines?${params}`);
    if (!res.ok) {
      // 404 = server එකක් නෑ; 5xx = server එකේ අවුලක් — දෙකටම Binance එකට යනවා.
      if (res.status === 404) dbCandlesAvailable = false;
      return null;
    }
    dbCandlesAvailable = true;
    return (await res.json()) as CandleSet;
  } catch {
    dbCandlesAvailable = false;
    return null;
  }
}

/**
 * Live updates — **polling නෙවෙයි**, server එකේ `/ws` එකෙන්.
 *
 * කලින් මෙතන `setInterval` එකක් තිබුණා, chart එකකට klines request
 * එකක් තත්පර 3–20කට වරක්. Tab කීයක් තිබ්බත් ඒ හැම එකක්ම වෙන වෙනම
 * Binance එකට ගියා.
 *
 * දැන් ඉල්ලීම යන්නේ අපේ server එකට. එතන symbol/interval එකකට
 * **එක** subscription එකයි, tabs කීයක් බැලුවත්. (Server එක Binance
 * WS එකෙන් ගන්නවා; ඒක බැරි ජාලයක නම් server පැත්තේ එක poller
 * එකකින් — browser එකට වෙනස දැනෙන්නේ නෑ.)
 *
 * Return වෙන function එක call කළාම නවතිනවා.
 */
export function subscribeCandles(
  symbol: string,
  tf: Timeframe,
  onCandles: (candles: Candle[]) => void,
  onError?: (message: string) => void,
): () => void {
  void onError;
  return liveStream.onKline(symbol, tf.code, (candle) => {
    onCandles([candle]);
  });
}
