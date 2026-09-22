import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchPerpSymbols } from '../lib/binance';
import type { PositionRecord } from '../lib/indicatorRegistry';
import { mergeRetry, runGroupPnl, type GroupPnl } from '../lib/groupPnl';
import { formatSize, formatUsd } from '../lib/position';
import { ALL_GROUP_ID, useStore } from '../store';

/**
 * Binance Futures එකේ **Positions / Position History** කොටස වගේ පහළ
 * drawer එකක්.
 *
 * Backtest එකක trade එකක් = ඇත්තට වහපු position එකක්, ඒ නිසා Binance
 * එකේ තියෙන තීරු ටිකම මෙතනත් තියෙනවා: Side, Size, Entry, Close, PNL,
 * ROE%, Opened, Closed. එතන පුරුදු විදිහටම කියවන්න පුළුවන්.
 *
 * Data එන්නේ chart එකේ indicators වලින් — Bollinger + RSI trail
 * backtest එක on කළාම පේළි එනවා, නැත්නම් හිස්.
 */

const UP = '#26a69a';
const DOWN = '#ef5350';
const DIM = '#787b86';

type Tab = 'open' | 'history' | 'group';

/** Binance එකේ වගේ — "2026-09-18 14:30:15". */
function stamp(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
  );
}

/** Position එකක් කොච්චර කාලයක් විවෘතව තිබුණාද. */
function held(openedAt: number, closedAt: number): string {
  const mins = Math.round((closedAt - openedAt) / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function price(v: number): string {
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toPrecision(5);
}

/** Exit වුණේ මොකෙන්ද — Binance එකේ නැති දෙයක්, ඒත් backtest එකට වැදගත්. */
const REASON_LABEL: Record<string, string> = {
  stop: 'Stop Loss',
  breakeven: 'Break-even',
  trail: 'Trailing SL',
  target: 'Take Profit',
  opposite: 'Reverse Signal',
  open: 'Open',
};

export function PositionHistory({ positions }: { positions: PositionRecord[] }) {
  const [tab, setTab] = useState<Tab>('history');
  const [open, setOpen] = useState(true);

  // ── Group PNL ────────────────────────────────────────────────────
  const interval = useStore((st) => st.interval);
  const watchGroups = useStore((st) => st.watchGroups);
  const indicators = useStore((st) => st.indicators);
  const [groupId, setGroupId] = useState('');
  /**
   * "All coins" — Binance එකේ දැනට trading තියෙන හැම perp එකක්ම.
   * මේක store එකේ නෑ (Watchlist එකේත් live list එකෙන්මයි එන්නේ), ඒ
   * නිසා මෙතනත් එකපාරක් ගෙන්නගන්නවා.
   */
  const [allCoins, setAllCoins] = useState<string[]>([]);
  const [bars, setBars] = useState(3000);
  const [group, setGroup] = useState<GroupPnl | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [groupErr, setGroupErr] = useState<string | null>(null);
  /**
   * හැම group එකකම අන්තිම ප්‍රතිඵලය — "All groups" එකතුවට.
   *
   * Key එක `indicator|interval|candles` — settings වෙනස් run දෙකක්
   * එකට එකතු වෙන්නේ නෑ (ඒක වැරදි එකතුවක් වෙනවා). Browser එකේ
   * තියාගන්නවා, page එක refresh කළත් නැති වෙන්නේ නෑ.
   */
  const [saved, setSaved] = useState<Record<string, Record<string, SavedRun>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const [view, setView] = useState<'coins' | 'groups'>('coins');
  const abortRef = useRef<AbortController | null>(null);

  // Group tab එක බලනකොට විතරයි ගෙන්නන්නේ — නැතුව හැම විටම request එකක්.
  useEffect(() => {
    if (tab !== 'group' || allCoins.length > 0) return;
    let stopped = false;
    fetchPerpSymbols()
      .then((list) => {
        if (!stopped) setAllCoins(list.map((x) => x.symbol));
      })
      .catch(() => {
        // List එක නැතුවත් අනිත් groups වැඩ කරනවා.
      });
    return () => {
      stopped = true;
    };
  }, [tab, allCoins.length]);

  // Chart එකේ තියෙන backtest indicator එකේ settings — group එකටත් ඒවාම.
  // Backtest indicator දෙකක් තියෙනවා — Bollinger+RSI සහ Sniper. Chart
  // එකේ තියෙන ඒවා විතරයි මෙතන තෝරන්න පුළුවන් (settings ඒවායින්මයි
  // එන්නේ, ඒ නිසා මෙතන පේන ගණන chart එකට ගැළපෙනවා).
  const BACKTEST_DEFS: { id: string; label: string }[] = [
    { id: 'bbrsitrail', label: 'Bollinger + RSI' },
    { id: 'snipertrail', label: 'Sniper V.02' },
    { id: 'macdsmatrail2', label: 'MACD + SMA 200' },
    { id: 'breakouttrail', label: 'Breakout Targets' },
  ];
  const available = BACKTEST_DEFS.filter((d) => indicators.some((i) => i.defId === d.id));
  const [defId, setDefId] = useState('');
  const activeDefId = available.some((d) => d.id === defId)
    ? defId
    : (available[0]?.id ?? '');
  const trailInstance = indicators.find((i) => i.defId === activeDefId);

  // Dropdown එකේ පේන ලැයිස්තුව — "All coins" උඩම, ඊට පස්සේ user groups.
  const options = useMemo(
    () => [
      { id: ALL_GROUP_ID, name: 'All coins', symbols: allCoins },
      ...watchGroups.map((g) => ({ id: g.id, name: g.name, symbols: g.symbols })),
    ],
    [allCoins, watchGroups],
  );
  // Default එක **All coins** නෙවෙයි — ඒක coins 500ක් විතර, සහ list
  // එක එනකම් හිස්. ඒ නිසා user group එකක් default, All coins තෝරගන්න
  // පුළුවන් විදිහට list එකේ උඩම.
  const picked =
    options.find((g) => g.id === groupId) ??
    options.find((g) => g.id !== ALL_GROUP_ID) ??
    options[0];

  // Coins 500ක් වගේ දුවනකොට කොච්චර වෙලාද කියලා කලින්ම කියනවා.
  const heavy = (picked?.symbols.length ?? 0) > 60;

  const runKey = `${activeDefId}|${interval}|${bars}`;
  const savedHere = saved[runKey] ?? {};

  function remember(groupId: string, name: string, r: GroupPnl) {
    setSaved((prev) => {
      const next = {
        ...prev,
        [runKey]: { ...(prev[runKey] ?? {}), [groupId]: { name, result: r, at: Date.now() } },
      };
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        // Storage පිරිලා / private window — එකතුව session එකට විතරයි.
      }
      return next;
    });
  }

  /** Fail වුණු coins විතරක් ආපහු — 429 එකක් ඉවර වුණාට පස්සේ. */
  async function retryFailed() {
    if (!group || !picked || !trailInstance || group.failed.length === 0) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy({ done: 0, total: group.failed.length });
    try {
      const r = await runGroupPnl(
        activeDefId,
        group.failed,
        interval,
        trailInstance.params,
        bars,
        (done, total) => setBusy({ done, total }),
        ac.signal,
      );
      if (!ac.signal.aborted) {
        const merged = mergeRetry(group, r);
        setGroup(merged);
        remember(picked.id, picked.name, merged);
      }
    } finally {
      if (!ac.signal.aborted) setBusy(null);
    }
  }

  async function runGroup() {
    if (!picked || !trailInstance) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGroupErr(null);
    setGroup(null);
    setBusy({ done: 0, total: picked.symbols.length });
    try {
      const r = await runGroupPnl(
        activeDefId,
        picked.symbols,
        interval,
        trailInstance.params,
        bars,
        (done, total) => setBusy({ done, total }),
        ac.signal,
      );
      if (!ac.signal.aborted) {
        setGroup(r);
        remember(picked.id, picked.name, r);
        setView('coins');
      }
    } catch (err) {
      setGroupErr(err instanceof Error ? err.message : 'asarthakayi');
    } finally {
      if (!ac.signal.aborted) setBusy(null);
    }
  }

  const live = useMemo(() => positions.filter((p) => p.open), [positions]);
  const closed = useMemo(() => positions.filter((p) => !p.open), [positions]);

  // සාරාංශය — Binance එකේ නැහැ, ඒත් "මම ලාභද පාඩුද" කියන ප්‍රශ්නයට
  // උත්තරේ එක තැනකින් පේන්න ඕන.
  const total = useMemo(() => {
    const gross = closed.reduce((a, p) => a + p.grossUsd, 0);
    const pnl = closed.reduce((a, p) => a + p.realizedUsd, 0);
    const fees = closed.reduce((a, p) => a + p.feeUsd, 0);
    const wins = closed.filter((p) => p.realizedUsd > 0).length;
    const liq = closed.filter((p) => p.liquidated).length;
    return { gross, pnl, fees, wins, liq, n: closed.length };
  }, [closed]);

  const rows = tab === 'open' ? live : closed;

  return (
    <section className={`poshist${open ? '' : ' poshist-closed'}`}>
      <header className="poshist-head">
        <button
          type="button"
          className={`poshist-tab${tab === 'open' ? ' active' : ''}`}
          onClick={() => setTab('open')}
        >
          Positions{live.length > 0 ? ` (${live.length})` : ''}
        </button>
        <button
          type="button"
          className={`poshist-tab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          Position History{closed.length > 0 ? ` (${closed.length})` : ''}
        </button>
        <button
          type="button"
          className={`poshist-tab${tab === 'group' ? ' active' : ''}`}
          onClick={() => setTab('group')}
          title="Watchlist group ekaka hama coin ekakama Realized PNL"
        >
          Group PNL
        </button>

        {tab === 'group' && group && (
          <span className="poshist-sum">
            <span className="dim">Gross</span>
            <span style={{ color: group.totals.grossUsd >= 0 ? UP : DOWN }}>
              {formatUsd(group.totals.grossUsd)}
            </span>
            <span className="dim">&minus; Fees</span>
            <span className="poshist-fee">${group.totals.feeUsd.toFixed(2)}</span>
            <span className="dim">=</span>
            <span className="dim">Realized PNL</span>
            <strong style={{ color: group.totals.realizedUsd >= 0 ? UP : DOWN }}>
              {formatUsd(group.totals.realizedUsd)}
            </strong>
            <span className="dim">
              {group.totals.wins}/{group.totals.trades} won &middot;{' '}
              {group.rows.filter((r) => !r.error).length} coins
              {group.totals.liquidated > 0 ? ` - ${group.totals.liquidated} liquidated` : ''}
            </span>
          </span>
        )}
        {tab !== 'group' && total.n > 0 && (
          <span className="poshist-sum">
            {/* Gross − fees = realized. එකතුව වෙනුවට **අඩු කිරීම**
                පේන්න ඕන — නැත්නම් fees වෙනම යන එකක් වගේ පේනවා. */}
            <span className="dim">Gross</span>
            <span style={{ color: total.gross >= 0 ? UP : DOWN }}>{formatUsd(total.gross)}</span>
            <span className="dim">− Fees</span>
            <span className="poshist-fee">${total.fees.toFixed(2)}</span>
            <span className="dim">=</span>
            <span className="dim">Realized PNL</span>
            <strong style={{ color: total.pnl >= 0 ? UP : DOWN }}>{formatUsd(total.pnl)}</strong>
            <span className="dim">
              {total.wins}/{total.n} won
              {total.liq > 0 ? ` · ${total.liq} liquidated` : ''}
            </span>
          </span>
        )}

        <button
          type="button"
          className="poshist-toggle"
          title={open ? 'හකුළන්න' : 'පෙන්නන්න'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▴'}
        </button>
      </header>

      {open && tab === 'group' && (
        <div className="poshist-body">
          <div className="poshist-controls">
            <select value={picked?.id ?? ''} onChange={(e) => setGroupId(e.target.value)}>
              {options.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.symbols.length})
                </option>
              ))}
            </select>
            {available.length > 1 && (
              <select value={activeDefId} onChange={(e) => setDefId(e.target.value)}>
                {available.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
            <label>
              Candles
              <input
                type="number"
                min={500}
                max={20000}
                step={500}
                value={bars}
                onChange={(e) => setBars(Math.max(500, Number(e.target.value) || 3000))}
              />
            </label>
            <span className="dim">{interval}</span>
            <button
              type="button"
              className="poshist-run"
              disabled={!!busy || !picked || picked.symbols.length === 0 || !trailInstance}
              onClick={runGroup}
            >
              {busy ? `Running ${busy.done}/${busy.total}...` : 'Run backtest'}
            </button>
            {heavy && !busy && (
              <span className="poshist-warn" title="Coins gaana wediyi">
                {picked.symbols.length} coins
              </span>
            )}
            {group && group.failed.length > 0 && !busy && (
              <button
                type="button"
                className="poshist-stop"
                title="Fail වුණු coins විතරක් ආපහු — විනාඩියක් විතර ඉඳලා එබෙන්න"
                onClick={() => void retryFailed()}
              >
                Retry failed ({group.failed.length})
              </button>
            )}
            {Object.keys(savedHere).length > 0 && (
              <button
                type="button"
                className={`poshist-tab${view === 'groups' ? ' active' : ''}`}
                onClick={() => setView((v) => (v === 'groups' ? 'coins' : 'groups'))}
                title="Run කරපු groups ඔක්කොගේම එකතුව"
              >
                &Sigma; All groups ({Object.keys(savedHere).length})
              </button>
            )}
            {busy && (
              <button
                type="button"
                className="poshist-stop"
                onClick={() => {
                  abortRef.current?.abort();
                  setBusy(null);
                }}
              >
                Stop
              </button>
            )}
          </div>

          {!trailInstance ? (
            <p className="poshist-empty">
              Chart ekata "Bollinger + RSI - Break-even &amp; Trail Backtest" indicator eka
              mulinma ekathu karanna &mdash; group ekata duwannet ekeh settings ekkamayi.
            </p>
          ) : view === 'groups' ? (
            <AllGroupsTable
              runs={savedHere}
              onClear={() => {
                setSaved((prev) => {
                  const next = { ...prev };
                  delete next[runKey];
                  try {
                    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
                  } catch {
                    /* ignore */
                  }
                  return next;
                });
                setView('coins');
              }}
            />
          ) : groupErr ? (
            <p className="poshist-empty">{groupErr}</p>
          ) : !group ? (
            <p className="poshist-empty">
              {picked && picked.symbols.length > 0
                ? `"${picked.name}" group eke coins ${picked.symbols.length} ta backtest eka duwawanna "Run backtest" ebenna.` +
                  (heavy ? ` (Coins ${picked.symbols.length}k nisa minuththu kihipayak yanna puluwan.)` : '')
                : picked?.id === ALL_GROUP_ID
                  ? 'Binance coin list eka gennanawa...'
                  : 'Me group eke coins naha.'}
            </p>
          ) : (
            <table className="poshist-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="num">Trades</th>
                  <th className="num">Win rate</th>
                  <th className="num">Gross PNL</th>
                  <th className="num">Fees</th>
                  <th className="num">Realized PNL</th>
                  <th className="num">Liq.</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="poshist-sym">{r.symbol}</td>
                    {r.error ? (
                      <td className="dim" colSpan={6}>
                        {r.error}
                      </td>
                    ) : (
                      <>
                        <td className="num">{r.trades}</td>
                        <td className="num">
                          {r.trades ? `${((100 * r.wins) / r.trades).toFixed(0)}%` : '-'}
                        </td>
                        <td className="num" style={{ color: r.grossUsd >= 0 ? UP : DOWN }}>
                          {formatUsd(r.grossUsd)}
                        </td>
                        <td className="num poshist-fee">-${r.feeUsd.toFixed(2)}</td>
                        <td
                          className="num poshist-net"
                          style={{ color: r.realizedUsd >= 0 ? UP : DOWN }}
                        >
                          {formatUsd(r.realizedUsd)}
                        </td>
                        <td className="num dim">{r.liquidated || ''}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="poshist-total">
                  <td>TOTAL</td>
                  <td className="num">{group.totals.trades}</td>
                  <td className="num">
                    {group.totals.trades
                      ? `${((100 * group.totals.wins) / group.totals.trades).toFixed(0)}%`
                      : '-'}
                  </td>
                  <td className="num" style={{ color: group.totals.grossUsd >= 0 ? UP : DOWN }}>
                    {formatUsd(group.totals.grossUsd)}
                  </td>
                  <td className="num poshist-fee">-${group.totals.feeUsd.toFixed(2)}</td>
                  <td
                    className="num poshist-net"
                    style={{ color: group.totals.realizedUsd >= 0 ? UP : DOWN }}
                  >
                    {formatUsd(group.totals.realizedUsd)}
                  </td>
                  <td className="num dim">{group.totals.liquidated || ''}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {open && tab !== 'group' && (
        <div className="poshist-body">
          {rows.length === 0 ? (
            <p className="poshist-empty">
              {positions.length === 0
                ? 'Bollinger + RSI - Break-even & Trail Backtest indicator එක chart එකට එකතු කළාම positions මෙතන පේනවා.'
                : tab === 'open'
                  ? 'විවෘත position එකක් නෑ.'
                  : 'වැහුණු position එකක් නෑ.'}
            </p>
          ) : (
            <table className="poshist-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th className="num">Size</th>
                  <th className="num">Entry Price</th>
                  <th className="num">{tab === 'open' ? 'Mark Price' : 'Close Price'}</th>
                  <th className="num">Gross PNL</th>
                  <th className="num">Fees</th>
                  <th className="num" title="Fees අඩු කරපු එක">
                    Realized PNL
                  </th>
                  <th className="num">ROE%</th>
                  <th>Exit</th>
                  <th>Opened</th>
                  <th>{tab === 'open' ? 'Held' : 'Closed'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const win = p.realizedUsd >= 0;
                  return (
                    <tr key={`${p.symbol}-${p.openedAt}-${i}`}>
                      <td className="poshist-sym">
                        {p.symbol}
                        <span className="poshist-lev">
                          {' '}
                          Perp {p.leverage}x
                        </span>
                      </td>
                      <td style={{ color: p.dir === 1 ? UP : DOWN }}>
                        {p.dir === 1 ? 'Long' : 'Short'}
                      </td>
                      <td className="num">
                        {formatSize(p.size)}
                        <span className="dim"> (${p.notionalUsd.toFixed(0)})</span>
                      </td>
                      <td className="num">{price(p.entryPrice)}</td>
                      <td className="num">{price(p.closePrice)}</td>
                      <td className="num" style={{ color: p.grossUsd >= 0 ? UP : DOWN }}>
                        {formatUsd(p.grossUsd)}
                      </td>
                      <td className="num poshist-fee">-${p.feeUsd.toFixed(2)}</td>
                      <td className="num poshist-net" style={{ color: win ? UP : DOWN }}>
                        {formatUsd(p.realizedUsd)}
                        {p.liquidated && <span className="poshist-liq"> LIQ</span>}
                      </td>
                      <td className="num" style={{ color: win ? UP : DOWN }}>
                        {p.roePct >= 0 ? '+' : ''}
                        {p.roePct.toFixed(1)}%
                      </td>
                      <td style={{ color: p.reason === 'stop' ? DOWN : DIM }}>
                        {REASON_LABEL[p.reason] ?? p.reason}
                      </td>
                      <td className="dim">{stamp(p.openedAt)}</td>
                      <td className="dim">
                        {p.open ? held(p.openedAt, p.closedAt) : stamp(p.closedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

const SAVED_KEY = 'groupPnl.saved.v1';

interface SavedRun {
  name: string;
  result: GroupPnl;
  at: number;
}

/**
 * Groups ඔක්කොගේම එකතුව.
 *
 * Coins 528ම එකවර දුවවනකොට Binance 429 එනවා, ඒ නිසා groups 6කට
 * බෙදලා එකින් එක දුවවනවා — මේ table එක ඒ ඔක්කොම එකට එකතු කරනවා.
 * Fail වුණු coins එකතුවට ගණන් ගන්නේ නෑ, ඒත් ඒ ගාණ පේනවා — ඒ නිසා
 * එකතුව සම්පූර්ණද කියලා දැනගන්න පුළුවන්.
 */
function AllGroupsTable({
  runs,
  onClear,
}: {
  runs: Record<string, SavedRun>;
  onClear: () => void;
}) {
  // Group 1, Group 2 ... නමින් පිළිවෙළට.
  const list = Object.values(runs).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const T = list.reduce(
    (a, g) => {
      const t = g.result.totals;
      a.coins += g.result.rows.length - g.result.failed.length;
      a.failed += g.result.failed.length;
      a.trades += t.trades;
      a.wins += t.wins;
      a.gross += t.grossUsd;
      a.fees += t.feeUsd;
      a.pnl += t.realizedUsd;
      a.liq += t.liquidated;
      return a;
    },
    { coins: 0, failed: 0, trades: 0, wins: 0, gross: 0, fees: 0, pnl: 0, liq: 0 },
  );
  const winPct = (w: number, n: number) => (n ? `${((100 * w) / n).toFixed(0)}%` : '-');

  return (
    <table className="poshist-table">
      <thead>
        <tr>
          <th>Group</th>
          <th className="num">Coins</th>
          <th className="num">Failed</th>
          <th className="num">Trades</th>
          <th className="num">Win rate</th>
          <th className="num">Gross PNL</th>
          <th className="num">Fees</th>
          <th className="num">Realized PNL</th>
          <th className="num">Liq.</th>
        </tr>
      </thead>
      <tbody>
        {list.map((g) => {
          const t = g.result.totals;
          return (
            <tr key={g.name}>
              <td className="poshist-sym">{g.name}</td>
              <td className="num">{g.result.rows.length - g.result.failed.length}</td>
              <td className="num" style={{ color: g.result.failed.length ? DOWN : DIM }}>
                {g.result.failed.length || ''}
              </td>
              <td className="num">{t.trades}</td>
              <td className="num">{winPct(t.wins, t.trades)}</td>
              <td className="num" style={{ color: t.grossUsd >= 0 ? UP : DOWN }}>
                {formatUsd(t.grossUsd)}
              </td>
              <td className="num poshist-fee">-${t.feeUsd.toFixed(2)}</td>
              <td className="num poshist-net" style={{ color: t.realizedUsd >= 0 ? UP : DOWN }}>
                {formatUsd(t.realizedUsd)}
              </td>
              <td className="num dim">{t.liquidated || ''}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="poshist-total">
          <td>
            ALL GROUPS{' '}
            <button type="button" className="poshist-clear" onClick={onClear}>
              clear
            </button>
          </td>
          <td className="num">{T.coins}</td>
          <td className="num" style={{ color: T.failed ? DOWN : DIM }}>
            {T.failed || ''}
          </td>
          <td className="num">{T.trades}</td>
          <td className="num">{winPct(T.wins, T.trades)}</td>
          <td className="num" style={{ color: T.gross >= 0 ? UP : DOWN }}>
            {formatUsd(T.gross)}
          </td>
          <td className="num poshist-fee">-${T.fees.toFixed(2)}</td>
          <td className="num poshist-net" style={{ color: T.pnl >= 0 ? UP : DOWN }}>
            {formatUsd(T.pnl)}
          </td>
          <td className="num dim">{T.liq || ''}</td>
        </tr>
      </tfoot>
    </table>
  );
}
