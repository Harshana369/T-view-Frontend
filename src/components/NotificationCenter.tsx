import { useEffect, useRef, useState } from 'react';
import { useBreakoutScanner } from '../hooks/useBreakoutScanner';
import { formatPrice } from '../lib/format';
import { playAlertSound } from '../lib/sound';
import { useNotificationStore } from '../notificationStore';
import { useStore } from '../store';

/** "5s" / "3m" / "2h" වගේ කෙටි relative time එකක්. */
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/**
 * Toolbar එකේ bell icon එක — Breakout Targets indicator එකේ "Scan All
 * Coins" On කරලා තියෙනවා නම්, coins 526ම පසුබිමින් scan වෙලා අලුත් Entry
 * එකක් හම්බවුණු ගමන් මෙතන පේනවා. Alert එකක් click කළාම chart එක ඒ coin
 * එකට මාරු වෙනවා.
 */
export function NotificationCenter() {
  useBreakoutScanner();

  const alerts = useNotificationStore((s) => s.alerts);
  const unread = useNotificationStore((s) => s.unread);
  const scanning = useNotificationStore((s) => s.scanning);
  const scannedCount = useNotificationStore((s) => s.scannedCount);
  const lastScanAt = useNotificationStore((s) => s.lastScanAt);
  const error = useNotificationStore((s) => s.error);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);
  const soundOn = useNotificationStore((s) => s.soundOn);
  const toggleSound = useNotificationStore((s) => s.toggleSound);
  const setSymbol = useStore((s) => s.setSymbol);
  const scanOn = useStore((s) =>
    s.indicators.some((i) => i.defId === 'breakout' && i.params.scanAll === 'On'),
  );

  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="picker" ref={boxRef}>
      <button
        type="button"
        className={scanning ? 'notif-bell scanning' : 'notif-bell'}
        title="Breakout entry alerts"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markAllRead();
        }}
      >
        🔔
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="picker-pop notif-pop">
          <div className="notif-head">
            <span>Entry alerts</span>
            <button
              type="button"
              className="notif-sound"
              title={
                soundOn
                  ? 'Sound On — click කරලා off කරන්න'
                  : 'Sound Off — click කරලා on කරන්න'
              }
              aria-pressed={soundOn}
              onClick={() => {
                // Off → On කරද්දී එකපාරක් ගහනවා: ඇහෙනවද කියලා දැනගන්නත්,
                // browser autoplay permission එක මේ click එකෙන් ලැබෙන්නත්.
                if (!soundOn) playAlertSound('buy');
                toggleSound();
              }}
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>

          <div className="picker-meta">
            {!scanOn
              ? 'Breakout Targets එකේ "Scan All Coins" On කරන්න'
              : error
                ? `Scan failed: ${error}`
                : scanning
                  ? 'Scanning all coins…'
                  : lastScanAt !== null
                    ? `${scannedCount} coins scanned · ${timeAgo(lastScanAt)} ago`
                    : 'Starting…'}
          </div>

          {alerts.length === 0 ? (
            <div className="notif-empty">
              {scanOn ? 'තාම අලුත් entry එකක් නෑ' : 'Alerts මෙතන පේනවා'}
            </div>
          ) : (
            <ul className="notif-list">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="notif-item"
                    onClick={() => {
                      setSymbol(a.symbol);
                      setOpen(false);
                    }}
                  >
                    <span className={a.dir === 'buy' ? 'notif-dir up' : 'notif-dir down'}>
                      {a.dir === 'buy' ? '▲ BUY' : '▼ SELL'}
                    </span>
                    <span className="sym">
                      {a.symbol.replace(/USDT$/, '')}
                      <span className="dim"> · {a.interval}</span>
                    </span>
                    <span className="px">{formatPrice(a.entry)}</span>
                    <span className="notif-time">{timeAgo(a.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {alerts.length > 0 && (
            <button type="button" className="wl-ghost notif-clear" onClick={clear}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
