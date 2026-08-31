import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPerpSymbols } from '../lib/binance';
import { formatChange, formatPrice } from '../lib/format';
import type { PerpSymbol } from '../lib/types';
import { ALL_GROUP_ID, useStore } from '../store';

/** Live price + 24h change refresh කරන පරතරය. */
const PRICE_POLL_MS = 5_000;
/** Price එකක් වෙනස් වුණාම highlight වෙලා තියෙන කාලය. */
const FLASH_MS = 900;

interface Row {
  symbol: string;
  base: string;
  price: number;
  priceDecimals?: number;
  changePct: number | null;
}

/**
 * දකුණු පැත්තේ watchlist panel එක — තෝරගත්ත coins ටිකේ live price එකයි,
 * යටින් පැය 24ේ % change එකයි. පේළියක් click කළාම chart එක ඒ coin එකට මාරු වෙනවා.
 *
 * Coins groups වලට බෙදන්න පුළුවන් (Favorites, Majors, Memes...) — ඒ එක්කම
 * Binance එකේ තියෙන *සියලුම* perps පෙන්නන "All coins" group එකකුත් තියෙනවා.
 */
export function Watchlist() {
  const watchGroups = useStore((s) => s.watchGroups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const symbol = useStore((s) => s.symbol);
  const setSymbol = useStore((s) => s.setSymbol);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const addGroup = useStore((s) => s.addGroup);
  const renameGroup = useStore((s) => s.renameGroup);
  const removeGroup = useStore((s) => s.removeGroup);
  const addToWatchlist = useStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useStore((s) => s.removeFromWatchlist);

  /** Binance එකේ හැම perp එකකම දැනට තියෙන price + change (poll වෙනවා). */
  const [all, setAll] = useState<PerpSymbol[]>([]);
  /** දැන් flash වෙන පේළි ටික (price එක වෙනස් වුණු ඒවා). */
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');

  const activeGroup = watchGroups.find((g) => g.id === activeGroupId);
  const isAll = activeGroupId === ALL_GROUP_ID || !activeGroup;

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

  /**
   * "All coins" එකේ පිළිවෙල volume එක අනුව — ඒත් හැම poll එකකදීම ආපහු
   * sort වුණොත් scroll කරනකොට පේළි උඩ පල්ලෙහා පනිනවා. ඒ නිසා coins ලැයිස්තුව
   * වෙනස් වුණාම විතරයි පිළිවෙල අලුත් කරන්නේ.
   */
  const orderRef = useRef<string[]>([]);
  const allOrder = useMemo(() => {
    const symbols = all.map((s) => s.symbol);
    const previous = orderRef.current;
    const same =
      previous.length === symbols.length && symbols.every((s) => previous.includes(s));
    if (!same) orderRef.current = symbols;
    return orderRef.current;
  }, [all]);

  const rows = useMemo<Row[]>(() => {
    const symbols = isAll ? allOrder : (activeGroup?.symbols ?? []);
    return symbols.map((s) => {
      const live = bySymbol.get(s);
      return {
        symbol: s,
        base: live?.base ?? s.replace(/USDT$/, ''),
        price: live?.price ?? 0,
        priceDecimals: live?.priceDecimals,
        changePct: live?.changePct ?? null,
      };
    });
  }, [isAll, allOrder, activeGroup, bySymbol]);

  const visibleRows = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.symbol.includes(q) || r.base.includes(q));
  }, [rows, filter]);

  // Price එකක් වෙනස් වුණාම ඒ පේළිය මොහොතකට highlight කරනවා. All coins
  // group එකේ පේළි 500ක් විතර තියෙන නිසා, එකපාරට එකම state update එකක්.
  const lastPrices = useRef<Record<string, number>>({});
  useEffect(() => {
    const changed: Record<string, boolean> = {};
    let any = false;
    for (const row of rows) {
      if (row.price <= 0) continue;
      const before = lastPrices.current[row.symbol];
      lastPrices.current[row.symbol] = row.price;
      if (before === undefined || before === row.price) continue;
      changed[row.symbol] = true;
      any = true;
    }
    if (!any) return;
    setFlashing(changed);
    const timer = setTimeout(() => setFlashing({}), FLASH_MS);
    return () => clearTimeout(timer);
  }, [rows]);

  // "+" එකෙන් දාන්න පුළුවන් ඒවා — දැනටමත් group එකේ නැති, search එකට ගැළපෙන coins.
  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    const inGroup = new Set(activeGroup?.symbols ?? []);
    return all
      .filter((s) => !inGroup.has(s.symbol))
      .filter((s) => !q || s.symbol.includes(q) || s.base.includes(q))
      .slice(0, 8);
  }, [all, activeGroup, query]);

  /** All coins එකේ ඉඳන් coin එකක් දාද්දී යන group එක. */
  const addTargetName = activeGroup?.name ?? watchGroups[0]?.name ?? 'Favorites';

  return (
    <aside className="watchlist">
      <div className="wl-head">
        <span>Watchlist</span>
        <button
          type="button"
          className="wl-add"
          title={isAll ? 'Group එකක් හදන්න' : 'Coin එකක් දාන්න'}
          onClick={() => {
            if (isAll) {
              setManaging((mm) => !mm);
              return;
            }
            setAdding((a) => !a);
            setQuery('');
          }}
        >
          {(isAll ? managing : adding) ? '×' : '+'}
        </button>
      </div>

      {/* ── Group එක තෝරන තැන ─────────────────────────────────────── */}
      <div className="wl-groups">
        <select
          className="wl-group-select"
          value={isAll ? ALL_GROUP_ID : activeGroupId}
          onChange={(e) => {
            if (e.target.value === '__new__') {
              const name = window.prompt('Group එකේ නම?');
              if (name) addGroup(name);
              return;
            }
            setActiveGroup(e.target.value);
            setManaging(false);
            setAdding(false);
          }}
        >
          <option value={ALL_GROUP_ID}>All coins ({all.length})</option>
          {watchGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.symbols.length})
            </option>
          ))}
          <option value="__new__">＋ New group…</option>
        </select>

        {!isAll && (
          <button
            type="button"
            className="wl-add"
            title="Group එක rename / delete"
            onClick={() => setManaging((mm) => !mm)}
          >
            ⋯
          </button>
        )}
      </div>

      {managing && (
        <div className="wl-adder">
          {activeGroup ? (
            <>
              <input
                className="picker-search"
                value={activeGroup.name}
                onChange={(e) => renameGroup(activeGroup.id, e.target.value)}
              />
              <button
                type="button"
                className="wl-danger"
                onClick={() => {
                  removeGroup(activeGroup.id);
                  setManaging(false);
                }}
              >
                Delete "{activeGroup.name}"
              </button>
            </>
          ) : (
            <button
              type="button"
              className="wl-ghost"
              onClick={() => {
                const name = window.prompt('Group එකේ නම?');
                if (name) addGroup(name);
                setManaging(false);
              }}
            >
              ＋ New group
            </button>
          )}
        </div>
      )}

      {adding && !isAll && (
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

      {/* All coins එකේ 500කට වඩා තියෙන නිසා filter එකක් ඕනම වෙනවා. */}
      <input
        className="wl-filter"
        placeholder={`Filter ${isAll ? 'all coins' : activeGroup?.name}…`}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <ul className="wl-list">
        {visibleRows.map((row) => (
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

              {isAll ? (
                <button
                  type="button"
                  className="wl-remove"
                  title={`"${addTargetName}" group එකට දාන්න`}
                  onClick={(e) => {
                    e.stopPropagation();
                    addToWatchlist(row.symbol, watchGroups[0]?.id);
                  }}
                >
                  +
                </button>
              ) : (
                <button
                  type="button"
                  className="wl-remove"
                  title="Group එකෙන් අයින් කරන්න"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromWatchlist(row.symbol);
                  }}
                >
                  {'×'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="wl-foot">
        {error ? <span className="wl-err">{error}</span> : `${visibleRows.length} coins`}
      </div>
    </aside>
  );
}
