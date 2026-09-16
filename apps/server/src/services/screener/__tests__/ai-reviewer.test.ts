import { describe, expect, it } from 'vitest';
import { parseAIReviews } from '../ai-reviewer.js';

describe('parseAIReviews', () => {
  it('parses fenced structured candidate reviews', () => {
    const parsed = parseAIReviews('```json\n{"reviews":[{"code":"600519","score":82,"confidence":74,"thesis":"趋势与量价匹配","risks":["次日高开回落"]}]}\n```');
    expect(parsed).toEqual([
      {
        code: '600519',
        score: 82,
        confidence: 74,
        thesis: '趋势与量价匹配',
        risks: ['次日高开回落'],
      },
    ]);
  });

  it('rejects scores outside the supported range', () => {
    expect(parseAIReviews('{"reviews":[{"code":"600519","score":120,"confidence":74,"thesis":"x","risks":[]}]}')).toBeNull();
  });
});
