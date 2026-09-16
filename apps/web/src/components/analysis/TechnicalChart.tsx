'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { KLine } from '@trade/shared';
import type { DrawingLevel } from '@/lib/analysis-persistence';
import { buildTechnicalSeries } from '@/lib/technical-workspace';

export type SecondaryIndicator = 'macd' | 'rsi';

interface TechnicalChartProps {
  data: KLine[];
  secondary: SecondaryIndicator;
  benchmarkData?: KLine[];
  levels?: DrawingLevel[];
  height?: number;
}

interface ChartSeries {
  candle: ISeriesApi<'Candlestick'>;
  volume: ISeriesApi<'Histogram'>;
  ma5: ISeriesApi<'Line'>;
  ma20: ISeriesApi<'Line'>;
  ma60: ISeriesApi<'Line'>;
  upper: ISeriesApi<'Line'>;
  lower: ISeriesApi<'Line'>;
  indicatorLine?: ISeriesApi<'Line'>;
  indicatorSignal?: ISeriesApi<'Line'>;
  indicatorHistogram?: ISeriesApi<'Histogram'>;
  primaryPerformance?: ISeriesApi<'Line'>;
  benchmarkPerformance?: ISeriesApi<'Line'>;
  markers: ISeriesMarkersPluginApi<Time>;
  priceLines: IPriceLine[];
}

function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string) => styles.getPropertyValue(token).trim() || fallback;
  return {
    text: read('--text-3', '#7f8781'),
    grid: read('--border-1', '#2b312f'),
    border: read('--border-2', '#424a46'),
    surface: read('--surface-1', '#151819'),
    up: read('--up', '#ef5350'),
    down: read('--down', '#27c36a'),
    accent: read('--accent', '#c6ef67'),
    info: read('--info', '#82a9e8'),
    warning: read('--warning', '#eab866'),
  };
}

function alpha(color: string, opacity: number) {
  const raw = color.replace('#', '');
  if (raw.length !== 6) return color;
  const value = Number.parseInt(raw, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

export default function TechnicalChart({ data, secondary, benchmarkData = [], levels = [], height = 560 }: TechnicalChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ChartSeries | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const technical = useMemo(() => buildTechnicalSeries(data), [data]);
  const hasBenchmark = benchmarkData.length > 0;

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const colors = themeColors();
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: colors.text },
      grid: { vertLines: { color: alpha(colors.grid, 0.55) }, horzLines: { color: alpha(colors.grid, 0.55) } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { horzTouchDrag: true, mouseWheel: true, pressedMouseMove: true },
    });
    chartRef.current = chart;

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    }, 0);
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' }, 0);
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const ma5 = chart.addSeries(LineSeries, { color: colors.warning, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 0);
    const ma20 = chart.addSeries(LineSeries, { color: colors.info, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, 0);
    const ma60 = chart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, 0);
    const upper = chart.addSeries(LineSeries, { color: alpha(colors.text, 0.5), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }, 0);
    const lower = chart.addSeries(LineSeries, { color: alpha(colors.text, 0.5), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }, 0);
    const markers = createSeriesMarkers(candle, []);

    let indicatorLine: ChartSeries['indicatorLine'];
    let indicatorSignal: ChartSeries['indicatorSignal'];
    let indicatorHistogram: ChartSeries['indicatorHistogram'];
    if (secondary === 'rsi') {
      indicatorLine = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 2, priceLineVisible: false }, 1);
      indicatorLine.createPriceLine({ price: 70, color: alpha(colors.up, 0.55), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
      indicatorLine.createPriceLine({ price: 30, color: alpha(colors.down, 0.55), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
    } else {
      indicatorLine = chart.addSeries(LineSeries, { color: colors.info, lineWidth: 1, priceLineVisible: false }, 1);
      indicatorSignal = chart.addSeries(LineSeries, { color: colors.warning, lineWidth: 1, priceLineVisible: false }, 1);
      indicatorHistogram = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
    }
    let primaryPerformance: ChartSeries['primaryPerformance'];
    let benchmarkPerformance: ChartSeries['benchmarkPerformance'];
    if (hasBenchmark) {
      primaryPerformance = chart.addSeries(LineSeries, { color: colors.accent, lineWidth: 2, priceLineVisible: false, title: '个股' }, 2);
      benchmarkPerformance = chart.addSeries(LineSeries, { color: colors.info, lineWidth: 2, lineStyle: 2, priceLineVisible: false, title: '沪深300 ETF' }, 2);
    }
    seriesRef.current = {
      candle, volume, ma5, ma20, ma60, upper, lower, indicatorLine, indicatorSignal,
      indicatorHistogram, primaryPerformance, benchmarkPerformance, markers, priceLines: [],
    };

    const resize = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
    resize.observe(container);
    return () => {
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [hasBenchmark, height, secondary, themeRevision]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const colors = themeColors();
    series.candle.setData(data.map((item) => ({
      time: item.date as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    })));
    series.volume.setData(data.map((item) => ({
      time: item.date as Time,
      value: item.volume,
      color: alpha(item.close >= item.open ? colors.up : colors.down, 0.36),
    })));
    setLine(series.ma5, technical, 'ma5');
    setLine(series.ma20, technical, 'ma20');
    setLine(series.ma60, technical, 'ma60');
    setLine(series.upper, technical, 'bollUpper');
    setLine(series.lower, technical, 'bollLower');

    if (secondary === 'rsi' && series.indicatorLine) {
      setLine(series.indicatorLine, technical, 'rsi');
    } else {
      if (series.indicatorLine) setLine(series.indicatorLine, technical, 'macd');
      if (series.indicatorSignal) setLine(series.indicatorSignal, technical, 'macdSignal');
      series.indicatorHistogram?.setData(technical.flatMap((point) => point.macdHistogram == null ? [] : [{
        time: point.date as Time,
        value: point.macdHistogram,
        color: alpha(point.macdHistogram >= 0 ? colors.up : colors.down, 0.58),
      }]));
    }

    series.markers.setMarkers(buildMarkers(technical, colors));
    series.primaryPerformance?.setData(normalizedPerformance(data));
    series.benchmarkPerformance?.setData(normalizedPerformance(benchmarkData));
    chart.timeScale().fitContent();
  }, [benchmarkData, data, secondary, technical, themeRevision]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.priceLines.forEach((line) => series.candle.removePriceLine(line));
    const colors = themeColors();
    series.priceLines = levels.map((level) => series.candle.createPriceLine({
      price: level.price,
      color: level.kind === 'support' ? colors.down : level.kind === 'resistance' ? colors.up : colors.warning,
      lineWidth: 1,
      lineStyle: level.kind === 'note' ? 2 : 0,
      axisLabelVisible: true,
      title: level.label,
    }));
  }, [levels, themeRevision, secondary, hasBenchmark]);

  return (
    <div className="technical-chart">
      <div ref={containerRef} className="technical-chart__canvas" style={{ height }} />
      <p className="sr-only" role="status">
        图表包含 {data.length} 根 K 线、成交量、MA5、MA20、MA60、布林带和{secondary === 'rsi' ? ' RSI' : ' MACD'}副图，{levels.length} 条价格标注{hasBenchmark ? '，并与沪深300 ETF进行归一化比较' : ''}。
      </p>
    </div>
  );
}

function normalizedPerformance(data: KLine[]): LineData[] {
  const first = data.find((item) => Number.isFinite(item.close) && item.close > 0)?.close;
  if (!first) return [];
  return data.map((item) => ({ time: item.date as Time, value: ((item.close / first) - 1) * 100 }));
}

function setLine(
  series: ISeriesApi<'Line'>,
  points: ReturnType<typeof buildTechnicalSeries>,
  key: 'ma5' | 'ma20' | 'ma60' | 'bollUpper' | 'bollLower' | 'rsi' | 'macd' | 'macdSignal',
) {
  const data: LineData[] = points.flatMap((point) => point[key] == null ? [] : [{ time: point.date as Time, value: point[key] }]);
  series.setData(data);
}

function buildMarkers(points: ReturnType<typeof buildTechnicalSeries>, colors: ReturnType<typeof themeColors>): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.ma20 == null || current.ma20 == null) continue;
    const crossedUp = previous.close <= previous.ma20 && current.close > current.ma20;
    const crossedDown = previous.close >= previous.ma20 && current.close < current.ma20;
    if (crossedUp || crossedDown) {
      markers.push({
        time: current.date as Time,
        position: crossedUp ? 'belowBar' : 'aboveBar',
        color: crossedUp ? colors.up : colors.down,
        shape: crossedUp ? 'arrowUp' : 'arrowDown',
        text: crossedUp ? '上穿 MA20' : '跌破 MA20',
      });
    }
  }
  return markers.slice(-10);
}
