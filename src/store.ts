import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultParams, indicatorById, type ParamValue, type Params } from './lib/indicatorRegistry';
import type { Interval } from './lib/types';

/** Chart එකට add කරලා තියෙන එක indicator instance එකක්. */
export interface ActiveIndicator {
  /** එකම indicator එක දෙපාරක් (උදා: EMA 21 + EMA 200) දාන්න පුළුවන් නිසා unique id එකක්. */
  instanceId: string;
  /** indicatorRegistry.ts එකේ definition id එක. */
  defId: string;
  /** Length වගේ number settings සහ MA type වගේ dropdown settings. */
  params: Params;
}

/** Watchlist එකේ එක group එකක් (උදා: Favorites, Majors, Memes). */
export interface WatchGroup {
  id: string;
  name: string;
  /** Group එකේ coins, පෙන්නන පිළිවෙලට. */
  symbols: string[];
}

/**
 * "සියලුම coins" group එකේ id එක. මේක store එකේ save වෙන්නේ නෑ —
 * Binance එකේ දැනට trading තියෙන හැම perp එකක්ම live list එකෙන් එනවා.
 */
export const ALL_GROUP_ID = 'all';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

interface AppState {
  symbol: string;
  interval: Interval;
  indicators: ActiveIndicator[];
  /** User හදාගත්ත groups ටික (ALL group එක මේකේ නෑ). */
  watchGroups: WatchGroup[];
  /** දැන් බලාගෙන ඉන්න group එක — `ALL_GROUP_ID` හෝ group id එකක්. */
  activeGroupId: string;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
  setActiveGroup: (groupId: string) => void;
  /** අලුත් group එකක් හදලා ඒකේ id එක දෙනවා. */
  addGroup: (name: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  removeGroup: (groupId: string) => void;
  /** Group එකක් දුන්නේ නැත්නම් active එකට (ALL නම් අන්තිමට පාවිච්චි කළ එකට). */
  addToWatchlist: (symbol: string, groupId?: string) => void;
  removeFromWatchlist: (symbol: string, groupId?: string) => void;
  addIndicator: (defId: string) => void;
  removeIndicator: (instanceId: string) => void;
  setParam: (instanceId: string, key: string, value: ParamValue) => void;
}

/** Group එකකට කෙටි unique id එකක්. */
function newGroupId(): string {
  return `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Coin එකක් දාන්න/අයින් කරන්න ඕන group එක තෝරගන්නවා (ALL එකට save කරන්න බෑ). */
function targetGroupId(state: AppState, groupId?: string): string | null {
  const wanted = groupId ?? state.activeGroupId;
  if (wanted !== ALL_GROUP_ID) return wanted;
  // ALL group එකේ ඉඳන් දාන්නේ නම් — පළමු custom group එකට.
  return state.watchGroups[0]?.id ?? null;
}

export const useStore = create<AppState>()(
  // persist: තෝරගත්ත coin එක, timeframe එක, indicators ටික, watchlist groups
  // browser එකේ save වෙනවා — refresh කළාම ආපහු එතනින්ම පටන් ගන්න.
  persist(
    (set, get) => ({
      symbol: 'BTCUSDT',
      interval: '15m',
      indicators: [],
      watchGroups: [{ id: 'favorites', name: 'Favorites', symbols: DEFAULT_SYMBOLS }],
      activeGroupId: 'favorites',

      setSymbol: (symbol) => set({ symbol }),
      setInterval: (interval) => set({ interval }),
      setActiveGroup: (activeGroupId) => set({ activeGroupId }),

      addGroup: (name) => {
        const id = newGroupId();
        set((s) => ({
          watchGroups: [...s.watchGroups, { id, name: name.trim() || 'New group', symbols: [] }],
          activeGroupId: id,
        }));
        return id;
      },

      renameGroup: (groupId, name) =>
        set((s) => ({
          watchGroups: s.watchGroups.map((g) =>
            g.id === groupId ? { ...g, name: name.trim() || g.name } : g,
          ),
        })),

      removeGroup: (groupId) =>
        set((s) => {
          const watchGroups = s.watchGroups.filter((g) => g.id !== groupId);
          return {
            watchGroups,
            // අයින් කරපු එකේ හිටියා නම් ඊළඟ group එකට (නැත්නම් ALL එකට).
            activeGroupId:
              s.activeGroupId === groupId
                ? (watchGroups[0]?.id ?? ALL_GROUP_ID)
                : s.activeGroupId,
          };
        }),

      /** දැනටමත් group එකේ තියෙනවා නම් දෙපාරක් දාන්නේ නෑ. */
      addToWatchlist: (symbol, groupId) =>
        set((s) => {
          const target = targetGroupId(get(), groupId);
          if (target === null) {
            // Custom group එකක්වත් නෑ — Favorites එකක් හදලා දානවා.
            const id = newGroupId();
            return {
              watchGroups: [...s.watchGroups, { id, name: 'Favorites', symbols: [symbol] }],
              activeGroupId: id,
            };
          }
          return {
            watchGroups: s.watchGroups.map((g) =>
              g.id === target && !g.symbols.includes(symbol)
                ? { ...g, symbols: [...g.symbols, symbol] }
                : g,
            ),
          };
        }),

      removeFromWatchlist: (symbol, groupId) =>
        set((s) => {
          const target = targetGroupId(get(), groupId);
          if (target === null) return s;
          return {
            watchGroups: s.watchGroups.map((g) =>
              g.id === target ? { ...g, symbols: g.symbols.filter((w) => w !== symbol) } : g,
            ),
          };
        }),

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
    {
      name: 'apps2-chart',
      // v0 = Coinbase INTX symbols (BTC-PERP)
      // v1 = Binance symbols (BTCUSDT), watchlist එකක්
      // v2 = watchlist එක වෙනුවට groups
      version: 2,
      migrate: (state, version) => {
        const old = { ...(state as Partial<AppState> & { watchlist?: string[] }) };

        if (version < 1) {
          const toBinance = (s: string) => s.replace(/-PERP$/, 'USDT');
          old.symbol = old.symbol ? toBinance(old.symbol) : 'BTCUSDT';
          old.watchlist = (old.watchlist ?? []).map(toBinance);
        }

        if (version < 2) {
          // කලින් තිබුණු එක list එක "Favorites" group එකක් වෙනවා.
          const symbols = old.watchlist?.length ? old.watchlist : DEFAULT_SYMBOLS;
          old.watchGroups = [{ id: 'favorites', name: 'Favorites', symbols }];
          old.activeGroupId = 'favorites';
          delete old.watchlist;
        }

        return old as AppState;
      },
    },
  ),
);
