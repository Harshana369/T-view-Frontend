import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import { fetchCandles, subscribeCandles } from '../lib/binance';
import { BandFillPrimitive } from '../lib/bandFill';
import { ShapesPrimitive } from '../lib/shapes';
import {
  DrawingsPrimitive,
  hitTest,
  makeProjector,
  POINTS_NEEDED,
  type Drawing,
  type DrawPoint,
} from '../lib/drawings';
import { chartKey, useDrawingStore } from '../drawingStore';
import { DrawingToolbar } from './DrawingToolbar';
import {
  indicatorById,
  type IndicatorBarColor,
  type IndicatorPanel,
} from '../lib/indicatorRegistry';
import { timeframeOf } from '../lib/timeframes';
import type { Candle, Interval } from '../lib/types';
import { useStore } from '../store';

const UP = '#26a69a';
const DOWN = '#ef5350';
const UP_VOL = 'rgba(38, 166, 154, 0.4)';
const DOWN_VOL = 'rgba(239, 83, 80, 0.4)';

/** Chart එකක drawings නැති වෙලාවට — හැම render එකකම අලුත් array එකක්
 *  හදුනොත් effect එක නිකරුණේ ආපහු දුවනවා. */
const EMPTY_DRAWINGS: Drawing[] = [];

interface ChartProps {
  symbol: string;
  interval: Interval;
  /** අන්තිම price එක header එකට යවන්න. */
  onPrice?: (price: number) => void;
  /** Data load වෙනවා / ඉවරයි කියලා දැනුම් දෙන්න. */
  onLoading?: (loading: boolean) => void;
  onError?: (message: string | null) => void;
}

/** Candle එකකින් volume histogram bar එකක් හදනවා (කොළ/රතු පාටත් එක්ක). */
function volumeBar(c: Candle) {
  return {
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? UP_VOL : DOWN_VOL,
  };
}

export function Chart({ symbol, interval, onPrice, onLoading, onError }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Chart එකේ දැන් තියෙන candles ටික — indicators ගණන් හදන්නත් මේවමයි.
  const candlesRef = useRef<Candle[]>([]);
  // Candles වෙනස් වුණාම bump වෙනවා => indicator effect එක ආපහු දුවනවා.
  const [barsVersion, setBarsVersion] = useState(0);
  // Chart එක අලුතෙන් හැදුනාම bump වෙනවා => අනිත් effects ආපහු attach වෙනවා.
  const [chartEpoch, setChartEpoch] = useState(0);

  // උසස් timeframe candles (Sniper එකේ 5m RSI එකට වගේ) + ඒවා අලුත් වුණාම bump.
  const mtfRef = useRef<Record<string, Candle[]>>({});
  const [mtfVersion, setMtfVersion] = useState(0);

  // Indicators දෙන dashboard tables ටික (chart එක උඩම render වෙනවා).
  const [panels, setPanels] = useState<IndicatorPanel[]>([]);

  const indicators = useStore((s) => s.indicators);

  // Parent callbacks ref එකක තියාගන්නවා — parent re-render වුණාම
  // chart එක ආපහු හදන එක වළක්වන්න.
  const cbRef = useRef({ onPrice, onLoading, onError });
  cbRef.current = { onPrice, onLoading, onError };

  // ---------------------------------------------------------- chart එක හදනවා
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        panes: { separatorColor: '#2a2e39', separatorHoverColor: '#363a45' },
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#2a2e39' },
      rightPriceScale: { borderColor: '#2a2e39' },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      // Border එක පේන්න තියෙනවා — indicator එකක් bar එකේ body එක වෙනස්
      // පාටකට හැරෙව්වත් (කළු/තැඹිලි signal candles), outline එකෙන් bar එක
      // bullish ද bearish ද කියලා පේනවා.
      borderVisible: true,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candleSeriesRef.current = candleSeries;

    // Volume එක price pane එකේම යටින් — වෙනම (overlay) price scale එකකින්.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeriesRef.current = volumeSeries;

    setChartEpoch((v) => v + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // ------------------------------------------- symbol/timeframe වෙනස් වුණාම data
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    const tf = timeframeOf(interval);
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    cbRef.current.onLoading?.(true);
    cbRef.current.onError?.(null);

    void (async () => {
      try {
        const { candles, priceDecimals } = await fetchCandles(symbol, tf);
        if (cancelled) return;
        candlesRef.current = candles;
        // Coin එකෙන් coin එකට decimals වෙනස් (BTC 2ක්, 1000SATS 8ක්) —
        // price scale එකට ඒ market එකේ හරි precision එක දෙනවා.
        candleSeries.applyOptions({
          priceFormat: { type: 'price', precision: priceDecimals, minMove: 10 ** -priceDecimals },
        });
        candleSeries.setData(candles);
        volumeSeries.setData(candles.map(volumeBar));
        chartRef.current?.timeScale().fitContent();
        setBarsVersion((v) => v + 1);
        cbRef.current.onLoading?.(false);
        if (candles.length > 0) cbRef.current.onPrice?.(candles[candles.length - 1].close);

        // Load වුණාට පස්සේ අන්තිම candles ටික නැවත නැවත poll කරලා update කරනවා.
        unsubscribe = subscribeCandles(
          symbol,
          tf,
          (recent) => {
            if (cancelled) return;
            const bars = candlesRef.current;
            let changed = false;
            for (const c of recent) {
              const last = bars[bars.length - 1];
              if (!last || c.time > last.time) {
                bars.push(c); // අලුත් candle එකක්
              } else if (c.time === last.time) {
                bars[bars.length - 1] = c; // දැන් හැදෙන candle එක update කරනවා
              } else {
                continue; // පරණ candle එකක් — නොසලකා හරිනවා
              }
              changed = true;
              candleSeries.update(c);
              volumeSeries.update(volumeBar(c));
            }
            if (changed) {
              cbRef.current.onPrice?.(bars[bars.length - 1].close);
              setBarsVersion((v) => v + 1);
            }
          },
          (message) => cbRef.current.onError?.(message),
        );
      } catch (err) {
        if (cancelled) return;
        cbRef.current.onLoading?.(false);
        cbRef.current.onError?.(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [symbol, interval, chartEpoch]);

  // ------------------------------ indicators ට ඕන උසස් timeframe candles
  // සමහර indicators (Sniper එකේ 5m RSI වගේ) chart timeframe එකට අමතරව
  // තව timeframe එකක data ඉල්ලනවා. ඒවා මෙතන ගෙනල්ලා ref එකේ තියාගන්නවා.
  const mtfKey = useMemo(() => {
    const wanted = new Set<string>();
    for (const instance of indicators) {
      const def = indicatorById(instance.defId);
      // `mtf` එකක් හෝ කිහිපයක් වෙන්න පුළුවන් (Elliott Wave එකට HTF දෙකක්).
      if (def?.mtf) for (const code of [def.mtf].flat()) wanted.add(code);
    }
    return [...wanted].sort().join(',');
  }, [indicators]);

  useEffect(() => {
    if (!mtfKey) {
      mtfRef.current = {};
      return;
    }
    let cancelled = false;
    const unsubscribes: (() => void)[] = [];

    for (const code of mtfKey.split(',') as Interval[]) {
      const tf = timeframeOf(code);
      void (async () => {
        try {
          // Chart එකේ bars 900ට ඔරොත්තු දෙන්න තරම් history එකක් ඕන.
          const { candles } = await fetchCandles(symbol, tf, 3000);
          if (cancelled) return;
          mtfRef.current = { ...mtfRef.current, [code]: candles };
          setMtfVersion((v) => v + 1);

          const stop = subscribeCandles(symbol, tf, (recent) => {
            if (cancelled) return;
            const bars = mtfRef.current[code];
            if (!bars) return;
            for (const c of recent) {
              const last = bars[bars.length - 1];
              if (!last || c.time > last.time) bars.push(c);
              else if (c.time === last.time) bars[bars.length - 1] = c;
            }
            setMtfVersion((v) => v + 1);
          });
          if (cancelled) stop();
          else unsubscribes.push(stop);
        } catch {
          // උසස් timeframe data නැතත් අනිත් ඔක්කොම වැඩ කරන්න ඕන.
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const stop of unsubscribes) stop();
    };
  }, [symbol, mtfKey]);

  // ------------------------------------------- indicators අඳිනවා / අයින් කරනවා
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const candles = candlesRef.current;
    if (!chart || !candleSeries || candles.length === 0) return;

    const created: ISeriesApi<SeriesType>[] = [];
    const createdPanes: number[] = [];
    const priceLines: { series: ISeriesApi<SeriesType>; line: IPriceLine }[] = [];
    const markerPlugins: ISeriesMarkersPluginApi<Time>[] = [];
    const bandPrimitives: BandFillPrimitive[] = [];
    const shapePrimitives: ShapesPrimitive[] = [];
    const nextPanels: IndicatorPanel[] = [];
    // Candles වලට පාට දාන indicator එකක් තියෙනවා නම් (Pine `barcolor()` වගේ).
    let barColors: (IndicatorBarColor | undefined)[] | null = null;

    for (const instance of indicators) {
      const def = indicatorById(instance.defId);
      if (!def) continue;
      const out = def.compute(candles, instance.params, { mtf: mtfRef.current });

      // Series එකකට හරි 'separate' ඕන නම් විතරයි අලුත් pane එකක් හදන්නේ.
      const needsPane = out.series.some((s) => (s.pane ?? def.pane) === 'separate');
      let paneIndex = 0;
      if (needsPane) {
        const pane = chart.addPane();
        pane.setHeight(120);
        paneIndex = pane.paneIndex();
        createdPanes.push(paneIndex);
      }

      let firstInPane = true;
      for (const s of out.series) {
        const target = (s.pane ?? def.pane) === 'separate' ? paneIndex : 0;
        const series: ISeriesApi<SeriesType> =
          s.type === 'histogram'
            ? chart.addSeries(
                HistogramSeries,
                { color: s.color, priceLineVisible: false, lastValueVisible: false },
                target,
              )
            : chart.addSeries(
                LineSeries,
                {
                  color: s.color,
                  // Glow effect එකට 10 වගේ ලොකු අගයක් යනවා — typings එකේ
                  // 1–4 විතරයි කිව්වත් renderer එක ඕනම ඝනකමක් අඳිනවා.
                  lineWidth: (s.lineWidth ?? 2) as LineWidth,
                  priceLineVisible: false,
                  lastValueVisible: s.lastValueVisible ?? true,
                  title: target === 0 ? s.label : '',
                },
                target,
              );
        series.setData(s.data);
        created.push(series);

        // RSI 30/70 වගේ reference lines — pane එකේ පළමු series එකට විතරක්.
        if (needsPane && firstInPane && target === paneIndex && def.levels) {
          for (const level of def.levels) {
            priceLines.push({
              series,
              line: series.createPriceLine({
                price: level,
                color: '#565a69',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: '',
              }),
            });
          }
          firstInPane = false;
        }
      }

      // Long / Short labels (Pine `plotshape`) — candles series එකට.
      if (out.markers && out.markers.length > 0) {
        // Bar එකට උඩින්/යටින් ද, නැත්නම් හරියටම price එකකද කියලා වෙන් කරනවා.
        const markers: SeriesMarker<Time>[] = out.markers.map((m) =>
          m.position === 'aboveBar' || m.position === 'belowBar'
            ? {
                time: m.time,
                position: m.position,
                shape: m.shape,
                color: m.color,
                text: m.text,
              }
            : {
                time: m.time,
                position: m.position,
                price: m.price ?? 0,
                shape: m.shape,
                color: m.color,
                text: m.text,
              },
        );
        markerPlugins.push(createSeriesMarkers(candleSeries, markers));
      }
      // Range boxes, SL/TP රේඛා + labels (Pine `box`/`line`/`label`).
      if ((out.boxes && out.boxes.length > 0) || (out.segments && out.segments.length > 0)) {
        const shapes = new ShapesPrimitive(out.boxes ?? [], out.segments ?? []);
        candleSeries.attachPrimitive(shapes);
        shapePrimitives.push(shapes);
      }

      // EMA ribbon වගේ රේඛා දෙකක් අතර පාට කරන කලාප.
      for (const band of out.bands ?? []) {
        const primitive = new BandFillPrimitive(band.points);
        candleSeries.attachPrimitive(primitive);
        bandPrimitives.push(primitive);
      }

      if (out.panel) nextPanels.push(out.panel);
      if (out.barColors) barColors = out.barColors;
    }

    setPanels(nextPanels);

    if (barColors) {
      const colors = barColors;
      candleSeries.setData(
        candles.map((c, i) => {
          const paint = colors[i];
          if (!paint) return c;
          const up = c.close >= c.open;
          return {
            ...c,
            color: paint.body,
            wickColor: paint.wick ?? paint.body,
            // border දුන්නේ නැත්නම් bar එකේ හැබෑ කොළ/රතු පාට තියාගන්නවා.
            borderColor: paint.border ?? (up ? UP : DOWN),
          };
        }),
      );
    }

    return () => {
      // Cleanup: price lines, markers, series, ඊට පස්සේ panes (ලොකු index
      // එකේ ඉඳන් අයින් කරනවා — නැත්නම් index අනුපිළිවෙල මාරු වෙනවා).
      for (const p of priceLines) p.series.removePriceLine(p.line);
      for (const plugin of markerPlugins) plugin.detach();
      for (const primitive of bandPrimitives) candleSeries.detachPrimitive(primitive);
      for (const primitive of shapePrimitives) candleSeries.detachPrimitive(primitive);
      for (const series of created) chart.removeSeries(series);
      for (const index of [...createdPanes].sort((a, b) => b - a)) chart.removePane(index);
      // Candles වල පාට ආපහු සාමාන්‍ය කොළ/රතු වලට.
      if (barColors) candleSeries.setData(candlesRef.current);
    };
  }, [indicators, barsVersion, chartEpoch, mtfVersion]);

  // ------------------------------------------------------ අතින් අඳින tools
  const key = chartKey(symbol, interval);
  const drawings = useDrawingStore((s) => s.byChart[key]) ?? EMPTY_DRAWINGS;
  const activeTool = useDrawingStore((s) => s.activeTool);
  const selectedId = useDrawingStore((s) => s.selectedId);
  const drawColor = useDrawingStore((s) => s.color);
  const drawWidth = useDrawingStore((s) => s.width);

  const drawPrimitiveRef = useRef<DrawingsPrimitive | null>(null);
  // Pointer handlers ඇතුළේ stale closure එකක් නොවෙන්න state එක ref එකක.
  const drawStateRef = useRef({ drawings, activeTool, selectedId, drawColor, drawWidth, key });
  drawStateRef.current = { drawings, activeTool, selectedId, drawColor, drawWidth, key };

  // Primitive එක attach කරනවා (chart එක අලුතෙන් හැදුනොත් ආපහු).
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;
    const primitive = new DrawingsPrimitive();
    candleSeries.attachPrimitive(primitive);
    drawPrimitiveRef.current = primitive;
    return () => {
      candleSeries.detachPrimitive(primitive);
      drawPrimitiveRef.current = null;
    };
  }, [chartEpoch]);

  // Store එකේ වෙනසක් වුණාම primitive එකට දෙනවා.
  useEffect(() => {
    drawPrimitiveRef.current?.set({ drawings, selectedId });
  }, [drawings, selectedId, chartEpoch]);

  // Tool එකක් තෝරලා තියෙනකොට chart එක pan/zoom වෙන එක නවත්තනවා —
  // නැත්නම් අඳින්න click කරනකොට chart එක ඇදෙනවා.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const interactive = activeTool === null;
    chart.applyOptions({ handleScroll: interactive, handleScale: interactive });
  }, [activeTool, chartEpoch]);

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!container || !chart || !candleSeries) return;

    const store = useDrawingStore.getState;
    /** තාම ඇඳ ඇඳ ඉන්න එක. */
    let draft: Drawing | null = null;
    /** ඇදගෙන යන එක. */
    let drag: {
      id: string;
      /** -1 = මුළු drawing එකම, නැත්නම් handle index එක. */
      handle: number;
      startPoints: DrawPoint[];
      from: DrawPoint;
    } | null = null;

    const localPoint = (e: PointerEvent | MouseEvent): DrawPoint | null => {
      const p = makeProjector(chart, candleSeries);
      if (!p) return null;
      const rect = container.getBoundingClientRect();
      const logical = p.toLogical(e.clientX - rect.left);
      const price = p.toPrice(e.clientY - rect.top);
      return logical === null || price === null ? null : { logical, price };
    };

    const showPreview = () => drawPrimitiveRef.current?.set({ preview: draft });

    const commit = () => {
      // Ray එකට ලක්ෂ්‍යයක්, trend/fib/position වලට දෙකක්.
      if (!draft || draft.points.length < POINTS_NEEDED[draft.kind]) {
        draft = null;
        showPreview();
        return;
      }
      store().add(drawStateRef.current.key, draft);
      draft = null;
      showPreview();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const { activeTool: tool, drawColor: color, drawWidth: width } = drawStateRef.current;
      const pt = localPoint(e);
      if (!pt) return;

      if (tool === null) {
        // Select mode — උඩින්ම තියෙන එකේ ඉඳන් පහළට hit test.
        const p = makeProjector(chart, candleSeries);
        if (!p) return;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const list = drawStateRef.current.drawings;
        for (let i = list.length - 1; i >= 0; i--) {
          const hit = hitTest(list[i], p, x, y);
          if (hit !== null) {
            store().setSelected(list[i].id);
            drag = { id: list[i].id, handle: hit, startPoints: list[i].points, from: pt };
            // ඇදගෙන යනකොට chart එක pan වෙන්න දෙන්නේ නෑ. මේ handler එක
            // capture phase එකේ දුවන නිසා, chart එකේ එකට කලින් නවත්තනවා —
            // නැත්නම් drawing එකයි chart එකයි දෙකම එකවර ඇදෙනවා.
            e.stopPropagation();
            e.preventDefault();
            chart.applyOptions({ handleScroll: false, handleScale: false });
            container.setPointerCapture(e.pointerId);
            return;
          }
        }
        store().setSelected(null);
        return;
      }

      if (!draft) {
        draft = {
          id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          kind: tool,
          points: [pt],
          color,
          width,
        };
        if (tool === 'brush') container.setPointerCapture(e.pointerId);
        // Ray එකට ලක්ෂ්‍යයක් ඇති — වහාම ඉවරයි.
        if (POINTS_NEEDED[tool] === 1) commit();
        else showPreview();
        return;
      }

      // දෙවෙනි (හෝ ඊළඟ) ලක්ෂ්‍යය.
      draft.points.push(pt);
      if (draft.points.length >= POINTS_NEEDED[draft.kind]) commit();
      else showPreview();
    };

    const onPointerMove = (e: PointerEvent) => {
      const pt = localPoint(e);
      if (!pt) return;

      if (drag) {
        const { id, handle, startPoints, from } = drag;
        const dLogical = pt.logical - from.logical;
        const dPrice = pt.price - from.price;
        const points =
          handle >= 0
            ? startPoints.map((p, i) => (i === handle ? pt : p))
            : startPoints.map((p) => ({ logical: p.logical + dLogical, price: p.price + dPrice }));
        store().update(drawStateRef.current.key, id, points);
        return;
      }

      if (!draft) return;

      if (draft.kind === 'brush') {
        // ඉතාම ළඟ ලක්ෂ්‍ය එකතු කරන්නේ නෑ — නැත්නම් සිය ගාණක් එකතු වෙනවා.
        const lastPt = draft.points[draft.points.length - 1];
        if (Math.abs(pt.logical - lastPt.logical) > 0.3) draft.points.push(pt);
        showPreview();
        return;
      }

      // දෙවෙනි ලක්ෂ්‍යය cursor එක්කම චලනය වෙනවා (rubber band).
      const preview: Drawing = { ...draft, points: [...draft.points, pt] };
      drawPrimitiveRef.current?.set({ preview });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (drag) {
        drag = null;
        const interactive = drawStateRef.current.activeTool === null;
        chart.applyOptions({ handleScroll: interactive, handleScale: interactive });
        try {
          container.releasePointerCapture(e.pointerId);
        } catch {
          // Capture එකක් තිබුණේ නැත්නම් කමක් නෑ.
        }
        return;
      }
      if (draft?.kind === 'brush') {
        try {
          container.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        if (draft.points.length >= 2) {
          store().add(drawStateRef.current.key, draft);
        }
        draft = null;
        showPreview();
      }
    };

    // Path එක ඉවර කරන්නේ double-click එකෙන්.
    const onDoubleClick = () => {
      if (draft && draft.kind === 'path' && draft.points.length >= 2) {
        store().add(drawStateRef.current.key, draft);
        draft = null;
        showPreview();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Input එකක type කරනකොට මේවා වැඩ කරන්න හොඳ නෑ.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'Escape') {
        if (draft) {
          draft = null;
          showPreview();
        }
        store().setTool(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = drawStateRef.current.selectedId;
        if (id) {
          e.preventDefault();
          store().remove(drawStateRef.current.key, id);
        }
      }
    };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [chartEpoch]);

  return (
    <div className={`chart-host${activeTool ? ' drawing' : ''}`}>
      <div ref={containerRef} className="chart" />
      <DrawingToolbar chartKey={key} count={drawings.length} />
      {panels.map((panel, i) => (
        <div
          key={i}
          className={`chart-panel pos-${panel.position.toLowerCase().replace(' ', '-')}`}
          style={{ background: panel.background }}
        >
          {panel.rows.map((row) => (
            <div className="chart-panel-row" key={row.label}>
              <span style={{ color: row.labelColor, background: row.labelBackground }}>
                {row.label}
              </span>
              <span style={{ color: row.valueColor, background: row.valueBackground }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
