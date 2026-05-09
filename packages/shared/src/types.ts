export interface MarketData {
  code: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  turnover: number;
  open: number;
  high: number;
  low: number;
  preClose: number;
}

export interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  width: number;
}

export interface MAResult {
  ma5: number;
  ma20: number;
  ma60: number;
}

// ---- New indicator types ----

export type SignalStrength = 'bullish' | 'bearish' | 'neutral';

export interface RSIResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface MACDResult {
  dif: number;
  dea: number;
  histogram: number;
  signal: 'golden_cross' | 'death_cross' | 'bullish' | 'bearish' | 'neutral';
}

export interface KDJResult {
  k: number;
  d: number;
  j: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface WRResult {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface AdvancedIndicators {
  rsi: RSIResult | null;
  macd: MACDResult | null;
  kdj: KDJResult | null;
  wr: WRResult | null;
  amplitude: number;
  volumeRatio: number | null;
  limitDistance: { up: number; down: number };
  maArrangement: 'bullish_alignment' | 'bearish_alignment' | 'crossed';
}

export interface AISummary {
  text: string;
  signals: { indicator: string; level: 'risk' | 'opportunity' | 'info'; message: string }[];
  adjustments?: AIAdjustment[];
}

export interface AIAdjustment {
  field: string;
  before: string;
  after: string;
  reason: string;
}

export interface AIAnalysisResult {
  summary: AISummary;
  adjustedAnalysis?: AnalysisResult;
}

export interface AnalysisResult {
  marketState: 'ranging' | 'trending_up' | 'trending_down';
  bollinger: BollingerResult;
  atr: number;
  ma: MAResult;
  support: number;
  resistance: number;
  recommendation: 'grid' | 'condition';
  confidence: number;
  gridParams?: GridParams;
  conditionParams?: ConditionParams;
  advanced: AdvancedIndicators;
}

export interface GridParams {
  basePrice: number;
  stepPercent: number;
  gridCount: number;
  lotPerGrid: number;
}

export interface ConditionParams {
  buyTriggerPrice: number;
  sellTriggerPrice: number;
  buyLot: number;
  sellLot: number;
}

export interface AnalyzeRequest {
  stockCode: string;
  totalCapital: number;
  mode: 'auto' | 'grid' | 'condition';
  isT0Mode: boolean;
  useAI: boolean;
}

export interface AnalyzeResponse {
  market: MarketData;
  analysis: AnalysisResult;
  config: IcebreakerConfig;
  aiResult?: AIAnalysisResult;
}

export interface IcebreakerConfig {
  lines: string[];
  summary: string;
}

export interface StockSearchItem {
  code: string;
  name: string;
  market: 'SH' | 'SZ';
}

// ---- Screener types ----

export type FactorCategory = 'trend' | 'momentum' | 'volume' | 'volatility' | 'valuation';

export interface FactorInfo {
  id: string;
  name: string;
  description: string;
  category: FactorCategory;
}

export type FactorOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';

export interface StrategyFactor {
  factorId: string;
  operator: FactorOperator;
  value: string | number;
  weight: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  factors: StrategyFactor[];
  minScore: number;
}

export interface TriggeredFactor {
  id: string;
  name: string;
  passed: boolean;
  weight: number;
}

export interface ScreenerResult {
  code: string;
  name: string;
  market: 'SH' | 'SZ';
  price: number;
  change: number;
  open: number;
  high: number;
  low: number;
  preClose: number;
  volume: number;
  turnover: number;
  score: number;
  triggeredFactors: TriggeredFactor[];
  klineSnapshot: number[]; // 最近 20 天收盘价，用于 sparkline
}

export interface StrategyStats {
  totalScans: number;
  lastScanAt: string | null;
  avgResults: number;
  recentHitRate: number | null; // 平均次日涨幅
}

export interface JobProgress {
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: { scanned: number; total: number };
  results?: ScreenerResult[];
  strategyId: string;
  startedAt: string;
  error?: string;
}

export interface ScreenerRunRequest {
  strategyIds: string[];
  market?: 'all' | 'sh' | 'sz' | 'hs300';
}

export interface ScreenerRunResponse {
  jobIds: string[];
}

export interface StockListItem {
  code: string;
  name: string;
  market: 'SH' | 'SZ';
}
