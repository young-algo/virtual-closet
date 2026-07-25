import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const storeScope = (overrides: Record<string, unknown> = {}) => ({
  DAILY_V2: {
    EMAIL_FEEDBACK_FILE: 'virtual-closet-daily-v2-email-feedback.json',
    MAX_EMAIL_FEEDBACK_AGE_DAYS: 30,
    FEEDBACK_VALUES: ['liked', 'disliked', 'wore']
  },
  loadEmailFeedbackV2_: () => [],
  saveEmailFeedbackV2_: vi.fn(),
  shoeRotationCalendarOrdinalV2_: (localDate: string) =>
    Math.floor(Date.UTC(
      Number(localDate.slice(0, 4)),
      Number(localDate.slice(5, 7)) - 1,
      Number(localDate.slice(8, 10))
    ) / 86400000),
  console,
  ...overrides
});

describe('feedback entry validation', () => {
  const valid = evaluateAppsScript<(entry: unknown) => boolean>(
    ['Feedback.gs'], 'validFeedbackEntryV2_', storeScope()
  );

  it('accepts a well-formed entry', () => {
    expect(valid({ localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 1 })).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(valid({ localDate: '2026-07-25', candidateId: 'easy-1', value: 'loved', createdAt: 1 })).toBe(false);
  });

  it('rejects a malformed localDate', () => {
    expect(valid({ localDate: '7/25/2026', candidateId: 'easy-1', value: 'wore', createdAt: 1 })).toBe(false);
  });

  it('rejects a candidateId containing the payload delimiter', () => {
    expect(valid({ localDate: '2026-07-25', candidateId: 'easy|1', value: 'wore', createdAt: 1 })).toBe(false);
  });
});

describe('retention window', () => {
  const within = evaluateAppsScript<(localDate: string, today: string) => boolean>(
    ['Feedback.gs'], 'feedbackDateWithinWindowV2_', storeScope()
  );

  it('accepts today', () => {
    expect(within('2026-07-25', '2026-07-25')).toBe(true);
  });

  it('accepts exactly 30 days old', () => {
    expect(within('2026-06-25', '2026-07-25')).toBe(true);
  });

  it('rejects 31 days old', () => {
    expect(within('2026-06-24', '2026-07-25')).toBe(false);
  });

  it('rejects a future date', () => {
    expect(within('2026-07-26', '2026-07-25')).toBe(false);
  });
});

describe('feedback upsert', () => {
  it('appends a new signal', () => {
    const save = vi.fn();
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({ loadEmailFeedbackV2_: () => [], saveEmailFeedbackV2_: save })
    );
    upsert('2026-07-25', 'easy-1', 'wore', 100);
    expect(save).toHaveBeenCalledWith([
      { localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 100 }
    ]);
  });

  it('replaces the prior signal for the same date and candidate', () => {
    const save = vi.fn();
    const existing = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'liked', createdAt: 50 }];
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({ loadEmailFeedbackV2_: () => existing, saveEmailFeedbackV2_: save })
    );
    upsert('2026-07-25', 'easy-1', 'disliked', 200);
    expect(save).toHaveBeenCalledWith([
      { localDate: '2026-07-25', candidateId: 'easy-1', value: 'disliked', createdAt: 200 }
    ]);
  });

  it('leaves other candidates untouched', () => {
    const save = vi.fn();
    const other = { localDate: '2026-07-25', candidateId: 'expressive-2', value: 'liked', createdAt: 50 };
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({ loadEmailFeedbackV2_: () => [other], saveEmailFeedbackV2_: save })
    );
    upsert('2026-07-25', 'easy-1', 'wore', 200);
    expect(save.mock.calls[0][0]).toHaveLength(2);
    expect(save.mock.calls[0][0]).toContainEqual(other);
  });

  it('throws on a corrupt stored array rather than resetting it', () => {
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({ loadEmailFeedbackV2_: () => ({ nope: true }), saveEmailFeedbackV2_: vi.fn() })
    );
    expect(() => upsert('2026-07-25', 'easy-1', 'wore', 1))
      .toThrow('Corrupt email feedback store');
  });
});
