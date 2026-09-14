import { useEffect, useRef, useState } from 'react';
import { DRAW_COLORS, useDrawingStore } from '../drawingStore';
import type { DrawingKind } from '../lib/drawings';

/**
 * Chart එක උඩ පාවෙන drawing toolbar එක — TradingView එකේ එක වගේ.
 * ⠿ එකෙන් අල්ලලා ඕනෑම තැනකට ඇදගෙන යන්න පුළුවන්.
 */

interface ToolDef {
  kind: DrawingKind;
  title: string;
  icon: React.ReactNode;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TOOLS: ToolDef[] = [
  {
    kind: 'trend',
    title: 'Trend line — ලක්ෂ්‍ය දෙකක් අතර ඇල රේඛාවක්',
    icon: (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <line x1="4.5" y1="15.5" x2="15" y2="5" {...stroke} />
        <circle cx="15.5" cy="4.5" r="2" {...stroke} />
        <rect x="2.5" y="13.5" width="4" height="4" {...stroke} />
      </svg>
    ),
  },
  {
    kind: 'fib',
    title: 'Fib retracement — 0 / 23.6 / 38.2 / 50 / 61.8 / 78.6 / 100',
    icon: (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <line x1="3" y1="4" x2="17" y2="4" {...stroke} />
        <line x1="3" y1="8" x2="17" y2="8" {...stroke} />
        <line x1="3" y1="12" x2="17" y2="12" {...stroke} />
        <line x1="3" y1="16" x2="17" y2="16" {...stroke} />
        <circle cx="4" cy="4" r="1.6" {...stroke} />
        <circle cx="16" cy="16" r="1.6" {...stroke} />
      </svg>
    ),
  },
  {
    kind: 'ray',
    title: 'Horizontal ray — මට්ටමක් දකුණට දිගටම',
    icon: (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <line x1="6" y1="10" x2="17" y2="10" {...stroke} />
        <circle cx="4" cy="10" r="2" {...stroke} />
      </svg>
    ),
  },
  {
    kind: 'position',
    title: 'Long / Short position — Entry, SL, TP සහ R:R',
    icon: (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <line x1="4" y1="5" x2="16" y2="5" {...stroke} />
        <line x1="4" y1="10" x2="16" y2="10" {...stroke} />
        <line x1="4" y1="15" x2="16" y2="15" {...stroke} />
        <circle cx="4" cy="15" r="1.6" {...stroke} />
        <line x1="10" y1="5" x2="10" y2="15" {...stroke} />
      </svg>
    ),
  },
  {
    kind: 'path',
    title: 'Zigzag path — click කරකර ලක්ෂ්‍ය, ඉවර කරන්න double-click',
    icon: (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <polyline points="3,14 7,9 11,13 16,5" {...stroke} />
        <polyline points="12.5,4.5 16.5,4.5 16.5,8.5" {...stroke} />
      </svg>
    ),
  },
  {
    kind: 'brush',
    title: 'Brush — අතින්ම නිදහසේ අඳින්න',
    icon: (
      <svg viewBox="0 0 20 20" width="18" height="18">
        <path d="M4 16c0-6 4-9 8-9" {...stroke} />
        <path d="M4 16c5 0 8-3 8-7" {...stroke} />
        <polyline points="13,4 16,7 13,10" {...stroke} />
      </svg>
    ),
  },
];

interface Props {
  /** දැන් බලාගෙන ඉන්න chart එකේ key එක — delete/clear වලට. */
  chartKey: string;
  /** මේ chart එකේ ඇඳපු දේවල් ගාණ. */
  count: number;
}

export function DrawingToolbar({ chartKey, count }: Props) {
  const activeTool = useDrawingStore((s) => s.activeTool);
  const setTool = useDrawingStore((s) => s.setTool);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const color = useDrawingStore((s) => s.color);
  const setColor = useDrawingStore((s) => s.setColor);
  const pos = useDrawingStore((s) => s.toolbarPos);
  const setPos = useDrawingStore((s) => s.setToolbarPos);
  const remove = useDrawingStore((s) => s.remove);
  const clear = useDrawingStore((s) => s.clear);

  const [palette, setPalette] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // ⠿ එකෙන් අල්ලලා toolbar එක ඇදගෙන යනවා.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setPos({ x: Math.max(0, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) });
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setPos]);

  return (
    <div className="draw-bar" style={{ left: pos.x, top: pos.y }}>
      <button
        className="draw-grip"
        title="Toolbar එක ඇදගෙන යන්න"
        onPointerDown={(e) => {
          const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
        }}
      >
        <svg viewBox="0 0 6 16" width="6" height="16">
          {[3, 8, 13].map((y) =>
            [1.5, 4.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" />),
          )}
        </svg>
      </button>

      {TOOLS.map((tool) => (
        <button
          key={tool.kind}
          className={`draw-tool${activeTool === tool.kind ? ' on' : ''}`}
          title={tool.title}
          // එකම tool එක ආපහු click කළොත් off — select mode එකට.
          onClick={() => setTool(activeTool === tool.kind ? null : tool.kind)}
        >
          {tool.icon}
        </button>
      ))}

      <span className="draw-sep" />

      <button
        className="draw-tool draw-color"
        title="පාට"
        onClick={() => setPalette((v) => !v)}
        style={{ color }}
      >
        <svg viewBox="0 0 20 20" width="18" height="18">
          <circle cx="10" cy="10" r="6" fill="currentColor" />
        </svg>
      </button>

      <button
        className="draw-tool"
        title={selectedId ? 'තෝරාගත් එක මකන්න (Delete)' : `මේ chart එකේ ඇඳපු ${count} ම මකන්න`}
        disabled={count === 0}
        onClick={() => {
          if (selectedId) remove(chartKey, selectedId);
          else if (confirm(`මේ chart එකේ ඇඳපු ${count} ම මකන්නද?`)) clear(chartKey);
        }}
      >
        <svg viewBox="0 0 20 20" width="18" height="18">
          <polyline points="4,6 16,6" {...stroke} />
          <path d="M6 6v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" {...stroke} />
          <path d="M8 6V4h4v2" {...stroke} />
        </svg>
      </button>

      {palette && (
        <div className="draw-palette">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              className={`draw-swatch${c === color ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setPalette(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
