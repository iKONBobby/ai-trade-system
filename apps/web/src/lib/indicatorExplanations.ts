export interface IndicatorExplanation {
  name: string;
  short: string;
  detail: string;
  signals: { label: string; meaning: string; color: 'green' | 'red' | 'yellow' | 'gray' }[];
}

export const explanations: Record<string, IndicatorExplanation> = {
  rsi: {
    name: 'RSI 相对强弱指标',
    short: '衡量价格涨跌力度的动量指标，0-100 之间。',
    detail: 'RSI（Relative Strength Index）通过比较一段时间内上涨和下跌的幅度，判断买卖力量对比。数值越高说明近期涨得多，越低说明近期跌得多。通常使用 14 天周期。RSI 在牛市和熊市中会有不同的"正常范围"——牛市中 RSI 可能长期维持在高位。',
    signals: [
      { label: '> 70 超买', meaning: '短期涨幅过大，可能有回调压力', color: 'red' },
      { label: '30-70 正常', meaning: '买卖力量相对均衡', color: 'gray' },
      { label: '< 30 超卖', meaning: '短期跌幅过大，可能有反弹机会', color: 'green' },
    ],
  },
  macd: {
    name: 'MACD 指数平滑异同移动平均线',
    short: 'A 股最常用的趋势跟踪指标，由 DIF、DEA 和柱状图组成。',
    detail: 'MACD（Moving Average Convergence Divergence）通过比较短期和长期指数移动平均线的关系来判断趋势。DIF 线（快线）上穿 DEA 线（慢线）称为"金叉"，是看涨信号；下穿称为"死叉"，是看跌信号。柱状图的高度反映趋势的强弱——柱子变高说明趋势在加速。',
    signals: [
      { label: '金叉', meaning: 'DIF 上穿 DEA，短期看涨信号', color: 'green' },
      { label: '死叉', meaning: 'DIF 下穿 DEA，短期看跌信号', color: 'red' },
      { label: '多头', meaning: 'DIF 在 DEA 上方，趋势偏多', color: 'green' },
      { label: '空头', meaning: 'DIF 在 DEA 下方，趋势偏空', color: 'red' },
    ],
  },
  kdj: {
    name: 'KDJ 随机指标',
    short: '衡量价格在近期高低点范围内的相对位置，短线交易常用。',
    detail: 'KDJ 由 K 线（快线）、D 线（慢线）和 J 线（敏感线）组成。K、D 在 0-100 之间波动，J 线可以超过 100 或低于 0。J 线最敏感，经常最先给出信号。KDJ 在震荡市中比较有效，但在强趋势中容易钝化（一直在超买或超卖区不动）。',
    signals: [
      { label: 'K > 80 超买', meaning: '价格处于近期高位，短线有回调风险', color: 'red' },
      { label: 'K < 20 超卖', meaning: '价格处于近期低位，短线有反弹机会', color: 'green' },
      { label: 'J > 100', meaning: '极度超买，短期内回调概率较大', color: 'red' },
      { label: 'J < 0', meaning: '极度超卖，短期内反弹概率较大', color: 'green' },
    ],
  },
  wr: {
    name: 'WR 威廉指标',
    short: '衡量收盘价在近期高低点范围内的位置，与 KDJ 互补使用。',
    detail: '威廉指标（Williams %R）的数值在 -100 到 0 之间。越接近 0 说明价格越接近近期最高点，越接近 -100 说明越接近近期最低点。WR 和 KDJ 都是摆动指标，但 WR 的方向是反的——WR 向下是超卖，向上是超买。',
    signals: [
      { label: '> -20 超买', meaning: '价格接近近期高点，短期有回调压力', color: 'red' },
      { label: '-80 ~ -20', meaning: '价格在正常范围内波动', color: 'gray' },
      { label: '< -80 超卖', meaning: '价格接近近期低点，短期有反弹机会', color: 'green' },
    ],
  },
  atr: {
    name: 'ATR 平均真实波幅',
    short: '衡量价格波动幅度的指标，不判断方向，只衡量波动大小。',
    detail: 'ATR（Average True Range）计算一段时间内每天价格波动范围的平均值。ATR 越大说明波动越剧烈，越小说明越平静。在网格交易中，ATR 用来确定网格的间距。做 T+0 交易时，ATR 越大越有机会。',
    signals: [
      { label: 'ATR 高', meaning: '波动大，做 T 有机会，但风险也大', color: 'yellow' },
      { label: 'ATR 低', meaning: '波动小，适合网格但不适合做 T', color: 'gray' },
    ],
  },
  bollinger: {
    name: '布林带',
    short: '由中轨（均线）和上下轨（标准差）组成的波动区间。',
    detail: '布林带由三条线组成：中轨是 20 日均线，上轨和下轨是中轨加减 2 倍标准差。价格大部分时间在上下轨之间运行。带宽收窄意味着变盘在即——波动率压缩到极致后通常会爆发。价格触及上轨不一定是卖出信号（可能是强势突破），触及下轨不一定是买入信号（可能是弱势下跌）。',
    signals: [
      { label: '带宽收窄', meaning: '波动率在压缩，变盘临近', color: 'yellow' },
      { label: '带宽扩张', meaning: '波动在加大，趋势在加速', color: 'red' },
      { label: '价格 > 上轨', meaning: '短期强势，但如果不能持续则可能回调', color: 'yellow' },
      { label: '价格 < 下轨', meaning: '短期弱势，但如果企稳则可能反弹', color: 'yellow' },
    ],
  },
  ma: {
    name: '均线系统',
    short: 'MA5/MA20/MA60 分别代表短期、中期、长期平均成本。',
    detail: '均线是过去 N 天收盘价的平均值。MA5（5 日均线）反映短线趋势，MA20（20 日均线）反映中线趋势，MA60（60 日均线）反映长线趋势。多头排列（MA5 > MA20 > MA60）说明三条均线都在向上，是强势上涨的信号。空头排列则相反。',
    signals: [
      { label: '多头排列', meaning: 'MA5 > MA20 > MA60，上升趋势确认', color: 'green' },
      { label: '空头排列', meaning: 'MA5 < MA20 < MA60，下降趋势确认', color: 'red' },
      { label: '交叉缠绕', meaning: '均线互相穿插，方向不明确', color: 'yellow' },
    ],
  },
  volumeRatio: {
    name: '量比',
    short: '当前成交量与 5 天同期平均成交量的比值。',
    detail: '量比 > 1 说明今天放量，< 1 说明缩量。量价配合是技术分析的核心法则：放量上涨是真涨（资金在进），缩量上涨可能是假突破（没有资金跟进）。放量下跌要警惕，缩量下跌可能是洗盘。',
    signals: [
      { label: '> 1.5 放量', meaning: '成交量明显放大，趋势强度有资金支持', color: 'green' },
      { label: '0.5-1.5 正常', meaning: '成交量在正常范围', color: 'gray' },
      { label: '< 0.5 缩量', meaning: '成交量明显萎缩，市场关注度低', color: 'yellow' },
    ],
  },
  amplitude: {
    name: '振幅',
    short: '当日最高价与最低价的波动幅度。',
    detail: '振幅 = (最高价 - 最低价) / 前收盘价。振幅越大，日内交易机会越多，尤其在做 T+0 时。一般振幅 < 2% 的股票不太适合做 T，> 5% 的股票做 T 机会多但风险也高。',
    signals: [
      { label: '> 5% 高振幅', meaning: '日内波动剧烈，做 T 机会多但风险高', color: 'red' },
      { label: '2%-5% 适中', meaning: '适合做 T 和短线操作', color: 'green' },
      { label: '< 2% 低振幅', meaning: '波动小，不适合做 T', color: 'gray' },
    ],
  },
  limitDistance: {
    name: '涨跌停距离',
    short: '当前价格距离涨停板和跌停板的百分比。',
    detail: 'A 股有 10%（部分板块 20%）的涨跌停限制。距离涨停越近，追高风险越大——买在涨停板附近，一旦开板可能当天就亏 10%。距离跌停越近，抄底风险也越大——跌停板上还有跌停。',
    signals: [
      { label: '< 2% 到涨停', meaning: '接近涨停，追高风险极大', color: 'red' },
      { label: '2%-5% 适中', meaning: '距离涨跌停都有空间', color: 'gray' },
      { label: '< 2% 到跌停', meaning: '接近跌停，不要盲目抄底', color: 'red' },
    ],
  },
  turnover: {
    name: '换手率',
    short: '当日成交量占流通股本的比例。',
    detail: '换手率反映股票的活跃程度。换手率越高说明市场参与度越高，流动性越好。但过高的换手率也可能意味着短线资金过多，筹码不稳定。一般来说，大盘股 1-3% 正常，小盘股 3-8% 正常。',
    signals: [
      { label: '> 10% 极高', meaning: '交易异常活跃，可能有资金进出', color: 'yellow' },
      { label: '3%-10% 活跃', meaning: '正常的活跃水平，流动性好', color: 'green' },
      { label: '< 1% 冷清', meaning: '市场关注度低，流动性差', color: 'gray' },
    ],
  },
  supportResistance: {
    name: '支撑位与阻力位',
    short: '近期价格区间的下沿和上沿，是买卖力量博弈的关键位置。',
    detail: '支撑位是近期价格下跌时遇到的"地板"——之前在这里有买盘把价格托住。阻力位是近期价格上涨时遇到的"天花板"——之前在这里有卖盘把价格压住。价格跌破支撑位说明空方占优，突破阻力位说明多方占优。条件单的买入触发价通常设在支撑位附近，卖出触发价设在阻力位附近。',
    signals: [
      { label: '突破阻力位', meaning: '价格向上突破近期高点，看涨信号', color: 'green' },
      { label: '跌破支撑位', meaning: '价格向下突破近期低点，看跌信号', color: 'red' },
      { label: '区间震荡', meaning: '价格在支撑和阻力之间运行', color: 'gray' },
    ],
  },
};
