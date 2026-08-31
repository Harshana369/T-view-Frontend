import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';

/** Chart එක උඩ අඳින සෘජුකෝණාස්‍රයක් (Pine `box.new`). */
export interface ChartBox {
  time1: Time;
  time2: Time;
  top: number;
  bottom: number;
  fill?: string;
  border?: string;
}

/** තිරස් රේඛා කැබැල්ලක් + දකුණු කෙළවරේ label එකක් (Pine `line` + `label`). */
export interface ChartSegment {
  time1: Time;
  time2: Time;
  price: number;
  color: string;
  width?: number;
  dashed?: boolean;
  label?: { text: string; background: string; color: string };
}

interface ShapesData {
  boxes: ChartBox[];
  segments: ChartSegment[];
}

/** Time/price එකක් screen coordinate එකකට හරවන helpers. */
interface Projector {
  x: (time: Time) => number | null;
  y: (price: number) => number | null;
}

function projector(
  chart: IChartApiBase<Time> | null,
  series: ISeriesApi<SeriesType, Time> | null,
): Projector | null {
  if (!chart || !series) return null;
  const timeScale = chart.timeScale();
  return {
    x: (time) => timeScale.timeToCoordinate(time),
    y: (price) => series.priceToCoordinate(price),
  };
}

class BoxesRenderer implements IPrimitivePaneRenderer {
  private readonly data: ShapesData;
  private readonly project: Projector | null;

  constructor(data: ShapesData, project: Projector | null) {
    this.data = data;
    this.project = project;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const p = this.project;
    if (!p) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const box of this.data.boxes) {
        const x1 = p.x(box.time1);
        const x2 = p.x(box.time2);
        const yTop = p.y(box.top);
        const yBottom = p.y(box.bottom);
        if (x1 === null || x2 === null || yTop === null || yBottom === null) continue;

        const w = Math.max(1, x2 - x1);
        const h = Math.max(1, yBottom - yTop);
        if (box.fill) {
          ctx.fillStyle = box.fill;
          ctx.fillRect(x1, yTop, w, h);
        }
        if (box.border) {
          ctx.strokeStyle = box.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, yTop, w, h);
        }
      }
    });
  }
}

class SegmentsRenderer implements IPrimitivePaneRenderer {
  private readonly data: ShapesData;
  private readonly project: Projector | null;

  constructor(data: ShapesData, project: Projector | null) {
    this.data = data;
    this.project = project;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const p = this.project;
    if (!p) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';

      for (const seg of this.data.segments) {
        const x1 = p.x(seg.time1);
        const x2 = p.x(seg.time2);
        const y = p.y(seg.price);
        if (x1 === null || x2 === null || y === null) continue;

        ctx.save();
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = seg.width ?? 1;
        if (seg.dashed) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.restore();

        if (!seg.label) continue;
        // Label එක රේඛාවේ දකුණු කෙළවරට, වම් පැත්තට පොඩි උල්ලකුත් එක්ක
        // (Pine `label.style_label_left`).
        const text = seg.label.text;
        const padX = 6;
        const height = 18;
        const width = ctx.measureText(text).width + padX * 2;
        const left = x2 + 6;
        const top = y - height / 2;

        ctx.fillStyle = seg.label.background;
        ctx.beginPath();
        ctx.moveTo(x2, y);
        ctx.lineTo(left, y - 4);
        ctx.lineTo(left, y + 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(left, top, width, height, 3);
        ctx.fill();

        ctx.fillStyle = seg.label.color;
        ctx.fillText(text, left + padX, y);
      }
    });
  }
}

class ShapesPaneView implements IPrimitivePaneView {
  private readonly source: ShapesPrimitive;
  private readonly layer: 'boxes' | 'segments';

  constructor(source: ShapesPrimitive, layer: 'boxes' | 'segments') {
    this.source = source;
    this.layer = layer;
  }

  /** Boxes candles යටින්, lines/labels ඔක්කොම උඩින්. */
  zOrder(): 'bottom' | 'top' {
    return this.layer === 'boxes' ? 'bottom' : 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    const project = projector(this.source.chart, this.source.series);
    return this.layer === 'boxes'
      ? new BoxesRenderer(this.source.data, project)
      : new SegmentsRenderer(this.source.data, project);
  }
}

/**
 * Pine එකේ `box.new()` / `line.new()` / `label.new()` වලින් අඳින දේවල් වගේ
 * දේවල් lightweight-charts එකේ නෑ. ඒ නිසා ඒ ටික මේ primitive එකෙන් අඳිනවා.
 */
export class ShapesPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApiBase<Time> | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  data: ShapesData;
  private readonly views: IPrimitivePaneView[];

  constructor(boxes: ChartBox[], segments: ChartSegment[]) {
    this.data = { boxes, segments };
    this.views = [new ShapesPaneView(this, 'boxes'), new ShapesPaneView(this, 'segments')];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  updateAllViews(): void {
    // Renderer එක හැම draw එකකදීම coordinates අලුතෙන් ගන්නවා.
  }
}
