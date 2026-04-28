import type { MarketData, AnalysisResult } from '@trade/shared';

/**
 * Call Anthropic API to optimize trading analysis.
 * On any failure (no API key, network error, parse error),
 * gracefully returns the original analysis unchanged.
 */
export async function optimize(
  market: MarketData,
  analysis: AnalysisResult,
): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return analysis;
  }

  const prompt = buildPrompt(market, analysis);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`AI optimizer API error: ${res.status}`);
      return analysis;
    }

    const json = await res.json();
    const content = json.content?.[0]?.text;

    if (!content) {
      return analysis;
    }

    return parseResponse(content, analysis);
  } catch (err) {
    console.warn('AI optimizer failed, using original analysis:', err);
    return analysis;
  }
}

function buildPrompt(market: MarketData, analysis: AnalysisResult): string {
  return `You are a quantitative trading analyst. Analyze the following market data and technical indicators, then provide optimization suggestions.

## Market Data
- Code: ${market.code}
- Name: ${market.name}
- Price: ${market.price}
- Change: ${market.change}
- Volume: ${market.volume}
- Turnover: ${market.turnover}
- High: ${market.high}
- Low: ${market.low}
- Open: ${market.open}
- PreClose: ${market.preClose}

## Current Analysis
- Market State: ${analysis.marketState}
- Bollinger Upper: ${analysis.bollinger.upper.toFixed(2)}
- Bollinger Middle: ${analysis.bollinger.middle.toFixed(2)}
- Bollinger Lower: ${analysis.bollinger.lower.toFixed(2)}
- Bollinger Width: ${analysis.bollinger.width.toFixed(4)}
- ATR: ${analysis.atr.toFixed(2)}
- MA5: ${analysis.ma.ma5.toFixed(2)}
- MA20: ${analysis.ma.ma20.toFixed(2)}
- MA60: ${analysis.ma.ma60.toFixed(2)}
- Support: ${analysis.support.toFixed(2)}
- Resistance: ${analysis.resistance.toFixed(2)}
- Recommendation: ${analysis.recommendation}
- Confidence: ${analysis.confidence}

Review the analysis and return ONLY a JSON object with adjustments. Example:
{
  "recommendation": "grid",
  "confidence": 75,
  "marketState": "ranging",
  "gridParams": { "stepPercent": 0.5, "gridCount": 5 },
  "conditionParams": null
}

Keep the same structure as the original AnalysisResult. Only change values you disagree with. Return valid JSON only.`;
}

function parseResponse(content: string, original: AnalysisResult): AnalysisResult {
  // Extract JSON from response (handle potential markdown code blocks)
  const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  return {
    ...original,
    marketState: parsed.marketState ?? original.marketState,
    recommendation: parsed.recommendation ?? original.recommendation,
    confidence: parsed.confidence ?? original.confidence,
    gridParams: parsed.gridParams
      ? { ...original.gridParams, ...parsed.gridParams }
      : original.gridParams,
    conditionParams: parsed.conditionParams
      ? { ...original.conditionParams, ...parsed.conditionParams }
      : original.conditionParams,
  };
}
