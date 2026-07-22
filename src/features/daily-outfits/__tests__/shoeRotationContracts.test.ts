import { describe, expect, it } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const shoe = (id: string, profile: Record<string, unknown> = {}) => ({
  id,
  shortLabel: id.toUpperCase(),
  slot: 'shoes',
  profile: { available: true, excludedFromDaily: false, ...profile },
});

const snapshot = {
  wardrobeFingerprint: 'rotation-fixture',
  items: ['s1', 's2', 's3', 's4', 's5'].map(id => shoe(id)),
};

const context = evaluateAppsScript<(
  snapshotValue: object,
  localDate: string,
  history: object | object[],
) => {
  availableShoeIds: string[];
  recentShoeIds: string[];
  freshShoeIds: string[];
  allowedGeneratedShoeIds: string[];
  blockedGeneratedShoeIds: string[];
  easyAnchorShoeId: string;
  fallbackUsed: boolean;
  lastRecommendedDateById: Record<string, string>;
}>(['ShoeRotation.gs'], 'shoeRotationContextV2_', { console });

describe('shoe rotation policy', () => {
  it('uses calendar ages one through seven', () => {
    const result = context(snapshot, '2026-07-21', {
      exactOutfitsPrevious14Days: [
        { localDate: '2026-07-21', itemIds: ['s5'] },
        { localDate: '2026-07-20', itemIds: ['s1'] },
        { localDate: '2026-07-14', itemIds: ['s2'] },
        { localDate: '2026-07-13', itemIds: ['s3'] },
      ],
    });
    expect(result.recentShoeIds).toEqual(['s1', 's2']);
    expect(result.freshShoeIds).toEqual(['s3', 's4', 's5']);
    expect(result.allowedGeneratedShoeIds).toEqual(['s3', 's4', 's5']);
  });

  it('counts generated and Encore exposure without feedback overrides', () => {
    const result = context(snapshot, '2026-07-21', [{
      localDate: '2026-07-19',
      recommendations: [{ itemIds: ['s1'] }],
      encore: { itemIds: ['s2'] },
      feedback: [{ value: 'wore' }, { value: 'liked' }],
    }]);
    expect(result.recentShoeIds).toEqual(['s1', 's2']);
  });

  it('admits least-recent shoes only to restore capacity', () => {
    const result = context(snapshot, '2026-07-21', {
      exactOutfitsPrevious14Days: [
        { localDate: '2026-07-20', itemIds: ['s1'] },
        { localDate: '2026-07-15', itemIds: ['s2'] },
        { localDate: '2026-07-16', itemIds: ['s3'] },
        { localDate: '2026-07-17', itemIds: ['s4'] },
      ],
    });
    expect(result.freshShoeIds).toEqual(['s5']);
    expect(result.allowedGeneratedShoeIds).toEqual(['s5', 's2', 's3']);
    expect(result.easyAnchorShoeId).toBe('s5');
    expect(result.fallbackUsed).toBe(true);
  });

  it('uses the oldest tier if all shoes are cooling', () => {
    const result = context(snapshot, '2026-07-21', {
      exactOutfitsPrevious14Days: [
        { localDate: '2026-07-20', itemIds: ['s1'] },
        { localDate: '2026-07-15', itemIds: ['s2'] },
        { localDate: '2026-07-16', itemIds: ['s3'] },
        { localDate: '2026-07-17', itemIds: ['s4'] },
        { localDate: '2026-07-18', itemIds: ['s5'] },
      ],
    });
    expect(result.easyAnchorShoeId).toBe('s2');
    expect(result.allowedGeneratedShoeIds).toEqual(['s2', 's3', 's4']);
  });

  it('keeps shoes available regardless of poor or absent rain safety', () => {
    const result = context({
      wardrobeFingerprint: 'rain-does-not-matter',
      items: [
        shoe('poor-rain', { rainSafety: 'poor' }),
        shoe('no-rain-safety'),
        shoe('unavailable', { available: false }),
        shoe('excluded', { excludedFromDaily: true }),
      ],
    }, '2026-07-21', { exactOutfitsPrevious14Days: [] });

    expect(result.availableShoeIds).toEqual(['no-rain-safety', 'poor-rain']);
  });

  it('is deterministic for identical inputs and rotates anchors across dates', () => {
    const first = context(snapshot, '2026-07-21', { exactOutfitsPrevious14Days: [] });
    const repeated = context(snapshot, '2026-07-21', { exactOutfitsPrevious14Days: [] });
    const anchors = Array.from({ length: 14 }, (_, index) => context(
      snapshot,
      `2026-07-${String(index + 1).padStart(2, '0')}`,
      { exactOutfitsPrevious14Days: [] },
    ).easyAnchorShoeId);

    expect(repeated.easyAnchorShoeId).toBe(first.easyAnchorShoeId);
    expect(new Set(anchors).size).toBeGreaterThan(1);
  });

  it('fails clearly when no shoe is available', () => {
    expect(() => context(
      { wardrobeFingerprint: 'empty', items: [shoe('s1', { available: false })] },
      '2026-07-21',
      { exactOutfitsPrevious14Days: [] },
    )).toThrow('No available daily shoes');
  });
});
