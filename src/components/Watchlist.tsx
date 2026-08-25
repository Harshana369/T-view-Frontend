import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPerpSymbols } from '../lib/binance';
import { formatChange, formatPrice } from '../lib/format';
import type { PerpSymbol } from '../lib/types';
import { useStore } from '../store';

/** Live price + 24h change refresh කරන පරතරය. */
const PRICE_POLL_MS = 5_000;
/** Price එකක් වෙනස් වුණාම highlight වෙලා තියෙන කාලය. */
const FLASH_MS = 900;

/**
 * දකුණු පැත්තේ watchlist panel එක — තෝරගත්ත coins ටිකේ live price එකයි,
 * යටින් පැය 24ේ % change එකයි. පේළියක් click කළාම chart එක ඒ coin එකට මාරු වෙනවා.
 */
export function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const symbol = useStore((s) => s.symbol);
  const setSymbol = useStore((s) => s.setSymbol);
  const addToWatchlist = useStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useStore((s) => s.removeFromWatchlist);

  /** Binance එකේ තියෙන හැම perp එකකම දැනට තියෙන price + change (poll වෙනවා). */
  const [all, setAll] = useState<PerpSymbol[]>([]);
  /** දැන් flash වෙන්න ඕන පේළි ටික (price එක වෙනස් වුණු ඒවා). */
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  // සියලුම prices poll කරනවා — එක ticker request එකකින් හැම පේළියකටම ඇති.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const list = await fetchPerpSymbols();
        if (stopped) return;
        setAll(list);
        setError(null);
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : String(err));
      }
    };
    const timer = setInterval(tick, PRICE_POLL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  // Symbol => PerpSymbol map එකක් — පේළි හදනකොට හොයාගන්න ලේසියි.
  const bySymbol = useMemo(() => {
    const map = new Map<string, PerpSymbol>();
    for (const s of all) map.set(s.symbol, s);
    return map;
  }, [all]);

  const rows = useMemo(
    () =>
      watchlist.map((s) => {
        const live = bySymbol.get(s);
        return {
          symbol: s,
          base: live?.base ?? s.replace(/USDT$/, ''),
          price: live?.price ?? 0,
          priceDecimals: live?.priceDecimals,
          changePct: live?.changePct ?? null,
        };
      }),
    [watchlist, bySymbol],
  );

  // Price එකක් වෙනස් වුණාම ඒ පේළිය මොහොතකට highlight කරනවා.
  const lastPrices = useRef<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    for (const row of rows) {
      if (row.price <= 0) continue;
      const before = lastPrices.current[row.symbol];
      lastPrices.current[row.symbol] = row.price;
      if (before === undefined || before === row.price) continue;

      setFlashing((f) => ({ ...f, [row.symbol]: true }));
      clearTimeout(timers.current[row.symbol]);
      timers.current[row.symbol] = setTimeout(() => {
        setFlashing((f) => ({ ...f, [row.symbol]: false }));
      }, FLASH_MS);
    }
  }, [rows]);

  // Component එක යනකොට ඉතුරු වෙලා තියෙන timers ටික අයින් කරනවා.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of Object.values(pending)) clearTimeout(t);
    };
  }, []);

  // "+" එකෙන් දාන්න පුළුවන් ඒවා — දැනටමත් list එකේ නැති, search එකට ගැළපෙන coins.
  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    return all
      .filter((s) => !watchlist.includes(s.symbol))
      .filter((s) => !q || s.symbol.includes(q) || s.base.includes(q))
      .slice(0, 8);
  }, [all, watchlist, query]);

  return (
    <aside className="watchlist">
      <div className="wl-head">
        <span>Watchlist</span>
        <button
          type="button"
          className="wl-add"
          title="Coin එකක් දාන්න"
          onClick={() => {
            setAdding((a) => !a);
            setQuery('');
          }}
        >
          {adding ? '×' : '+'}
        </button>
      </div>

      {adding && (
        <div className="wl-adder">
          <input
            className="picker-search"
            autoFocus
            placeholder="Search coin (BTC, SOL...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="wl-suggest">
            {suggestions.map((s) => (
              <li key={s.symbol}>
                <button
                  type="button"
                  className="picker-item"
                  onClick={() => {
                    addToWatchlist(s.symbol);
                    setAdding(false);
                    setQuery('');
                  }}
                >
                  <span className="sym">{s.base}</span>
                  <span className="px">
                    {s.price > 0 ? formatPrice(s.price, s.priceDecimals) : '-'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="wl-list">
        {rows.map((row) => (
          <li key={row.symbol}>
            <div
              className={row.symbol === symbol ? 'wl-row active' : 'wl-row'}
              role="button"
              tabIndex={0}
              onClick={() => setSymbol(row.symbol)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSymbol(row.symbol);
              }}
            >
              <span className="wl-sym">{row.base}</span>

              <span className="wl-nums">
                <span className={flashing[row.symbol] ? 'wl-price flash' : 'wl-price'}>
                  {row.price > 0 ? formatPrice(row.price, row.priceDecimals) : '—'}
                </span>
                <span
                  className={
                    row.changePct === null
                      ? 'wl-chg dim'
                      : row.changePct >= 0
                        ? 'wl-chg up'
                        : 'wl-chg down'
                  }
                >
                  {row.changePct === null ? '—' : formatChange(row.changePct)}
                </span>
              </span>

              <button
                type="button"
                className="wl-remove"
                title="අයින් කරන්න"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromWatchlist(row.symbol);
                }}
              >
                {'×'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <div className="wl-err">{error}</div>}
    </aside>
  );
}
