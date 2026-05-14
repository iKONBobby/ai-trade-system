'use client';

import { useEffect, useRef } from 'react';
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

  // Effect 1: create chart + series once, cleanup on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#999',
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#333' },
      timeScale: {
        borderColor: '#333',
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    // A 股惯例：红涨绿跌（lightweight-charts 默认相反）
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#22c55e',
      borderUpColor: '#ef4444',
      borderDownColor: '#22c55e',
      wickUpColor: '#ef4444',
      wickDownColor: '#22c55e',
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
    s.volume.setData(
      data.map((k) => ({
        time: k.date as Time,
        value: k.volume,
        color: k.close >= k.open ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)',
      })),
    );
    s.ma5.setData(maToLineData(data, calcMA(data, 5)));
    s.ma10.setData(maToLineData(data, calcMA(data, 10)));
    s.ma20.setData(maToLineData(data, calcMA(data, 20)));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

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
