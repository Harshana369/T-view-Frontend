import { REPLAY_SPEEDS, useReplayStore, type ReplaySpeed } from '../replayStore';
import type { Candle } from '../lib/types';

/**
 * Bar Replay එකේ පාලක තීරුව — chart එකේ පතුලේ පාවෙනවා.
 * Replay එක off නම් පේන්නේ ⏪ බොත්තම විතරයි.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const Icon = {
  replay: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <path d="M4 10a6 6 0 1 0 2-4.5" {...stroke} />
      <polyline points="3,3 3,7 7,7" {...stroke} />
    </svg>
  ),
  toStart: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <polyline points="14,4 7,10 14,16" {...stroke} />
      <line x1="5" y1="4" x2="5" y2="16" {...stroke} />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <polyline points="13,4 6,10 13,16" {...stroke} />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <polygon points="6,4 16,10 6,16" fill="currentColor" stroke="none" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <rect x="6" y="4" width="3" height="12" fill="currentColor" stroke="none" />
      <rect x="11" y="4" width="3" height="12" fill="currentColor" stroke="none" />
    </svg>
  ),
  forward: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <polyline points="7,4 14,10 7,16" {...stroke} />
    </svg>
  ),
  toEnd: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <polyline points="6,4 13,10 6,16" {...stroke} />
      <line x1="15" y1="4" x2="15" y2="16" {...stroke} />
    </svg>
  ),
  pick: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <line x1="10" y1="3" x2="10" y2="17" {...stroke} />
      <line x1="3" y1="10" x2="17" y2="10" {...stroke} />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 20 20" width="16" height="16">
      <line x1="5" y1="5" x2="15" y2="15" {...stroke} />
      <line x1="15" y1="5" x2="5" y2="15" {...stroke} />
    </svg>
  ),
};

interface Props {
  candles: Candle[];
}

export function ReplayBar({ candles }: Props) {
  const active = useReplayStore((s) => s.active);
  const cursor = useReplayStore((s) => s.cursor);
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const picking = useReplayStore((s) => s.picking);
  const start = useReplayStore((s) => s.start);
  const stop = useReplayStore((s) => s.stop);
  const setCursor = useReplayStore((s) => s.setCursor);
  const step = useReplayStore((s) => s.step);
  const togglePlay = useReplayStore((s) => s.togglePlay);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setPicking = useReplayStore((s) => s.setPicking);

  const max = candles.length - 1;
  const atEnd = cursor >= max;

  if (!active) {
    return (
      <button
        className="replay-open"
        title="Bar Replay — පරණ candle එකකට ගිහින් ඉස්සරහට play කරන්න"
        disabled={candles.length < 10}
        onClick={() => {
          // Default එක: අන්තිම candles 150 ට කලින් — ඉස්සරහට play කරන්න
          // තරමක් දුරක් තියෙන්න.
          start(Math.max(0, max - 150));
        }}
      >
        {Icon.replay}
        <span>Replay</span>
      </button>
    );
  }

  const bar = candles[Math.min(cursor, max)];
  const when = bar
    ? new Date(bar.time * 1000).toLocaleString([], {
        year: '2-digit',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div className="replay-bar">
      <button
        className={`replay-btn${picking ? ' on' : ''}`}
        title="Chart එකේ click කරලා පටන්ගන්න තැන තෝරන්න"
        onClick={() => setPicking(!picking)}
      >
        {Icon.pick}
      </button>

      <span className="replay-sep" />

      <button className="replay-btn" title="මුලට" onClick={() => setCursor(0)} disabled={cursor === 0}>
        {Icon.toStart}
      </button>
      <button
        className="replay-btn"
        title="Candle එකක් පිටිපස්සට"
        onClick={() => step(-1, max)}
        disabled={cursor === 0}
      >
        {Icon.back}
      </button>
      <button
        className="replay-btn play"
        title={playing ? 'නවත්වන්න (Space)' : 'Play (Space)'}
        onClick={togglePlay}
        disabled={atEnd}
      >
        {playing ? Icon.pause : Icon.play}
      </button>
      <button
        className="replay-btn"
        title="Candle එකක් ඉස්සරහට (→)"
        onClick={() => step(1, max)}
        disabled={atEnd}
      >
        {Icon.forward}
      </button>
      <button
        className="replay-btn"
        title="කෙළවරට"
        onClick={() => setCursor(max)}
        disabled={atEnd}
      >
        {Icon.toEnd}
      </button>

      <span className="replay-sep" />

      <input
        className="replay-scrub"
        type="range"
        min={0}
        max={Math.max(max, 0)}
        value={Math.min(cursor, max)}
        onChange={(e) => setCursor(Number(e.target.value))}
      />

      <span className="replay-when">{when}</span>
      <span className="replay-count">
        {Math.min(cursor, max) + 1} / {max + 1}
      </span>

      <select
        className="replay-speed"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value) as ReplaySpeed)}
        title="වේගය"
      >
        {REPLAY_SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>

      <button className="replay-btn" title="Replay එකෙන් අයින් වෙන්න (Esc)" onClick={stop}>
        {Icon.close}
      </button>
    </div>
  );
}
