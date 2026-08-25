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

/** Band එකේ එක bar එකක් — උඩ රේඛාවයි යට රේඛාවයි, ඒ අතර පාටයි. */
export interface BandPoint {
  time: Time;
  upper: number;
  lower: number;
  color: string;
}

/**
 * lightweight-charts එකේ Pine `fill(plot1, plot2)` වගේ දෙයක් නෑ. ඒ නිසා
 * මේ series primitive එකෙන් රේඛා දෙකක් අතර හිස්තැන පාට කරනවා
 * (EMA ribbon එකට වගේ). පාට bar එකෙන් bar එකට වෙනස් වෙන්න පුළුවන් නිසා,
 * එකම පාට තියෙන කොටස් වෙන වෙනම polygon විදිහට අඳිනවා.
 */
class BandFillRenderer implements IPrimitivePaneRenderer {
  private readonly points: BandPoint[];
  private readonly chart: IChartApiBase<Time> | null;
  private readonly series: ISeriesApi<SeriesType, Time> | null;

  constructor(
    points: BandPoint[],
    chart: IChartApiBase<Time> | null,
    series: ISeriesApi<SeriesType, Time> | null,
  ) {
    this.points = points;
    this.chart = chart;
    this.series = series;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series || this.points.length < 2) return;

    const timeScale = chart.timeScale();
    // Time/price ටික screen coordinates වලට හරවනවා (පේන කොටස විතරක්).
    const projected = this.points.map((p) => {
      const x = timeScale.timeToCoordinate(p.time);
      const yUpper = series.priceToCoordinate(p.upper);
      const yLower = series.priceToCoordinate(p.lower);
      return x === null || yUpper === null || yLower === null
        ? null
        : { x, yUpper, yLower, color: p.color };
    });

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      let run: { x: number; yUpper: number; yLower: number }[] = [];
      let runColor = '';

      const flush = () => {
        if (run.length < 2 || !runColor) {
          run = [];
          return;
        }
        ctx.beginPath();
        ctx.moveTo(run[0].x, run[0].yUpper);
        for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].x, run[i].yUpper);
        for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i].x, run[i].yLower);
        ctx.closePath();
        ctx.fillStyle = runColor;
        ctx.fill();
        run = [];
      };

      for (const p of projected) {
        if (!p) {
          flush();
          continue;
        }
        if (p.color !== runColor) {
          // පාට මාරු වෙන තැන දෙපැත්තම එකට යා වෙන්න, අන්තිම ලක්ෂ්‍යය දෙපාරක්.
          const last = run[run.length - 1];
          flush();
          runColor = p.color;
          if (last) run.push(last);
        }
        run.push({ x: p.x, yUpper: p.yUpper, yLower: p.yLower });
      }
      flush();
    });
  }
}

class BandFillPaneView implements IPrimitivePaneView {
  private readonly source: BandFillPrimitive;

  constructor(source: BandFillPrimitive) {
    this.source = source;
  }

  /** Candles යටින් අඳිනවා — TradingView එකේ ribbon එකත් එහෙමයි. */
  zOrder(): 'bottom' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return new BandFillRenderer(this.source.points, this.source.chart, this.source.series);
  }
}

export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApiBase<Time> | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  points: BandPoint[];
  private readonly views: IPrimitivePaneView[];

  constructor(points: BandPoint[]) {
    this.points = points;
    this.views = [new BandFillPaneView(this)];
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
