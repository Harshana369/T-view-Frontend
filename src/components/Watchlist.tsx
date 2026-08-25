import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPerpSymbols, fetchPrice24hAgo } from '../lib/coinbase';
import type { PerpSymbol } from '../lib/types';
import { useStore } from '../store';

/** Live price එක refresh කරන පරතරය. */
const PRICE_POLL_MS = 5_000;
/** පැය 24 baseline එක ආපහු ගේන පරතරය (මේක නිතර වෙනස් වෙන්නේ නෑ). */
const BASE_POLL_MS = 5 * 60_000;
/** Price එකක් වෙනස් වුණාම highlight වෙලා තියෙන කාලය. */
const FLASH_MS = 900;

/**
 * Price එකේ decimals ගණන අගය අනුව තෝරනවා —
 * 80,030.01 / 705.80 වගේ ලොකු ඒවාට 2ක්, 1.493 වගේ පොඩි ඒවාට වැඩියෙන්.
 */
function formatPrice(n: number): string {
  const decimals = n >= 100 ? 2 : n >= 1 ? 3 : n >= 0.01 ? 4 : 6;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** +3.78% / -1.20% විදිහට. */
function formatChange(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

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

  /** Coinbase එකේ තියෙන හැම perp එකකම දැනට තියෙන price එක (poll වෙනවා). */
  const [all, setAll] = useState<PerpSymbol[]>([]);
  /** symbol => පැය 24කට කලින් තිබුණු price එක. */
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  /** දැන් flash වෙන්න ඕන පේළි ටික (price එක වෙනස් වුණු ඒවා). */
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  // සියලුම prices poll කරනවා — එක request එකකින් හැම පේළියකටම ඇති.
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

  // පැය 24 baseline එක — watchlist එක වෙනස් වුණාමයි, විනාඩි 5කට වරක්.
  const key = watchlist.join(',');
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      for (const s of key ? key.split(',') : []) {
        try {
          const price = await fetchPrice24hAgo(s);
          if (stopped || price === null) continue;
          setBaseline((prev) => ({ ...prev, [s]: price }));
        } catch {
          // එක coin එකක් අඩුපාඩු වුණාට අනිත් ඒවා නවත්තන්නේ නෑ.
        }
      }
    };
    const timer = setInterval(load, BASE_POLL_MS);
    void load();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [key]);

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
        const prev = baseline[s];
        const price = live?.price ?? 0;
        return {
          symbol: s,
          base: live?.base ?? s.replace('-PERP', ''),
          price,
          changePct: prev && price ? ((price - prev) / prev) * 100 : null,
        };
      }),
    [watchlist, bySymbol, baseline],
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
                  <span className="sym">{s.symbol}</span>
                  <span className="px">{s.price > 0 ? formatPrice(s.price) : '-'}</span>
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
                  {row.price > 0 ? formatPrice(row.price) : '—'}
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
