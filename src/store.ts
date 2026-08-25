import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultParams, indicatorById } from './lib/indicatorRegistry';
import type { Interval } from './lib/types';

/** Chart එකට add කරලා තියෙන එක indicator instance එකක්. */
export interface ActiveIndicator {
  /** එකම indicator එක දෙපාරක් (උදා: EMA 21 + EMA 200) දාන්න පුළුවන් නිසා unique id එකක්. */
  instanceId: string;
  /** indicatorRegistry.ts එකේ definition id එක. */
  defId: string;
  params: Record<string, number>;
}

interface AppState {
  symbol: string;
  interval: Interval;
  indicators: ActiveIndicator[];
  /** Watchlist panel එකේ පේළි — Coinbase symbol ටික, පෙන්නන පිළිවෙලට. */
  watchlist: string[];
  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  addIndicator: (defId: string) => void;
  removeIndicator: (instanceId: string) => void;
  setParam: (instanceId: string, key: string, value: number) => void;
}

export const useStore = create<AppState>()(
  // persist: තෝරගත්ත coin එක, timeframe එක, indicators ටික browser එකේ
  // save වෙනවා — refresh කළාම ආපහු එතනින්ම පටන් ගන්න.
  persist(
    (set) => ({
      symbol: 'BTC-PERP',
      interval: '15m',
      indicators: [],
      watchlist: ['BTC-PERP', 'ETH-PERP', 'BNB-PERP', 'SOL-PERP', 'XRP-PERP'],

      setSymbol: (symbol) => set({ symbol }),
      setInterval: (interval) => set({ interval }),

      /** දැනටමත් list එකේ තියෙනවා නම් දෙපාරක් දාන්නේ නෑ. */
      addToWatchlist: (symbol) =>
        set((s) => (s.watchlist.includes(symbol) ? s : { watchlist: [...s.watchlist, symbol] })),

      removeFromWatchlist: (symbol) =>
        set((s) => ({ watchlist: s.watchlist.filter((w) => w !== symbol) })),

      /** Registry එකේ default params එක්ක අලුත් indicator instance එකක් දානවා. */
      addIndicator: (defId) =>
        set((s) => {
          const def = indicatorById(defId);
          if (!def) return s;
          const instance: ActiveIndicator = {
            instanceId: `${defId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            defId,
            params: defaultParams(def),
          };
          return { indicators: [...s.indicators, instance] };
        }),

      removeIndicator: (instanceId) =>
        set((s) => ({ indicators: s.indicators.filter((i) => i.instanceId !== instanceId) })),

      /** එක indicator instance එකක setting එකක් විතරක් වෙනස් කරනවා. */
      setParam: (instanceId, key, value) =>
        set((s) => ({
          indicators: s.indicators.map((i) =>
            i.instanceId === instanceId ? { ...i, params: { ...i.params, [key]: value } } : i,
          ),
        })),
    }),
    { name: 'apps2-chart' },
  ),
);
