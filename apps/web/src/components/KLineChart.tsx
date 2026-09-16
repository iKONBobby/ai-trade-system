'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';
import type { KLine } from '@trade/shared';
import { calcMA } from '@trade/shared';

// 3-effect lifecycle (ENG-D2):
//   ┌─ effect 1 [deps=[]]      → createChart + addSeries × 5, cleanup chart.remove()
//   ├─ effect 2 [deps=[data]]  → setData on each series (no rebuild)
//   └─ effect 3 [deps=[showMA]] → toggle MA series visibility

interface SeriesRefs {
  candle: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
  ma5: ISeriesApi<'Line'>;
  ma10: ISeriesApi<'Line'>;
  ma20: ISeriesApi<'Line'>;
}

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    text: value('--text-3', '#747c75'),
    grid: value('--border-1', '#303832'),
    border: value('--border-2', '#465047'),
    up: value('--up', '#ef5350'),
    down: value('--down', '#27c36a'),
  };
}

function withAlpha(color: string, alpha: number) {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default function KLineChart({
  data,
  showMA = true,
  height = 400,
}: {
  data: KLine[];
  showMA?: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesRefs | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);

  // Effect 1: create chart + series once, cleanup on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const theme = readThemeColors();

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: theme.border },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    // A 股惯例：红涨绿跌（lightweight-charts 默认相反）
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });
    const ma5 = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ma10 = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ma20 = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    seriesRef.current = { candle, volume, ma5, ma10, ma20 };

    const ro = new ResizeObserver(() => {
      if (container) chart.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const theme = readThemeColors();
    chart.applyOptions({
      layout: { background: { color: 'transparent' }, textColor: theme.text },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
    });
    series.candle.applyOptions({
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });
  }, [themeRevision]);

  // Effect 2: data → setData on each series. Does NOT rebuild chart.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (data.length === 0) {
      s.candle.setData([]);
      s.volume.setData([]);
      s.ma5.setData([]);
      s.ma10.setData([]);
      s.ma20.setData([]);
      return;
    }
    s.candle.setData(
      data.map((k) => ({
        time: k.date as Time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      })),
    );
    const theme = readThemeColors();
    s.volume.setData(
      data.map((k) => ({
        time: k.date as Time,
        value: k.volume,
        color: withAlpha(k.close >= k.open ? theme.up : theme.down, 0.4),
      })),
    );
    s.ma5.setData(maToLineData(data, calcMA(data, 5)));
    s.ma10.setData(maToLineData(data, calcMA(data, 10)));
    s.ma20.setData(maToLineData(data, calcMA(data, 20)));
    chartRef.current?.timeScale().fitContent();
  }, [data, themeRevision]);

  // Effect 3: showMA toggle, independent
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    [s.ma5, s.ma10, s.ma20].forEach((line) => line.applyOptions({ visible: showMA }));
  }, [showMA]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

/** UI adapter: pure-math (number|null)[] → lightweight-charts LineData (ENG-D3). */
function maToLineData(klines: KLine[], ma: (number | null)[]): LineData[] {
  const out: LineData[] = [];
  for (let i = 0; i < klines.length; i++) {
    const v = ma[i];
    if (v != null) out.push({ time: klines[i].date as Time, value: v });
  }
  return out;
}
