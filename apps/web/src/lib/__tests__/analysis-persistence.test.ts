import { beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateAlert,
  loadLevels,
  loadNote,
  saveLevels,
  saveNote,
  type CompositeAlert,
} from '../analysis-persistence';

beforeEach(() => window.localStorage.clear());

describe('analysis persistence', () => {
  it('round-trips notes and valid drawing levels', () => {
    saveNote('600519', '等待放量确认');
    saveLevels('600519', [
      { id: 'a', price: 1420, label: '前高', kind: 'resistance' },
      { id: 'bad', price: -1, label: '无效', kind: 'support' },
    ]);
    expect(loadNote('600519')).toBe('等待放量确认');
    expect(loadLevels('600519')).toEqual([{ id: 'a', price: 1420, label: '前高', kind: 'resistance' }]);
  });

  it('requires every enabled condition to match', () => {
    const alert: CompositeAlert = {
      id: 'alert-1', code: '600519', period: 'daily', name: '放量突破', enabled: true, createdAt: '',
      conditions: [
        { id: 'c1', metric: 'price', operator: 'gt', value: 100 },
        { id: 'c2', metric: 'volumeRatio', operator: 'gt', value: 1.2 },
      ],
    };
    expect(evaluateAlert(alert, { price: 110, volumeRatio: 1.3 })).toBe(true);
    expect(evaluateAlert(alert, { price: 110, volumeRatio: 0.8 })).toBe(false);
    expect(evaluateAlert({ ...alert, enabled: false }, { price: 110, volumeRatio: 1.3 })).toBe(false);
  });
});
