import { TIMEFRAMES } from '../lib/timeframes';
import type { Interval } from '../lib/types';

interface Props {
  value: Interval;
  onChange: (interval: Interval) => void;
}

/**
 * Timeframe (1m ... 1D) තෝරන button row එක.
 * List එක එන්නේ lib/timeframes.ts එකෙන් — Binance support කරන ඒවා විතරයි.
 */
export function TimeframeBar({ value, onChange }: Props) {
  return (
    <div className="tf-bar" role="group" aria-label="Timeframe">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.code}
          type="button"
          className={tf.code === value ? 'tf active' : 'tf'}
          onClick={() => onChange(tf.code)}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
