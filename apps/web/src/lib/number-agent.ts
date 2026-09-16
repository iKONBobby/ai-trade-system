export type LotteryKind = 'ssq' | 'dlt';
export type ContextMode = 'balanced' | 'calendar' | 'signal';

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
  quantity: number;
  drawLabel?: string;
  previous?: string;
  hot?: string;
  contextMode: ContextMode;
  contextText?: string;
  inspiration?: string;
};

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

export type AgentPick = {
  id: string;
  front: number[];
  back: number[];
  shape: ShapeMetrics;
  crowdingScore: number;
  reason: string;
  inspirationTrace: string;
};

export type AgentRun = {
  config: LotteryConfig;
  picks: AgentPick[];
  attempted: number;
  rejected: number;
  contextSummary: string;
  generatedAt: string;
};

export const LOTTERY_CONFIGS: Record<LotteryKind, LotteryConfig> = {
  ssq: {
    kind: 'ssq',
    name: '双色球',
    frontLabel: '红球',
    backLabel: '蓝球',
    frontMax: 33,
    frontCount: 6,
    backMax: 16,
    backCount: 1,
  },
  dlt: {
    kind: 'dlt',
    name: '大乐透',
    frontLabel: '前区',
    backLabel: '后区',
    frontMax: 35,
    frontCount: 5,
    backMax: 12,
    backCount: 2,
  },
};

type RandomSource = () => number;

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

function weightedSample(max: number, count: number, weightFor: (number: number) => number, random: RandomSource): number[] {
  const pool = Array.from({ length: max }, (_, index) => index + 1);
  const selected: number[] = [];

  while (selected.length < count && pool.length > 0) {
    const weights = pool.map((number) => Math.max(0.05, weightFor(number)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = random() * total;
    let selectedIndex = pool.length - 1;

    for (let index = 0; index < pool.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) {
        selectedIndex = index;
        break;
      }
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
  const populationVariance = (max * max - 1) / 12;
  const correction = max > 1 ? (max - count) / (max - 1) : 0;
  const deviation = Math.sqrt(count * populationVariance * correction);
  return [mean - deviation * 1.5, mean + deviation * 1.5];
}

function intersectionSize(left: number[], right: number[]): number {
  const rightSet = new Set(right);
  return left.filter((number) => rightSet.has(number)).length;
}

function isStructurallyValid(
  numbers: number[],
  config: LotteryConfig,
  previous: number[],
  hot: number[],
  accepted: AgentPick[],
): boolean {
  const shape = analyzeShape(numbers, config.frontMax);
  const [minSum, maxSum] = expectedSumRange(config.frontMax, config.frontCount);
  const extremeParity = shape.odd === 0 || shape.even === 0;
  const extremeSize = shape.low === 0 || shape.high === 0;
  const oneZoneOnly = shape.thirds.some((count) => count === 0);
  const matchesPrevious = previous.length >= config.frontCount
    && numbers.every((number) => previous.includes(number));
  const repeatedTooMuch = intersectionSize(numbers, previous) >= Math.min(3, config.frontCount);
  const hotCollision = intersectionSize(numbers, hot) >= Math.min(5, config.frontCount);
  const selfCollision = accepted.some((pick) => intersectionSize(numbers, pick.front) >= Math.min(5, config.frontCount));

  return !matchesPrevious
    && !repeatedTooMuch
    && !hotCollision
    && !selfCollision
    && !extremeParity
    && !extremeSize
    && !oneZoneOnly
    && shape.adjacentPairs <= 1
    && shape.span >= Math.min(15, config.frontMax - 1)
    && shape.sum >= minSum
    && shape.sum <= maxSum
    && sameTailPeak(numbers) < 3
    && !isArithmetic(numbers);
}

function crowdingScore(numbers: number[], max: number, hot: number[], previous: number[]): number {
  const shape = analyzeShape(numbers, max);
  const count = numbers.length;
  const ideal = count / 2;
  const birthdayShare = numbers.filter((number) => number <= 31).length / count;
  const zonePenalty = shape.thirds.reduce((sum, zone) => sum + Math.abs(zone - count / 3) * 3, 0);
  const parityPenalty = Math.abs(shape.odd - ideal) * 4;
  const sizePenalty = Math.abs(shape.low - ideal) * 4;
  const birthdayPenalty = max > 31 ? birthdayShare * 10 : 4;
  const collisionPenalty = intersectionSize(numbers, hot) * 4 + intersectionSize(numbers, previous) * 3;
  const patternPenalty = shape.adjacentPairs * 8 + Math.max(0, sameTailPeak(numbers) - 1) * 5;
  return Math.max(0, Math.min(100, Math.round(10 + zonePenalty + parityPenalty + sizePenalty + birthdayPenalty + collisionPenalty + patternPenalty)));
}

function contextTargets(input: NumberAgentInput, max: number): number[] {
  if (input.contextMode === 'balanced') return [];
  const source = input.contextMode === 'calendar'
    ? `${new Date().toISOString().slice(0, 10)}|${input.drawLabel ?? ''}`
    : `${input.contextText ?? ''}|${input.drawLabel ?? ''}`;
  return mappedNumbers(source, max, 5);
}

function buildWeight(targets: number[], inspiration: number[]) {
  const targetSet = new Set(targets);
  const inspirationSet = new Set(inspiration);
  return (number: number) => {
    let weight = 1;
    if (targetSet.has(number)) weight *= 1.1;
    if (inspirationSet.has(number)) weight *= 1.22;
    if (inspirationSet.has(number - 1) || inspirationSet.has(number + 1)) weight *= 1.06;
    return weight;
  };
}

function contextSummary(input: NumberAgentInput): string {
  if (input.contextMode === 'calendar') return '日历模式：仅使用本地日期与期号做 ±10% 权重扰动';
  if (input.contextMode === 'signal') {
    return input.contextText?.trim()
      ? `关键词模式：已映射“${input.contextText.trim().slice(0, 24)}”`
      : '关键词模式：未填写关键词，按中性权重执行';
  }
  return '均衡模式：不加入环境权重';
}

function formatTrace(numbers: number[]): string {
  if (numbers.length === 0) return '未启用灵感映射';
  return `灵感映射 ${numbers.map((number) => String(number).padStart(2, '0')).join(' / ')}`;
}

export function generateAgentRun(input: NumberAgentInput, random: RandomSource = secureRandom): AgentRun {
  const config = LOTTERY_CONFIGS[input.kind];
  const quantity = Math.max(1, Math.min(10, Math.round(input.quantity)));
  const previous = parseNumberList(input.previous, config.frontMax).slice(0, config.frontCount);
  const hot = parseNumberList(input.hot, config.frontMax);
  const contextFront = contextTargets(input, config.frontMax);
  const contextBack = contextTargets(input, config.backMax);
  const inspirationFront = mappedNumbers(input.inspiration ?? '', config.frontMax, 4);
  const inspirationBack = mappedNumbers(input.inspiration ?? '', config.backMax, 2);
  const frontWeight = buildWeight(contextFront, inspirationFront);
  const backWeight = buildWeight(contextBack, inspirationBack);
  const picks: AgentPick[] = [];
  const maxAttempts = quantity * 600;
  let attempted = 0;

  while (picks.length < quantity && attempted < maxAttempts) {
    attempted += 1;
    const front = weightedSample(config.frontMax, config.frontCount, frontWeight, random);
    if (!isStructurallyValid(front, config, previous, hot, picks)) continue;

    const back = weightedSample(config.backMax, config.backCount, backWeight, random);
    const shape = analyzeShape(front, config.frontMax);
    const crowding = crowdingScore(front, config.frontMax, hot, previous);
    if (crowding > 60) continue;

    picks.push({
      id: `${input.kind}-${attempted}-${front.join('-')}-${back.join('-')}`,
      front,
      back,
      shape,
      crowdingScore: crowding,
      reason: `通过结构过滤；三区 ${shape.thirds.join(':')}，跨度 ${shape.span}，仅保留拥挤度不高于 60 的样本。`,
      inspirationTrace: formatTrace(inspirationFront),
    });
  }

  if (picks.length < quantity) {
    throw new Error('在当前约束下没有生成足够样本，请减少热门号或清空上期号码后重试。');
  }

  return {
    config,
    picks,
    attempted,
    rejected: attempted - picks.length,
    contextSummary: contextSummary(input),
    generatedAt: new Date().toISOString(),
  };
}
