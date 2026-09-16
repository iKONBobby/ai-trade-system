# A 股选股策略研究与实现路线

更新日期：2026-09-08

## 已落地

| 周期 | 策略 | 核心条件 | 定位 |
|---|---|---|---|
| 短线 | 均线多头、超跌反弹、放量突破 | MA/MACD、RSI/KDJ/布林带、量价突破 | 原有规则 |
| 短线 | 涨停次日观察 | 当前封板为必要条件，叠加量能、换手、日内位置和趋势 | 次日观察池，不是买入指令 |
| 中线 | 趋势回踩 | 多头排列、MA20 附近、RSI 中性、量能不过热 | 趋势中的低位介入候选 |
| 中线 | 中期动量 | 20/60 日收益、接近 52 周高点、低波动、均线趋势 | 数周至数月 |
| 长线 | 长周期趋势（价格型） | MA200、MA200 斜率、52 周高位、波动和最大回撤 | 只有价格维度，不能替代基本面质量 |
| 中线 | VCP 波动收缩 | 长期多头结构、接近年内高位、振幅和成交量同步收缩 | 突破前观察池 |
| 短线 | 箱体放量突破 | 突破前 60 日高点、放量、强势收盘、换手确认 | 突破触发型 |
| 中线 | 低波动动量 | 60 日动量、MA200 趋势、低波动和回撤约束 | 趋势与风险平衡 |
| 中线 | RPS 相对强势 | 20/60 日收益的全市场百分位、均线趋势、年内位置 | 横截面取强舍弱 |

普通策略仍排除涨跌停；只有显式声明 `includeLimitUp` 的涨停观察策略可接收封板股票。主板按 10%、创业板/科创板按 20% 计算理论涨停价。

## 研究结论如何转成规则

### 涨停事件

价格限制可能延迟价格发现，因此涨停后的次日收益存在延续机制；但另一项覆盖 2000–2020 年的研究发现，涨停事件也会造成过度反应并削弱传统中期动量。因此系统不应把“涨停”直接转换为买入信号，而应建立观察池，并在后续版本加入封单金额、开板次数、首次封板时间、板块联动和公告原因。

资料：

- 上海证券交易所交易规则（2026）：https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml
- Price Limit Dominates Daily Momentum Effect in the Chinese Stock Market：https://xbbjb.cufe.edu.cn/EN/Y2025/V0/I1/59
- Price overreaction to up-limit events and revised momentum strategies：https://doi.org/10.1016/j.econmod.2022.105910

### 中期动量与突破

针对中国市场的研究显示，传统简单技术规则在考虑数据挖掘和成本后并不稳定，但交易区间突破规则相对均线规则更有优势；A 股的残差动量、因子动量和 52 周高点动量也有实证支持。工程上应使用多个独立确认项，并把交易成本纳入回测。

资料：

- Profitability of simple technical trading rules of Chinese stock exchange indexes：https://doi.org/10.1016/j.physa.2015.07.032
- Residual momentum and the cross-section of stock returns: Chinese evidence：https://doi.org/10.1016/j.frl.2018.07.009
- Factor momentum in the Chinese stock market：https://doi.org/10.1016/j.jempfin.2023.101458

### 长线质量、价值与低波动

真正的长线策略必须接入财报和估值数据。中证质量类方法使用盈利能力、盈利稳定性与盈利质量；红利成长低波动方法同时要求连续现金分红、盈利增长稳定和低波动。A 股因子模型比较也指出，盈利、估值、规模和动量是值得验证的维度。当前版本只实现价格型长周期趋势，后续接入财务数据后再增加：

- 质量：ROE、毛利率、经营现金流/净利润、杠杆、盈利稳定性。
- 价值：PE/PB/自由现金流收益率，并在行业内做分位排名。
- 成长：营收和利润 3 年复合增长、盈利预期变化。
- 红利低波：连续分红、股息率、60/120 日波动和最大回撤。

资料：

- 中证 1000 质量指数编制方案：https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/indices/detail/files/zh_CN/932434_Index_Methodology_cn.pdf
- 中证红利成长低波动指数编制方案：https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/indices/detail/files/zh_CN/20231208180424-931130_Index_Methodology_cn.pdf
- Factor models for Chinese A-shares：https://doi.org/10.1016/j.irfa.2023.102975

## 验证要求

每条策略都应分别记录入选时点、量化分、AI 分、综合分及未来 1/5/10/20/60 日收益；采用滚动样本外验证，计入佣金、印花税、滑点、涨跌停无法成交和 T+1 约束。策略上线依据应是样本外表现和最大回撤，而不是回测期内最高收益。
