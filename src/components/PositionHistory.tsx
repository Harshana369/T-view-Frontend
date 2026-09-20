import { useMemo, useState } from 'react';
import type { PositionRecord } from '../lib/indicatorRegistry';
import { formatSize, formatUsd } from '../lib/position';

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

type Tab = 'open' | 'history';

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

        {total.n > 0 && (
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

      {open && (
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
