import type { LotteryDraw, LotteryKind } from '@trade/shared';

export type { LotteryKind } from '@trade/shared';
export type ContextMode = 'balanced' | 'calendar' | 'signal';
export type GenerationMode = 'fair' | 'factor';
export type LayerCode = 'P' | 'E' | 'L';

export type LotteryConfig = {
  kind: LotteryKind;
  name: string;
  frontLabel: string;
  backLabel: string;
  frontMax: number;
  frontCount: number;
  backMax: number;
  backCount: number;
};

export type NumberAgentInput = {
  kind: LotteryKind;
  mode: GenerationMode;
  quantity: number;
  drawLabel?: string;
  previous?: string;
  hot?: string;
  contextMode: ContextMode;
  contextText?: string;
  inspiration?: string;
};

export type PickReference = { front: number[]; back: number[] };

export type ShapeMetrics = {
  odd: number;
  even: number;
  low: number;
  high: number;
  span: number;
  sum: number;
  adjacentPairs: number;
  thirds: [number, number, number];
};

export type AgentPick = PickReference & {
  id: string;
  shape: ShapeMetrics;
  crowdingScore: number;
  reason: string;
  inspirationTrace: string;
};

export type LayerTrace = {
  code: LayerCode;
  status: 'done' | 'skipped';
  summary: string;
  metrics: string[];
};

export type ProbabilityLayer = {
  trace: LayerTrace;
  historyCount: number;
  latest: LotteryDraw | null;
  exactHistory: Set<string>;
  previousFront: number[];
  hot: number[];
  priorPicks: PickReference[];
  frequentFront: number[];
};

export type WeightLayer = {
  trace: LayerTrace;
  frontTargets: number[];
  backTargets: number[];
};

export type AgentLayers = {
  probability: ProbabilityLayer;
  environment: WeightLayer;
  inspiration: WeightLayer;
};

export type RejectionReason = 'history' | 'latest' | 'structure' | 'crowding' | 'batch';
export type RejectionBreakdown = Record<RejectionReason, number>;

export type AgentRun = {
  config: LotteryConfig;
  mode: GenerationMode;
  picks: AgentPick[];
  attempted: number;
  rejected: number;
  rejectionBreakdown: RejectionBreakdown;
  traces: LayerTrace[];
  contextSummary: string;
  generatedAt: string;
};

export const LOTTERY_CONFIGS: Record<LotteryKind, LotteryConfig> = {
  ssq: { kind: 'ssq', name: '双色球', frontLabel: '红球', backLabel: '蓝球', frontMax: 33, frontCount: 6, backMax: 16, backCount: 1 },
  dlt: { kind: 'dlt', name: '大乐透', frontLabel: '前区', backLabel: '后区', frontMax: 35, frontCount: 5, backMax: 12, backCount: 2 },
};

export type RandomSource = () => number;

function secureRandom(): number {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] / 4_294_967_296;
  }
  throw new Error('当前环境不支持安全随机源，请更换现代浏览器后重试。');
}

export function parseNumberList(value: string | undefined, max: number): number[] {
  if (!value) return [];
  const matches = value.match(/\d+/g) ?? [];
  return Array.from(new Set(matches.map(Number).filter((item) => item >= 1 && item <= max)));
}

function hashText(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function mappedNumbers(value: string, max: number, count: number): number[] {
  if (!value.trim()) return [];
  const result = new Set<number>();
  let state = hashText(value);
  let guard = 0;
  while (result.size < Math.min(count, max) && guard < max * 4) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    result.add((state % max) + 1);
    guard += 1;
  }
  return Array.from(result);
}

function sample(max: number, count: number, weightFor: (number: number) => number, random: RandomSource): number[] {
  const pool = Array.from({ length: max }, (_, index) => index + 1);
  const selected: number[] = [];
  while (selected.length < count) {
    const weights = pool.map((number) => Math.max(0.05, weightFor(number)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = random() * total;
    let selectedIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) { selectedIndex = index; break; }
    }
    selected.push(pool[selectedIndex]);
    pool.splice(selectedIndex, 1);
  }
  return selected.sort((a, b) => a - b);
}

export function analyzeShape(numbers: number[], max: number): ShapeMetrics {
  const sorted = [...numbers].sort((a, b) => a - b);
  const split = max / 2;
  const third = max / 3;
  let adjacentPairs = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] - sorted[index - 1] === 1) adjacentPairs += 1;
  }
  return {
    odd: sorted.filter((number) => number % 2 !== 0).length,
    even: sorted.filter((number) => number % 2 === 0).length,
    low: sorted.filter((number) => number <= split).length,
    high: sorted.filter((number) => number > split).length,
    span: sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0,
    sum: sorted.reduce((sum, number) => sum + number, 0),
    adjacentPairs,
    thirds: [
      sorted.filter((number) => number <= third).length,
      sorted.filter((number) => number > third && number <= third * 2).length,
      sorted.filter((number) => number > third * 2).length,
    ],
  };
}

function combinationKey(front: number[], back: number[]): string {
  return `${[...front].sort((a, b) => a - b).join('-')}|${[...back].sort((a, b) => a - b).join('-')}`;
}

function intersectionSize(left: number[], right: number[]): number {
  const rightSet = new Set(right);
  return left.filter((number) => rightSet.has(number)).length;
}

function frequencyLeaders(draws: LotteryDraw[], count: number): number[] {
  const frequencies = new Map<number, number>();
  draws.forEach((draw) => draw.front.forEach((number) => frequencies.set(number, (frequencies.get(number) ?? 0) + 1)));
  return [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, count)
    .map(([number]) => number);
}

export function analyzeProbabilityLayer(input: NumberAgentInput, history: LotteryDraw[], priorPicks: PickReference[]): ProbabilityLayer {
  const config = LOTTERY_CONFIGS[input.kind];
  if (input.mode === 'fair') {
    return {
      trace: { code: 'P', status: 'skipped', summary: '公平模式不读取历史过滤条件', metrics: ['仅校验彩种号码范围与不重复'] },
      historyCount: history.length, latest: history[0] ?? null, exactHistory: new Set(), previousFront: [], hot: [], priorPicks: [], frequentFront: [],
    };
  }
  const latest = history[0] ?? null;
  const manualPrevious = parseNumberList(input.previous, config.frontMax).slice(0, config.frontCount);
  const previousFront = manualPrevious.length === config.frontCount ? manualPrevious : latest?.front ?? [];
  const hot = parseNumberList(input.hot, config.frontMax);
  const frequentFront = frequencyLeaders(history, Math.min(8, config.frontMax));
  return {
    trace: {
      code: 'P', status: 'done',
      summary: history.length ? `已分析 ${history.length} 期真实开奖，最新 ${latest?.issue ?? '未知期号'}` : '未取得历史数据，仅执行本地结构与跨批次过滤',
      metrics: [
        `历史原样组合 ${history.length} 组`,
        `跨批次参考 ${priorPicks.length} 组`,
        frequentFront.length ? `高频观察 ${frequentFront.map((number) => String(number).padStart(2, '0')).join(' / ')}` : '无频次样本',
      ],
    },
    historyCount: history.length,
    latest,
    exactHistory: new Set(history.map((draw) => combinationKey(draw.front, draw.back))),
    previousFront,
    hot,
    priorPicks,
    frequentFront,
  };
}

function shanghaiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function analyzeEnvironmentLayer(input: NumberAgentInput): WeightLayer {
  const config = LOTTERY_CONFIGS[input.kind];
  if (input.mode === 'fair') {
    return { trace: { code: 'E', status: 'skipped', summary: '公平模式不施加环境权重', metrics: ['所有合法号码保持等权'] }, frontTargets: [], backTargets: [] };
  }
  const source = input.contextMode === 'calendar'
    ? `${shanghaiDate()}|${input.drawLabel ?? ''}`
    : input.contextMode === 'signal' ? `${input.contextText ?? ''}|${input.drawLabel ?? ''}` : '';
  const frontTargets = mappedNumbers(source, config.frontMax, 5);
  const backTargets = mappedNumbers(source, config.backMax, 2);
  const label = input.contextMode === 'calendar' ? '上海时区日期与期号' : input.contextMode === 'signal' ? '自定义关键词与期号' : '均衡设置';
  return {
    trace: { code: 'E', status: 'done', summary: `${label}已转换为可追踪权重`, metrics: [frontTargets.length ? `前区 +10%：${frontTargets.join(' / ')}` : '前区保持等权', backTargets.length ? `后区 +10%：${backTargets.join(' / ')}` : '后区保持等权'] },
    frontTargets, backTargets,
  };
}

export function analyzeInspirationLayer(input: NumberAgentInput): WeightLayer {
  const config = LOTTERY_CONFIGS[input.kind];
  if (input.mode === 'fair') {
    return { trace: { code: 'L', status: 'skipped', summary: '公平模式不施加文本映射权重', metrics: ['安全随机源直接抽样'] }, frontTargets: [], backTargets: [] };
  }
  const frontTargets = mappedNumbers(input.inspiration ?? '', config.frontMax, 4);
  const backTargets = mappedNumbers(input.inspiration ?? '', config.backMax, 2);
  return {
    trace: { code: 'L', status: 'done', summary: frontTargets.length ? '灵感词已确定性映射，不联网、不预测' : '未填写灵感词，本层保持中性', metrics: [frontTargets.length ? `前区 +22%：${frontTargets.join(' / ')}` : '前区保持等权', backTargets.length ? `后区 +22%：${backTargets.join(' / ')}` : '后区保持等权'] },
    frontTargets, backTargets,
  };
}

function sameTailPeak(numbers: number[]): number {
  const counts = new Map<number, number>();
  numbers.forEach((number) => counts.set(number % 10, (counts.get(number % 10) ?? 0) + 1));
  return Math.max(0, ...counts.values());
}

function isArithmetic(numbers: number[]): boolean {
  if (numbers.length < 4) return false;
  const difference = numbers[1] - numbers[0];
  return numbers.slice(2).every((number, index) => number - numbers[index + 1] === difference);
}

function expectedSumRange(max: number, count: number): [number, number] {
  const mean = count * (max + 1) / 2;
  const variance = (max * max - 1) / 12;
  const correction = max > 1 ? (max - count) / (max - 1) : 0;
  const deviation = Math.sqrt(count * variance * correction);
  return [mean - deviation * 1.5, mean + deviation * 1.5];
}

function structureIsValid(front: number[], config: LotteryConfig): boolean {
  const shape = analyzeShape(front, config.frontMax);
  const [minSum, maxSum] = expectedSumRange(config.frontMax, config.frontCount);
  return shape.odd > 0 && shape.even > 0 && shape.low > 0 && shape.high > 0
    && shape.thirds.every((count) => count > 0) && shape.adjacentPairs <= 1
    && shape.span >= Math.min(15, config.frontMax - 1) && shape.sum >= minSum && shape.sum <= maxSum
    && sameTailPeak(front) < 3 && !isArithmetic(front);
}

function crowdingScore(numbers: number[], max: number, hot: number[], previous: number[]): number {
  const shape = analyzeShape(numbers, max);
  const ideal = numbers.length / 2;
  const birthdayShare = numbers.filter((number) => number <= 31).length / numbers.length;
  const score = 10 + shape.thirds.reduce((sum, zone) => sum + Math.abs(zone - numbers.length / 3) * 3, 0)
    + Math.abs(shape.odd - ideal) * 4 + Math.abs(shape.low - ideal) * 4 + (max > 31 ? birthdayShare * 10 : 4)
    + intersectionSize(numbers, hot) * 4 + intersectionSize(numbers, previous) * 3
    + shape.adjacentPairs * 8 + Math.max(0, sameTailPeak(numbers) - 1) * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildWeight(environment: number[], inspiration: number[]) {
  const environmentSet = new Set(environment);
  const inspirationSet = new Set(inspiration);
  return (number: number) => {
    let weight = 1;
    if (environmentSet.has(number)) weight *= 1.1;
    if (inspirationSet.has(number)) weight *= 1.22;
    if (inspirationSet.has(number - 1) || inspirationSet.has(number + 1)) weight *= 1.06;
    return weight;
  };
}

function rejectReason(front: number[], back: number[], config: LotteryConfig, p: ProbabilityLayer, accepted: AgentPick[]): RejectionReason | null {
  if (p.exactHistory.has(combinationKey(front, back))) return 'history';
  if (p.previousFront.length && intersectionSize(front, p.previousFront) >= Math.min(3, config.frontCount)) return 'latest';
  if (intersectionSize(front, p.hot) >= Math.min(5, config.frontCount)) return 'crowding';
  if (p.priorPicks.some((pick) => intersectionSize(front, pick.front) >= Math.min(5, config.frontCount))) return 'batch';
  if (accepted.some((pick) => intersectionSize(front, pick.front) >= Math.min(5, config.frontCount))) return 'batch';
  if (!structureIsValid(front, config)) return 'structure';
  return null;
}

function formatTrace(numbers: number[]): string {
  return numbers.length ? `灵感映射 ${numbers.map((number) => String(number).padStart(2, '0')).join(' / ')}` : '未启用灵感映射';
}

export function generateAgentRun(input: NumberAgentInput, layers?: AgentLayers, random: RandomSource = secureRandom): AgentRun {
  const config = LOTTERY_CONFIGS[input.kind];
  const quantity = Math.max(1, Math.min(10, Math.round(input.quantity)));
  const resolved = layers ?? {
    probability: analyzeProbabilityLayer(input, [], []),
    environment: analyzeEnvironmentLayer(input),
    inspiration: analyzeInspirationLayer(input),
  };
  const picks: AgentPick[] = [];
  const rejectionBreakdown: RejectionBreakdown = { history: 0, latest: 0, structure: 0, crowding: 0, batch: 0 };
  const frontWeight = input.mode === 'fair' ? () => 1 : buildWeight(resolved.environment.frontTargets, resolved.inspiration.frontTargets);
  const backWeight = input.mode === 'fair' ? () => 1 : buildWeight(resolved.environment.backTargets, resolved.inspiration.backTargets);
  const maxAttempts = input.mode === 'fair' ? quantity : quantity * 1_200;
  let attempted = 0;
  while (picks.length < quantity && attempted < maxAttempts) {
    attempted += 1;
    const front = sample(config.frontMax, config.frontCount, frontWeight, random);
    const back = sample(config.backMax, config.backCount, backWeight, random);
    if (input.mode === 'factor') {
      const reason = rejectReason(front, back, config, resolved.probability, picks);
      if (reason) { rejectionBreakdown[reason] += 1; continue; }
    }
    const shape = analyzeShape(front, config.frontMax);
    const crowding = crowdingScore(front, config.frontMax, resolved.probability.hot, resolved.probability.previousFront);
    if (input.mode === 'factor' && crowding > 60) { rejectionBreakdown.crowding += 1; continue; }
    picks.push({
      id: `${input.kind}-${attempted}-${front.join('-')}-${back.join('-')}`,
      front, back, shape, crowdingScore: crowding,
      reason: input.mode === 'fair' ? '由浏览器安全随机源等权抽取；未应用历史、形态、环境或灵感过滤。' : `通过真实历史、结构与跨批次过滤；三区 ${shape.thirds.join(':')}，跨度 ${shape.span}。`,
      inspirationTrace: input.mode === 'fair' ? '公平随机：无权重映射' : formatTrace(resolved.inspiration.frontTargets),
    });
  }
  if (picks.length < quantity) throw new Error('当前约束未能生成足够样本，请减少热门号或清空手动上期号码后重试。');
  return {
    config, mode: input.mode, picks, attempted, rejected: attempted - picks.length, rejectionBreakdown,
    traces: [resolved.probability.trace, resolved.environment.trace, resolved.inspiration.trace],
    contextSummary: input.mode === 'fair' ? '公平随机：全部合法号码等权' : resolved.environment.trace.summary,
    generatedAt: new Date().toISOString(),
  };
}

export function formatAgentRunForClipboard(run: AgentRun): string {
  const mode = run.mode === 'fair' ? '公平随机' : '因子实验';
  const lines = run.picks.map((pick, index) => {
    const front = pick.front.map((number) => String(number).padStart(2, '0')).join(' ');
    const back = pick.back.map((number) => String(number).padStart(2, '0')).join(' ');
    return `${String(index + 1).padStart(2, '0')}. ${front} + ${back}`;
  });
  return [`${run.config.name}｜${mode}｜${run.picks.length}组`, ...lines].join('\n');
}
