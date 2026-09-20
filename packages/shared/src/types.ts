export type RealtimeMarketSource = 'eastmoney' | 'tencent' | 'hithink';
export type RealtimeSourcePreference = 'auto' | RealtimeMarketSource;

// ---- Lottery history (used by the random experiment lab) ----

export type LotteryKind = 'ssq' | 'dlt';
export type LotteryHistoryProvider = 'cwl' | 'sporttery' | 'juhe';

export interface LotteryDraw {
  issue: string;
  drawDate: string;
  front: number[];
  back: number[];
}

export interface LotteryHistoryResponse {
  kind: LotteryKind;
  draws: LotteryDraw[];
  source: LotteryHistoryProvider;
  sourceLabel: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
}

export interface MarketData {
  code: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  /** Turnover rate in percent. Zero is a placeholder when turnoverAvailable is false. */
  turnover: number;
  /** False when the provider exposes turnover amount but not turnover rate. */
  turnoverAvailable?: boolean;
  /** Traded amount in CNY when the provider exposes it separately. */
  turnoverAmount?: number;
  open: number;
  high: number;
  low: number;
  preClose: number;
  /** Actual realtime quote provider used for this response. */
  source?: RealtimeMarketSource;
  /** Provider snapshot timestamp in Unix milliseconds, when available. */
  quoteTimestamp?: number | null;
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
  realtimeSource?: RealtimeSourcePreference;
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
  /** Intended holding/decision horizon shown in the screener UI. */
  horizon?: 'short' | 'medium' | 'long';
  /** Number of daily bars required by the strategy. Defaults to 60. */
  lookbackDays?: number;
  /** Whether stocks currently trading at their upper price limit may enter. */
  includeLimitUp?: boolean;
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
  turnoverAvailable?: boolean;
  turnoverAmount?: number;
  score: number;
  /** Original deterministic strategy score. Present after AI re-ranking. */
  quantScore?: number;
  /** Grounded LLM review for this candidate. */
  aiReview?: {
    score: number;
    confidence: number;
    thesis: string;
    risks: string[];
  };
  triggeredFactors: TriggeredFactor[];
  klineSnapshot: number[]; // 最近 20 天收盘价，用于 sparkline
}


export interface JobProgress {
  status: 'running' | 'done' | 'error' | 'cancelled';
  progress: { scanned: number; total: number; failed: number };
  /** Results for every requested strategy. `results` remains for older clients. */
  resultsByStrategy?: Record<string, ScreenerResult[]>;
  results?: ScreenerResult[];
  strategyId: string;
  startedAt: string;
  error?: string;
  phase?: 'market_sync' | 'scanning' | 'ai_review';
  aiReviewStatus?: 'not_requested' | 'running' | 'done' | 'unavailable';
  aiReviewError?: string;
  aiReviewedAt?: string;
}

export interface ScreenerRunRequest {
  strategyIds: string[];
  market?: 'all' | 'sh' | 'sz' | 'hs300';
  /** 包含创业板（300xxx，深市）。默认 false。 */
  includeGEM?: boolean;
  /** 包含科创板（688xxx，沪市）。默认 false。 */
  includeSTAR?: boolean;
  /** Re-rank the quantitative shortlist with a grounded LLM review. */
  useAIReview?: boolean;
  /** Realtime quote source. Auto uses EastMoney, Tencent, then configured HiThink fallback. */
  realtimeSource?: RealtimeSourcePreference;
}

/** Code prefix → board membership check. */
export function isGEM(code: string): boolean {
  return code.startsWith('30');
}

export function isSTAR(code: string): boolean {
  return code.startsWith('688');
}

export interface ScreenerRunResponse {
  jobIds: string[];
}

export interface StockListItem {
  code: string;
  name: string;
  market: 'SH' | 'SZ';
}

// ---- K-line detail (stock detail dialog) ----

export type KlinePeriod = 'daily' | 'weekly' | 'monthly' | '5min' | '15min' | '30min' | '60min';

export const KLINE_PERIODS: KlinePeriod[] = ['daily', 'weekly', 'monthly', '5min', '15min', '30min', '60min'];

/** EastMoney klt parameter mapping. */
export const KLINE_PERIOD_TO_KLT: Record<KlinePeriod, number> = {
  '5min': 5,
  '15min': 15,
  '30min': 30,
  '60min': 60,
  daily: 101,
  weekly: 102,
  monthly: 103,
};

/** Minute-level periods. Used to decide whether empty klines means "no data this period" (200 + []) vs "stock not found" (404). */
export const KLINE_MINUTE_PERIODS: ReadonlyArray<KlinePeriod> = ['5min', '15min', '30min', '60min'];

// ---- Persistence types: history + favorites + backup ----

export interface ScanSnapshot {
  id: string;
  date: string;
  timestamp: string;
  strategyIds: string[];
  marketFilter: 'all' | 'sh' | 'sz' | 'hs300';
  durationMs: number;
  results: Record<string, ScreenerResult[]>;
  aiReviewStatus?: 'not_requested' | 'done' | 'unavailable';
  aiReviewError?: string;
  aiReviewedAt?: string;
}

export interface ScanSnapshotMeta {
  id: string;
  date: string;
  timestamp: string;
  strategyIds: string[];
  marketFilter: 'all' | 'sh' | 'sz' | 'hs300';
  totalResults: number;
  aiReviewStatus?: 'not_requested' | 'done' | 'unavailable';
  aiReviewedAt?: string;
}

export type HistoryRange = 'today' | '7d' | '30d' | 'all';

export interface HistoryDateGroup {
  date: string;
  snapshots: ScanSnapshotMeta[];
}

export interface FavoriteEntry {
  stock: ScreenerResult;
  tags: string[];
  note: string;
  addedAt: string;
}

export interface SnapshotDiffRetainedEntry {
  stock: ScreenerResult;
  scoreDelta: number;
}

export interface SnapshotDiff {
  fromId: string;
  toId: string;
  strategyId: string;
  newcomers: ScreenerResult[];
  dropouts: ScreenerResult[];
  retained: SnapshotDiffRetainedEntry[];
}

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  history: ScanSnapshot[];
  favorites: FavoriteEntry[];
}

export interface MarketIndex {
  label: string;
  value: number;
  changePct: number;
}

export const FAVORITE_TAG_LIMIT = 3;
export const FAVORITE_NOTE_LIMIT = 200;
export const MAX_HISTORY_ENTRIES = 365;
