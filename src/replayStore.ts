import { create } from 'zustand';

/**
 * Bar Replay — chart එක පරණ candle එකකට ආපහු ගෙනිහින්, ඒතැන ඉඳන් ඉස්සරහට
 * candle එකෙන් එක play කරන එක. Backtest කරන්න, setup එකක් හැදුණු හැටි
 * ආපහු බලන්න හොඳයි.
 *
 * අනාගත data එක chart එකෙන් සම්පූර්ණයෙන් **අයින් වෙනවා** — indicators
 * ගණන් හදන්නෙත් cursor එකට කලින් තියෙන candles වලින් විතරයි. එහෙම නැත්නම්
 * replay එකෙන් වැඩක් නෑ, indicator එකට උත්තරේ කලින්ම පේනවා.
 */

/** 1x වේගයේදී candle එකකට ගතවෙන කාලය. */
const BASE_MS = 700;

export const REPLAY_SPEEDS = [0.5, 1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

interface ReplayState {
  active: boolean;
  /** Chart එකේ පේන අන්තිම candle එකේ index එක (මුළු array එකට සාපේක්ෂව). */
  cursor: number;
  playing: boolean;
  speed: ReplaySpeed;
  /** Chart එකේ click කරලා පටන්ගන්න තැන තෝරන mode එක. */
  picking: boolean;

  start: (cursor: number) => void;
  stop: () => void;
  setCursor: (cursor: number) => void;
  step: (delta: number, max: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setPicking: (picking: boolean) => void;
}

/** Speed එකට අනුව candle එකකට ගතවෙන කාලය. */
export function stepDelay(speed: ReplaySpeed): number {
  return BASE_MS / speed;
}

export const useReplayStore = create<ReplayState>()((set) => ({
  active: false,
  cursor: 0,
  playing: false,
  speed: 1,
  picking: false,

  start: (cursor) => set({ active: true, cursor, playing: false, picking: false }),
  stop: () => set({ active: false, playing: false, picking: false }),
  setCursor: (cursor) => set({ cursor }),

  step: (delta, max) =>
    set((s) => {
      const next = Math.max(0, Math.min(max, s.cursor + delta));
      // කෙළවරට ගියාම play එක නවතිනවා.
      return { cursor: next, playing: next >= max ? false : s.playing };
    }),

  setPlaying: (playing) => set({ playing }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setPicking: (picking) => set({ picking }),
}));
