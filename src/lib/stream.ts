import type { Candle, Interval } from './types';

/**
 * Live data — **polling නෑ**.
 *
 * කලින්: හැම browser tab එකක්ම තත්පර 5කට වරක් `ticker/24hr`
 * (weight 40) ඇහුවා. Tabs 3ක් = විනාඩියකට weight 1,476ක් — බජට්
 * එකෙන් 60%ක්, මිල බලන එකට විතරක්. Chart එකකට klines polling එකත්
 * ඒ උඩින්.
 *
 * දැන්: හැම tab එකක්ම **අපේ server එකේ `/ws`** එකට connect වෙනවා.
 * Server එක Binance එකෙන් එකපාරක් ගෙනල්ලා ඔක්කොටම බෙදනවා. Tabs
 * කීයක් තිබ්බත් Binance එකට යන බර **එකයි**.
 *
 * Connection එක එකයි, ref-count එකෙන් බෙදාගන්නවා. Drop වුණොත්
 * ආපහු connect වෙලා දැනට ඉල්ලලා තියෙන ඔක්කොම නැවත ඉල්ලනවා.
 */

export interface TickerUpdate {
  symbol: string;
  price: number;
  priceDecimals: number;
  changePct: number;
  notional24h: number;
}

type ServerEvent =
  | { type: 'tickers'; data: TickerUpdate[] }
  | { type: 'kline'; symbol: string; interval: Interval; candle: Candle; closed: boolean };

type TickerListener = (updates: TickerUpdate[]) => void;
type KlineListener = (candle: Candle, closed: boolean) => void;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

class LiveStream {
  private ws: WebSocket | null = null;
  private tickerListeners = new Set<TickerListener>();
  /** `SYMBOL|interval` → listeners. */
  private klineListeners = new Map<string, Set<KlineListener>>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Connection එක හැදෙනකම් රැඳෙන messages. */
  private queue: string[] = [];
  /** Server එකෙන් අන්තිමට ආපු මිල — අලුත් listener එකකට වහාම දෙන්න. */
  private lastTickers: TickerUpdate[] = [];

  private ensure(): void {
    if (this.ws) return;
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      // Reconnect එකකදී දැනට ඕන දේවල් ආපහු ඉල්ලනවා.
      if (this.tickerListeners.size > 0) this.send({ op: 'sub', ch: 'tickers' });
      for (const key of this.klineListeners.keys()) {
        const [symbol, interval] = key.split('|');
        this.send({ op: 'sub', ch: 'kline', symbol, interval });
      }
      for (const msg of this.queue.splice(0)) ws.send(msg);
    };

    ws.onmessage = (ev) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(ev.data as string) as ServerEvent;
      } catch {
        return;
      }
      if (event.type === 'tickers') {
        this.lastTickers = event.data;
        for (const l of this.tickerListeners) l(event.data);
        return;
      }
      if (event.type === 'kline') {
        const set = this.klineListeners.get(`${event.symbol}|${event.interval}`);
        if (!set) return;
        for (const l of set) l(event.candle, event.closed);
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* දැනටමත් වැහිලා */
      }
    };
  }

  private scheduleReconnect(): void {
    // ඉල්ලුමක් නැත්නම් ආපහු connect වෙන්න ඕන නෑ.
    if (this.tickerListeners.size === 0 && this.klineListeners.size === 0) return;
    if (this.timer) return;
    const delay = Math.min(15_000, 500 * 2 ** this.attempt++);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.ensure();
    }, delay);
  }

  private send(msg: Record<string, unknown>): void {
    const text = JSON.stringify(msg);
    if (this.ws?.readyState === 1) this.ws.send(text);
    else this.queue.push(text);
  }

  /** සියලුම coins ගේ මිල. Return වෙන function එකෙන් නවත්තනවා. */
  onTickers(listener: TickerListener): () => void {
    const first = this.tickerListeners.size === 0;
    this.tickerListeners.add(listener);
    this.ensure();
    if (first) this.send({ op: 'sub', ch: 'tickers' });
    // දැනටමත් මිල තියෙනවා නම් වහාම — ඊළඟ push එක එනකම් බලාගෙන ඉන්නේ නෑ.
    else if (this.lastTickers.length > 0) listener(this.lastTickers);

    return () => {
      this.tickerListeners.delete(listener);
      if (this.tickerListeners.size === 0) this.send({ op: 'unsub', ch: 'tickers' });
    };
  }

  /** එක chart එකක candles. */
  onKline(symbol: string, interval: Interval, listener: KlineListener): () => void {
    const key = `${symbol.toUpperCase()}|${interval}`;
    let set = this.klineListeners.get(key);
    if (!set) {
      set = new Set();
      this.klineListeners.set(key, set);
    }
    const first = set.size === 0;
    set.add(listener);
    this.ensure();
    if (first) this.send({ op: 'sub', ch: 'kline', symbol: key.split('|')[0], interval });

    return () => {
      set!.delete(listener);
      if (set!.size === 0) {
        this.klineListeners.delete(key);
        this.send({ op: 'unsub', ch: 'kline', symbol: key.split('|')[0], interval });
      }
    };
  }
}

export const liveStream = new LiveStream();
