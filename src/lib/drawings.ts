import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { formatPrice } from './format';

/**
 * Chart එක උඩ අතින් අඳින tools — TradingView එකේ drawing toolbar එක වගේ.
 *
 * ලක්ෂ්‍ය තියාගන්නේ **logical index** (bar අංකය, දශම එක්ක) සහ price එකෙන් —
 * time එකෙන් නෙවෙයි. හේතුව: time එකෙන් නම් අන්තිම candle එකට එහාට (දකුණට)
 * අඳින්න බෑ, ඒත් logical index එකෙන් chart එකේ ඕනෑම තැනකට පුළුවන්.
 */

export type DrawingKind = 'trend' | 'fib' | 'ray' | 'position' | 'path' | 'brush';

export interface DrawPoint {
  /** Bar index එක (දශම අගයන් වලංගුයි — candles අතරත් තිත් තියන්න පුළුවන්). */
  logical: number;
  price: number;
}

export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DrawPoint[];
  color: string;
  width: number;
  /** position tool එකට විතරයි — long ද short ද. */
  dir?: 1 | -1;
}

/** Tool එකකට ලක්ෂ්‍ය කීයක් ඕනද (brush/path වලට සීමාවක් නෑ). */
export const POINTS_NEEDED: Record<DrawingKind, number> = {
  trend: 2,
  fib: 2,
  ray: 1,
  position: 2,
  path: Infinity,
  brush: Infinity,
};

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const HANDLE_RADIUS = 4;
/** Hit test එකකට ලක්ෂ්‍යයකින් තියෙන්න පුළුවන් උපරිම දුර (px). */
const HIT_TOLERANCE = 7;

// ── Projection ────────────────────────────────────────────────────────

export interface Projector {
  x: (logical: number) => number | null;
  y: (price: number) => number | null;
  toLogical: (x: number) => number | null;
  toPrice: (y: number) => number | null;
}

export function makeProjector(
  chart: IChartApiBase<Time> | null,
  series: ISeriesApi<SeriesType, Time> | null,
): Projector | null {
  if (!chart || !series) return null;
  const ts = chart.timeScale();
  return {
    x: (logical) => ts.logicalToCoordinate(logical as Logical),
    y: (price) => series.priceToCoordinate(price),
    toLogical: (x) => ts.coordinateToLogical(x),
    toPrice: (y) => series.coordinateToPrice(y),
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────

/** ලක්ෂ්‍යයක් සිට රේඛා කැබැල්ලකට තියෙන ලඟම දුර. */
function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Position tool එකේ මට්ටම් — entry, stop, target. */
export function positionLevels(d: Drawing): { entry: number; stop: number; target: number } {
  const entry = d.points[0].price;
  const target = d.points[1]?.price ?? entry;
  // Risk එක reward එකෙන් බාගයක් — default 2:1 R:R එකක්.
  const stop = entry - (target - entry) / 2;
  return { entry, stop, target };
}

/**
 * (x, y) එකේ click එකක් මේ drawing එකට වදිනවද. Handles වලට මුල් තැන —
 * ඒවා අල්ලලා ලක්ෂ්‍යයක් ඇදගෙන යන්න පුළුවන්.
 *
 * @returns වැදුනු handle එකේ index එක, මුළු drawing එකටම වැදුනොත් -1,
 *          නැත්නම් null.
 */
export function hitTest(d: Drawing, p: Projector, x: number, y: number): number | null {
  const pts = d.points.map((pt) => ({ x: p.x(pt.logical), y: p.y(pt.price) }));
  if (pts.some((pt) => pt.x === null || pt.y === null)) return null;
  const xy = pts as { x: number; y: number }[];

  for (let i = 0; i < xy.length; i++) {
    if (Math.hypot(x - xy[i].x, y - xy[i].y) <= HANDLE_RADIUS + HIT_TOLERANCE) return i;
  }

  switch (d.kind) {
    case 'ray':
      // තිරස් රේඛාවක් — දකුණට අනන්තය දක්වා දිගයි.
      return x >= xy[0].x - HIT_TOLERANCE && Math.abs(y - xy[0].y) <= HIT_TOLERANCE ? -1 : null;

    case 'trend':
      return distanceToSegment(x, y, xy[0].x, xy[0].y, xy[1].x, xy[1].y) <= HIT_TOLERANCE ? -1 : null;

    case 'fib': {
      const left = Math.min(xy[0].x, xy[1].x);
      if (x < left - HIT_TOLERANCE) return null;
      for (const level of FIB_LEVELS) {
        const ly = xy[0].y + (xy[1].y - xy[0].y) * level;
        if (Math.abs(y - ly) <= HIT_TOLERANCE) return -1;
      }
      return null;
    }

    case 'position': {
      const { entry, stop, target } = positionLevels(d);
      const yEntry = p.y(entry);
      const yStop = p.y(stop);
      const yTarget = p.y(target);
      if (yEntry === null || yStop === null || yTarget === null) return null;
      const top = Math.min(yStop, yTarget);
      const bottom = Math.max(yStop, yTarget);
      const left = Math.min(xy[0].x, xy[1].x);
      const right = Math.max(xy[0].x, xy[1].x);
      return x >= left && x <= right && y >= top && y <= bottom ? -1 : null;
    }

    case 'path':
    case 'brush': {
      for (let i = 1; i < xy.length; i++) {
        if (distanceToSegment(x, y, xy[i - 1].x, xy[i - 1].y, xy[i].x, xy[i].y) <= HIT_TOLERANCE) {
          return -1;
        }
      }
      return null;
    }
  }
}

// ── Renderer ──────────────────────────────────────────────────────────

interface DrawingsData {
  drawings: Drawing[];
  /** දැන් තෝරාගෙන තියෙන එක — මේකට handles පේනවා. */
  selectedId: string | null;
  /** තාම අඳිමින් ඉන්න එක (click කරලා ඉවර නැති). */
  preview: Drawing | null;
}

function withAlpha(color: string, alpha: number): string {
  const h = color.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class DrawingsRenderer implements IPrimitivePaneRenderer {
  private readonly data: DrawingsData;
  private readonly project: Projector | null;

  constructor(data: DrawingsData, project: Projector | null) {
    this.data = data;
    this.project = project;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const p = this.project;
    if (!p) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';

      for (const d of this.data.drawings) {
        this.drawOne(ctx, p, d, mediaSize.width, d.id === this.data.selectedId);
      }
      if (this.data.preview) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        this.drawOne(ctx, p, this.data.preview, mediaSize.width, false);
        ctx.restore();
      }
    });
  }

  private label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    background: string,
  ): void {
    const padX = 5;
    const height = 16;
    const width = ctx.measureText(text).width + padX * 2;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(x, y - height / 2, width, height, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x + padX, y);
  }

  private drawOne(
    ctx: CanvasRenderingContext2D,
    p: Projector,
    d: Drawing,
    paneWidth: number,
    selected: boolean,
  ): void {
    const pts = d.points.map((pt) => ({ x: p.x(pt.logical), y: p.y(pt.price) }));
    if (pts.some((pt) => pt.x === null || pt.y === null)) return;
    const xy = pts as { x: number; y: number }[];
    if (xy.length === 0) return;

    ctx.save();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = d.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (d.kind) {
      case 'ray': {
        ctx.beginPath();
        ctx.moveTo(xy[0].x, xy[0].y);
        ctx.lineTo(paneWidth, xy[0].y);
        ctx.stroke();
        this.label(ctx, formatPrice(d.points[0].price), xy[0].x + 8, xy[0].y - 11, d.color);
        break;
      }

      case 'trend': {
        if (xy.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(xy[0].x, xy[0].y);
        ctx.lineTo(xy[1].x, xy[1].y);
        ctx.stroke();
        // චලනය කීයද කියලා පොඩි label එකක්.
        const from = d.points[0].price;
        const to = d.points[1].price;
        const pct = from !== 0 ? ((to - from) / from) * 100 : 0;
        this.label(
          ctx,
          `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
          xy[1].x + 8,
          xy[1].y,
          withAlpha(d.color, 0.85),
        );
        break;
      }

      case 'fib': {
        if (xy.length < 2) break;
        const left = Math.min(xy[0].x, xy[1].x);
        const right = Math.max(xy[0].x, xy[1].x);
        const p0 = d.points[0].price;
        const p1 = d.points[1].price;

        for (let i = 0; i < FIB_LEVELS.length; i++) {
          const level = FIB_LEVELS[i];
          const price = p0 + (p1 - p0) * level;
          const y = p.y(price);
          if (y === null) continue;

          // මට්ටම් අතර පොඩි සෙවණැල්ලක් — කලාප වෙන් වෙලා පේන්න.
          if (i > 0) {
            const prevY = p.y(p0 + (p1 - p0) * FIB_LEVELS[i - 1]);
            if (prevY !== null) {
              ctx.fillStyle = withAlpha(d.color, i % 2 === 0 ? 0.05 : 0.1);
              ctx.fillRect(left, Math.min(prevY, y), right - left, Math.abs(y - prevY));
            }
          }

          ctx.strokeStyle = level === 0 || level === 1 ? d.color : withAlpha(d.color, 0.55);
          ctx.lineWidth = level === 0 || level === 1 ? d.width : 1;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();

          ctx.fillStyle = withAlpha(d.color, 0.9);
          ctx.fillText(`${(level * 100).toFixed(1)}%  ${formatPrice(price)}`, right + 6, y);
        }
        break;
      }

      case 'position': {
        if (xy.length < 2) break;
        const { entry, stop, target } = positionLevels(d);
        const yEntry = p.y(entry);
        const yStop = p.y(stop);
        const yTarget = p.y(target);
        if (yEntry === null || yStop === null || yTarget === null) break;

        const left = Math.min(xy[0].x, xy[1].x);
        const right = Math.max(xy[0].x, xy[1].x);
        const width = Math.max(right - left, 1);

        // ලාභ කලාපය කොළ, අවදානම් කලාපය රතු.
        ctx.fillStyle = 'rgba(38, 166, 154, 0.18)';
        ctx.fillRect(left, Math.min(yEntry, yTarget), width, Math.abs(yTarget - yEntry));
        ctx.fillStyle = 'rgba(239, 83, 80, 0.18)';
        ctx.fillRect(left, Math.min(yEntry, yStop), width, Math.abs(yStop - yEntry));

        const line = (y: number, color: string, text: string) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
          this.label(ctx, text, right + 6, y, color);
        };

        const risk = Math.abs(entry - stop);
        const reward = Math.abs(target - entry);
        line(yTarget, '#26a69a', `TP ${formatPrice(target)}`);
        line(yEntry, '#d1d4dc', `Entry ${formatPrice(entry)}`);
        line(yStop, '#ef5350', `SL ${formatPrice(stop)}`);

        const rr = risk > 0 ? reward / risk : 0;
        const riskPct = entry !== 0 ? (risk / entry) * 100 : 0;
        this.label(
          ctx,
          `${target >= entry ? 'LONG' : 'SHORT'}  R:R 1:${rr.toFixed(2)}  risk ${riskPct.toFixed(2)}%`,
          left,
          Math.min(yStop, yTarget) - 12,
          target >= entry ? '#26a69a' : '#ef5350',
        );
        break;
      }

      case 'path':
      case 'brush': {
        ctx.beginPath();
        ctx.moveTo(xy[0].x, xy[0].y);
        for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i].x, xy[i].y);
        ctx.stroke();
        break;
      }
    }

    // තෝරාගත්ත එකට ලක්ෂ්‍ය වල handles — ඒවා අල්ලලා ඇදගෙන යන්න පුළුවන්.
    // (brush එකේ ලක්ෂ්‍ය සිය ගාණක් තියෙන නිසා ඒකට handles නෑ.)
    if (selected && d.kind !== 'brush') {
      ctx.fillStyle = '#131722';
      ctx.strokeStyle = '#2962ff';
      ctx.lineWidth = 2;
      for (const pt of xy) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  private readonly source: DrawingsPrimitive;
  constructor(source: DrawingsPrimitive) {
    this.source = source;
  }
  /** ඇඳපු දේවල් candles ට උඩින්. */
  zOrder(): 'top' {
    return 'top';
  }
  renderer(): IPrimitivePaneRenderer {
    return new DrawingsRenderer(this.source.data, makeProjector(this.source.chart, this.source.series));
  }
}

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApiBase<Time> | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  data: DrawingsData = { drawings: [], selectedId: null, preview: null };
  private readonly views: IPrimitivePaneView[] = [new DrawingsPaneView(this)];
  private requestUpdate: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }
  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  /** Data වෙනස් වුණාම chart එකට ආපහු අඳින්න කියනවා. */
  set(data: Partial<DrawingsData>): void {
    this.data = { ...this.data, ...data };
    this.requestUpdate?.();
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
  updateAllViews(): void {
    // Renderer එක හැම draw එකකදීම coordinates අලුතෙන් ගන්නවා.
  }
}
