import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesType,
} from 'lightweight-charts';
import { fetchCandles, subscribeCandles } from '../lib/coinbase';
import { indicatorById } from '../lib/indicatorRegistry';
import { timeframeOf } from '../lib/timeframes';
import type { Candle, Interval } from '../lib/types';
import { useStore } from '../store';

const UP = '#26a69a';
const DOWN = '#ef5350';
const UP_VOL = 'rgba(38, 166, 154, 0.4)';
const DOWN_VOL = 'rgba(239, 83, 80, 0.4)';

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
      borderVisible: false,
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
        const candles = await fetchCandles(symbol, tf);
        if (cancelled) return;
        candlesRef.current = candles;
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

  // ------------------------------------------- indicators අඳිනවා / අයින් කරනවා
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || candles.length === 0) return;

    const created: ISeriesApi<SeriesType>[] = [];
    const createdPanes: number[] = [];
    const priceLines: { series: ISeriesApi<SeriesType>; line: IPriceLine }[] = [];

    for (const instance of indicators) {
      const def = indicatorById(instance.defId);
      if (!def) continue;
      // 'separate' නම් යටින් අලුත් pane එකක්, නැත්නම් price pane එකේම (0).
      let paneIndex = 0;
      if (def.pane === 'separate') {
        const pane = chart.addPane();
        pane.setHeight(120);
        paneIndex = pane.paneIndex();
        createdPanes.push(paneIndex);
      }

      let first = true;
      for (const s of def.compute(candles, instance.params)) {
        const series: ISeriesApi<SeriesType> =
          s.type === 'histogram'
            ? chart.addSeries(
                HistogramSeries,
                { color: s.color, priceLineVisible: false, lastValueVisible: false },
                paneIndex,
              )
            : chart.addSeries(
                LineSeries,
                {
                  color: s.color,
                  lineWidth: 2,
                  priceLineVisible: false,
                  title: def.pane === 'separate' ? '' : s.label,
                },
                paneIndex,
              );
        series.setData(s.data);
        created.push(series);

        // RSI 30/70 වගේ reference lines — pane එකේ පළමු series එකට විතරක්.
        if (first && def.levels) {
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
        }
        first = false;
      }
    }

    return () => {
      // Cleanup: price lines, series, ඊට පස්සේ panes (ලොකු index එකේ ඉඳන්
      // අයින් කරනවා — නැත්නම් index අනුපිළිවෙල මාරු වෙනවා).
      for (const p of priceLines) p.series.removePriceLine(p.line);
      for (const series of created) chart.removeSeries(series);
      for (const index of [...createdPanes].sort((a, b) => b - a)) chart.removePane(index);
    };
  }, [indicators, barsVersion, chartEpoch]);

  return <div ref={containerRef} className="chart" />;
}
