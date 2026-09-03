import { create } from 'zustand';

/** Scanner එකෙන් හම්බවුණු එක breakout entry alert එකක්. */
export interface EntryAlert {
  id: string;
  symbol: string;
  dir: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp1: number;
  interval: string;
  createdAt: number;
}

/** Bell dropdown එකේ තියාගන්න උපරිම alerts ගාණ. */
const MAX_ALERTS = 60;

interface NotificationState {
  alerts: EntryAlert[];
  unread: number;
  scanning: boolean;
  /** අන්තිම scan එකේ තොරතුරු — bell dropdown එකේ පෙන්නන්න. */
  lastScanAt: number | null;
  scannedCount: number;
  error: string | null;
  push: (alert: Omit<EntryAlert, 'id' | 'createdAt'>) => void;
  markAllRead: () => void;
  clear: () => void;
  setScanning: (scanning: boolean) => void;
  setScanInfo: (scannedCount: number, error: string | null) => void;
}

/**
 * Breakout scanner එකෙන් හදාගන්න entry alerts ටික. Watchlist/indicators
 * වගේ browser එකේ save වෙන්නේ නෑ (session එකකට විතරයි ඕන).
 */
export const useNotificationStore = create<NotificationState>((set) => ({
  alerts: [],
  unread: 0,
  scanning: false,
  lastScanAt: null,
  scannedCount: 0,
  error: null,

  push: (alert) =>
    set((s) => ({
      alerts: [
        {
          ...alert,
          id: `${alert.symbol}-${alert.entry}-${Date.now()}`,
          createdAt: Date.now(),
        },
        ...s.alerts,
      ].slice(0, MAX_ALERTS),
      unread: s.unread + 1,
    })),

  markAllRead: () => set({ unread: 0 }),
  clear: () => set({ alerts: [], unread: 0 }),
  setScanning: (scanning) => set({ scanning }),
  setScanInfo: (scannedCount, error) =>
    set({ scannedCount, error, lastScanAt: Date.now() }),
}));
