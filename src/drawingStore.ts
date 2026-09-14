import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Drawing, DrawingKind } from './lib/drawings';

/**
 * Chart එකේ අතින් ඇඳපු දේවල් — coin එකට සහ timeframe එකට වෙන වෙනම
 * තියාගන්නවා (BTC 1h එකේ ඇඳපු trendline එක ETH 4h එකේ පේන්න හොඳ නෑ),
 * සහ browser එකේ save වෙනවා ඒ නිසා refresh කළාම නැති වෙන්නේ නෑ.
 */

/** Drawings තියාගන්න key එක. */
export function chartKey(symbol: string, interval: string): string {
  return `${symbol}|${interval}`;
}

export const DRAW_COLORS = [
  '#2962ff',
  '#26a69a',
  '#ef5350',
  '#ffb300',
  '#ab47bc',
  '#d1d4dc',
] as const;

interface DrawingState {
  /** `SYMBOL|interval` → ඒ chart එකේ drawings. */
  byChart: Record<string, Drawing[]>;
  /** දැන් තෝරලා තියෙන tool එක — null නම් select/move mode. */
  activeTool: DrawingKind | null;
  selectedId: string | null;
  color: string;
  width: number;
  /** Toolbar එකේ තැන (px, chart එකට සාපේක්ෂව) — ඇදගෙන යන්න පුළුවන්. */
  toolbarPos: { x: number; y: number };

  setTool: (tool: DrawingKind | null) => void;
  setSelected: (id: string | null) => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  setToolbarPos: (pos: { x: number; y: number }) => void;

  add: (key: string, drawing: Drawing) => void;
  update: (key: string, id: string, points: Drawing['points']) => void;
  remove: (key: string, id: string) => void;
  clear: (key: string) => void;
}

export const useDrawingStore = create<DrawingState>()(
  persist(
    (set) => ({
      byChart: {},
      activeTool: null,
      selectedId: null,
      color: DRAW_COLORS[0],
      width: 2,
      toolbarPos: { x: 16, y: 64 },

      setTool: (activeTool) => set({ activeTool, selectedId: null }),
      setSelected: (selectedId) => set({ selectedId }),
      setColor: (color) => set({ color }),
      setWidth: (width) => set({ width }),
      setToolbarPos: (toolbarPos) => set({ toolbarPos }),

      add: (key, drawing) =>
        set((s) => ({
          byChart: { ...s.byChart, [key]: [...(s.byChart[key] ?? []), drawing] },
          // ඇඳලා ඉවර වුණු ගමන් ඒක තෝරලා තියෙනවා — වහාම ගෙනියන්න පුළුවන්.
          selectedId: drawing.id,
        })),

      update: (key, id, points) =>
        set((s) => ({
          byChart: {
            ...s.byChart,
            [key]: (s.byChart[key] ?? []).map((d) => (d.id === id ? { ...d, points } : d)),
          },
        })),

      remove: (key, id) =>
        set((s) => ({
          byChart: { ...s.byChart, [key]: (s.byChart[key] ?? []).filter((d) => d.id !== id) },
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      clear: (key) =>
        set((s) => ({ byChart: { ...s.byChart, [key]: [] }, selectedId: null })),
    }),
    {
      name: 'chart-drawings',
      // Tool එකක් තෝරලා තියෙන එකයි selection එකයි session එකට විතරයි —
      // ඇඳපු දේවල් සහ පාට/ඝනකම තේරීම් විතරක් save වෙනවා.
      partialize: (s) => ({
        byChart: s.byChart,
        color: s.color,
        width: s.width,
        toolbarPos: s.toolbarPos,
      }),
    },
  ),
);
