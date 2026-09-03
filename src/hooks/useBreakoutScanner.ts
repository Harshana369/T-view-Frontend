import { useEffect, useRef } from 'react';
import { useNotificationStore } from '../notificationStore';
import { useStore } from '../store';

/**
 * Scan එකක් අහන පරතරය. Scan එක server එකේ (Postgres candles එකෙන්) වෙන
 * නිසා මේක ලාභයි — browser එකට එන්නේ hits ටික විතරයි (KB කීපයක්), coins
 * 526ක candles නෙවෙයි. Server එකේ result එක තත්පර 15ක් cache වෙනවා, ඒ
 * නිසා tabs කීපයක් තිබ්බත් sweep එකක් දෙපාරක් දුවන්නේ නෑ.
 */
const POLL_MS = 20_000;

interface BreakoutHit {
  symbol: string;
  dir: 'buy' | 'sell';
  key: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  time: number;
  barsAgo: number;
}

interface ScanResponse {
  interval: string;
  scanned: number;
  hits: BreakoutHit[];
  tookMs: number;
}

/**
 * Chart එකේ "Breakout Targets | AlgoAlpha" indicator එකක් **Scan All
 * Coins: On** කරලා තියෙනවා නම්, coins 526ම පසුබිමින් scan කරලා අලුත්
 * Entry එකක් හම්බවුණු ගමන් bell icon එකට notification එකක් දානවා.
 *
 * "අලුත්" කියන එක තැන් දෙකකින් තීරණය වෙනවා:
 *   1. Server එකෙන් එන්නේ අන්තිම candles කීපයක් ඇතුළත හැදුණු entries විතරයි
 *      (`maxBarsAgo`) — history එකේ තියෙන පරණ trade එකක් එන්නේ නෑ.
 *   2. මෙතන symbol එකකට අන්තිම දැක්ක trade key එක මතක තියාගන්නවා — එකම
 *      entry එකට දෙපාරක් notify වෙන්නේ නෑ. පළමු වතාවට දකින එක baseline එකක්.
 */
export function useBreakoutScanner(): void {
  const indicators = useStore((s) => s.indicators);
  const config = indicators.find((i) => i.defId === 'breakout' && i.params.scanAll === 'On');

  const push = useNotificationStore((s) => s.push);
  const setScanning = useNotificationStore((s) => s.setScanning);
  const setScanInfo = useNotificationStore((s) => s.setScanInfo);

  // symbol => අන්තිම දැක්ක trade key. පළමු වතාවට දකින එකට notify කරන්නේ නෑ.
  const lastSeen = useRef<Record<string, string>>({});

  const scanTf = String(config?.params.scanTf ?? '1h');
  const length = Number(config?.params.length ?? 99);
  const atrPeriod = Number(config?.params.atrPeriod ?? 14);
  const slMult = Number(config?.params.slMult ?? 5);
  const tp1 = Number(config?.params.tp1 ?? 0.5);
  const tp2 = Number(config?.params.tp2 ?? 1);
  const tp3 = Number(config?.params.tp3 ?? 1.5);
  const overlap = String(config?.params.overlap ?? 'On');
  const enabled = Boolean(config);

  useEffect(() => {
    if (!enabled) {
      setScanning(false);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      setScanning(true);
      try {
        const params = new URLSearchParams({
          interval: scanTf,
          length: String(length),
          atrPeriod: String(atrPeriod),
          slMult: String(slMult),
          tp1: String(tp1),
          tp2: String(tp2),
          tp3: String(tp3),
          overlap,
        });
        const res = await fetch(`/api/scan/breakout?${params}`);
        if (!res.ok) {
          // Scan එක වෙන්නේ server එකේ — ඒක නැත්නම් 502/503/404 එකක් එනවා.
          // "502" කියලා පෙන්නනවට වඩා මොකද කරන්න ඕන කියලා කියනවා.
          if (res.status === 502 || res.status === 503 || res.status === 404) {
            throw new Error('backend එක දුවනවද බලන්න (apps2/server → npm start)');
          }
          throw new Error(`scan failed: ${res.status}`);
        }
        const data = (await res.json()) as ScanResponse;
        if (cancelled) return;

        for (const hit of data.hits) {
          const seen = lastSeen.current[hit.symbol];
          lastSeen.current[hit.symbol] = hit.key;
          if (seen === undefined || seen === hit.key) continue; // baseline / දැනටමත් දැක්ක එක
          push({
            symbol: hit.symbol,
            dir: hit.dir,
            entry: hit.entry,
            sl: hit.sl,
            tp1: hit.tp1,
            interval: data.interval,
          });
        }
        setScanInfo(data.scanned, null);
      } catch (err) {
        if (!cancelled) {
          // Server එකම හම්බවුණේ නැත්නම් fetch එකම throw වෙනවා (TypeError) —
          // ඒකටත් එකම තේරෙන message එකම.
          const message =
            err instanceof TypeError
              ? 'backend එක දුවනවද බලන්න (apps2/server → npm start)'
              : err instanceof Error
                ? err.message
                : String(err);
          setScanInfo(0, message);
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      setScanning(false);
    };
  }, [
    enabled,
    scanTf,
    length,
    atrPeriod,
    slMult,
    tp1,
    tp2,
    tp3,
    overlap,
    push,
    setScanning,
    setScanInfo,
  ]);
}
