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
}

export interface IcebreakerConfig {
  lines: string[];
  summary: string;
}
