import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const storeScope = (overrides: Record<string, unknown> = {}) => ({
  DAILY_V2: {
    EMAIL_FEEDBACK_FILE: 'virtual-closet-daily-v2-email-feedback.json',
    MAX_EMAIL_FEEDBACK_AGE_DAYS: 30,
    FEEDBACK_VALUES: ['wore', 'disliked', 'liked'],
    FEEDBACK_CONTENTION_MS: 10000
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
      storeScope({ loadEmailFeedbackV2_: () => existing, saveEmailFeedbackV2_: save, console: { warn: vi.fn() } })
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

  it('warns on contending writes: different value within the contention window', () => {
    const save = vi.fn();
    const warn = vi.fn();
    const existing = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'liked', createdAt: 1000 }];
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({
        loadEmailFeedbackV2_: () => existing,
        saveEmailFeedbackV2_: save,
        console: { warn: warn, log: vi.fn() }
      })
    );
    upsert('2026-07-25', 'easy-1', 'disliked', 9000);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain('2026-07-25');
    expect(message).toContain('easy-1');
    expect(message).toContain('liked');
    expect(message).toContain('disliked');
    expect(save).toHaveBeenCalledWith([
      { localDate: '2026-07-25', candidateId: 'easy-1', value: 'disliked', createdAt: 9000 }
    ]);
  });

  it('does not warn when the same verb is rewritten within the contention window', () => {
    const save = vi.fn();
    const warn = vi.fn();
    const existing = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'liked', createdAt: 1000 }];
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({
        loadEmailFeedbackV2_: () => existing,
        saveEmailFeedbackV2_: save,
        console: { warn: warn, log: vi.fn() }
      })
    );
    upsert('2026-07-25', 'easy-1', 'liked', 9000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when a different verb arrives outside the contention window', () => {
    const save = vi.fn();
    const warn = vi.fn();
    const existing = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'liked', createdAt: 1000 }];
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({
        loadEmailFeedbackV2_: () => existing,
        saveEmailFeedbackV2_: save,
        console: { warn: warn, log: vi.fn() }
      })
    );
    upsert('2026-07-25', 'easy-1', 'disliked', 11001);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns at exactly the contention window boundary (10000ms)', () => {
    const save = vi.fn();
    const warn = vi.fn();
    const existing = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'liked', createdAt: 1000 }];
    const upsert = evaluateAppsScript<(d: string, c: string, v: string, t: number) => void>(
      ['Feedback.gs'], 'upsertEmailFeedbackV2_',
      storeScope({
        loadEmailFeedbackV2_: () => existing,
        saveEmailFeedbackV2_: save,
        console: { warn: warn, log: vi.fn() }
      })
    );
    upsert('2026-07-25', 'easy-1', 'disliked', 11000);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

import { createHmac } from 'node:crypto';

const toSignedBytes = (buf: Buffer): number[] =>
  Array.from(buf).map(b => (b > 127 ? b - 256 : b));
const fromSignedBytes = (bytes: number[]): Buffer =>
  Buffer.from(Uint8Array.from(bytes.map(b => (b < 0 ? b + 256 : b))));

const appsUtilities = {
  computeHmacSha256Signature: (value: string, key: string) =>
    toSignedBytes(createHmac('sha256', key).update(value, 'utf8').digest()),
  base64EncodeWebSafe: (input: string | number[]) =>
    (typeof input === 'string' ? Buffer.from(input, 'utf8') : fromSignedBytes(input))
      .toString('base64url'),
  base64DecodeWebSafe: (input: string) => toSignedBytes(Buffer.from(input, 'base64url')),
  newBlob: (bytes: number[]) => ({
    getDataAsString: () => fromSignedBytes(bytes).toString('utf8')
  })
};

const tokenScope = (overrides: Record<string, unknown> = {}) => ({
  ...storeScope(),
  Utilities: appsUtilities,
  getRequiredPropertyV2_: (name: string) =>
    name === 'FEEDBACK_SECRET' ? 'secret-key-0123456789' : 'https://script.google.com/macros/s/AAA/exec',
  ...overrides
});

describe('feedback token', () => {
  const sign = () => evaluateAppsScript<(d: string, c: string, v: string, t: boolean) => { fb: string; s: string }>(
    ['Feedback.gs'], 'signFeedbackTokenV2_', tokenScope()
  );
  const verify = () => evaluateAppsScript<(p: Record<string, string>, today: string) => {
    localDate: string; candidateId: string; value: string; testMode: boolean;
  }>(['Feedback.gs'], 'verifyFeedbackTokenV2_', tokenScope());

  it('round-trips a signed token', () => {
    const token = sign()('2026-07-25', 'easy-1', 'wore', false);
    expect(verify()(token, '2026-07-25')).toEqual({
      localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', testMode: false
    });
  });

  it('preserves the test-mode flag', () => {
    const token = sign()('2026-07-25', 'easy-1', 'liked', true);
    expect(verify()(token, '2026-07-25').testMode).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const token = sign()('2026-07-25', 'easy-1', 'wore', false);
    const forged = Buffer.from('v1|2026-07-25|easy-1|liked|0', 'utf8').toString('base64url');
    expect(() => verify()({ fb: forged, s: token.s }, '2026-07-25')).toThrow();
  });

  it('rejects a tampered signature', () => {
    const token = sign()('2026-07-25', 'easy-1', 'wore', false);
    expect(() => verify()({ fb: token.fb, s: token.s.slice(0, -2) + 'AA' }, '2026-07-25')).toThrow();
  });

  it('rejects a truncated token', () => {
    const token = sign()('2026-07-25', 'easy-1', 'wore', false);
    expect(() => verify()({ fb: token.fb.slice(0, 8), s: token.s }, '2026-07-25')).toThrow();
  });

  it('rejects missing parameters', () => {
    expect(() => verify()({}, '2026-07-25')).toThrow();
  });

  it('rejects a date outside the retention window', () => {
    const token = sign()('2026-06-01', 'easy-1', 'wore', false);
    expect(() => verify()(token, '2026-07-25')).toThrow();
  });

  it('rejects an unknown verb even when correctly signed', () => {
    const scope = tokenScope();
    const build = evaluateAppsScript<(p: string) => string>(
      ['Feedback.gs'], '(function(p){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(p, getRequiredPropertyV2_("FEEDBACK_SECRET")));})',
      scope
    );
    const payload = 'v1|2026-07-25|easy-1|loved|0';
    const fb = Buffer.from(payload, 'utf8').toString('base64url');
    expect(() => verify()({ fb, s: build(payload) }, '2026-07-25')).toThrow();
  });

  it('builds an absolute link from WEB_APP_URL', () => {
    const url = evaluateAppsScript<(d: string, c: string, v: string, t: boolean) => string>(
      ['Feedback.gs'], 'feedbackLinkUrlV2_', tokenScope()
    )('2026-07-25', 'easy-1', 'wore', false);
    expect(url).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/AAA\/exec\?fb=[\w-]+&s=[\w-]+$/);
  });

  it('refuses to sign a candidateId containing the delimiter', () => {
    expect(() => sign()('2026-07-25', 'easy|1', 'wore', false)).toThrow();
  });
});

describe('feedback drain', () => {
  // The drain mutates history entries in place, adding `feedback`. Without this
  // annotation the array literals infer a type that lacks the property, so the
  // post-drain assertions fail `tsc -b` while still passing under Vitest.
  type DrainHistoryEntry = {
    localDate: string;
    recommendations: Array<{ candidateId: string; itemIds: string[] }>;
    feedback?: Array<{ localDate: string; candidateId: string; value: string; createdAt: number }>;
  };

  const drainScope = (history: unknown[], stored: unknown[], saves: Record<string, ReturnType<typeof vi.fn>>) => ({
    ...storeScope(),
    getDailyConfigV2_: () => ({ timezone: 'America/New_York' }),
    localDateV2_: () => '2026-07-25',
    loadHistoryV2_: () => history,
    saveHistoryV2_: saves.history,
    loadEmailFeedbackV2_: () => stored,
    saveEmailFeedbackV2_: saves.store
  });

  it('merges a signal into its history entry and drains it', () => {
    const history: DrainHistoryEntry[] = [{ localDate: '2026-07-25', recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }] }];
    const saves = { history: vi.fn(), store: vi.fn() };
    const stored = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 10 }];
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope(history, stored, saves)
    );
    expect(drain()).toBe(true);
    expect(history[0].feedback).toEqual([
      { localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 10 }
    ]);
    expect(saves.history).toHaveBeenCalledOnce();
    expect(saves.store).toHaveBeenCalledWith([]);
  });

  it('retains a signal whose history entry does not exist yet', () => {
    const saves = { history: vi.fn(), store: vi.fn() };
    const stored = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 10 }];
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope([], stored, saves)
    );
    expect(drain()).toBe(false);
    expect(saves.history).not.toHaveBeenCalled();
    expect(saves.store).not.toHaveBeenCalled();
  });

  it('replaces a prior signal for the same candidate', () => {
    const history = [{
      localDate: '2026-07-25',
      recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }],
      feedback: [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'liked', createdAt: 1 }]
    }];
    const saves = { history: vi.fn(), store: vi.fn() };
    const stored = [{ localDate: '2026-07-25', candidateId: 'easy-1', value: 'disliked', createdAt: 20 }];
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope(history, stored, saves)
    );
    expect(drain()).toBe(true);
    expect(history[0].feedback).toEqual([
      { localDate: '2026-07-25', candidateId: 'easy-1', value: 'disliked', createdAt: 20 }
    ]);
  });

  it('is a no-op when the stored signal already matches history', () => {
    const signal = { localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 10 };
    const history = [{
      localDate: '2026-07-25',
      recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }],
      feedback: [signal]
    }];
    const saves = { history: vi.fn(), store: vi.fn() };
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope(history, [signal], saves)
    );
    expect(drain()).toBe(false);
    expect(saves.history).not.toHaveBeenCalled();
    expect(saves.store).toHaveBeenCalledWith([]);
  });

  it('drops a signal whose candidate is absent from that date, without stalling the queue', () => {
    const history: DrainHistoryEntry[] = [{ localDate: '2026-07-25', recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }] }];
    const saves = { history: vi.fn(), store: vi.fn() };
    const stored = [{ localDate: '2026-07-25', candidateId: 'ghost-9', value: 'wore', createdAt: 10 }];
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope(history, stored, saves)
    );
    expect(drain()).toBe(false);
    expect(saves.store).toHaveBeenCalledWith([]);
  });

  it('prunes a signal whose localDate has aged out of the retention window, without writing history', () => {
    const saves = { history: vi.fn(), store: vi.fn() };
    const stored = [{ localDate: '2026-06-01', candidateId: 'easy-1', value: 'wore', createdAt: 10 }];
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope([], stored, saves)
    );
    expect(drain()).toBe(false);
    expect(saves.history).not.toHaveBeenCalled();
    expect(saves.store).toHaveBeenCalledWith([]);
  });

  it('queues exactly the pending signal and drains the other from a mixed store', () => {
    const history: DrainHistoryEntry[] = [{ localDate: '2026-07-25', recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }] }];
    const saves = { history: vi.fn(), store: vi.fn() };
    const drainable = { localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: 10 };
    const queuedSignal = { localDate: '2026-07-24', candidateId: 'easy-2', value: 'liked', createdAt: 5 };
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_',
      drainScope(history, [drainable, queuedSignal], saves)
    );
    expect(drain()).toBe(true);
    expect(history[0].feedback).toEqual([drainable]);
    expect(saves.history).toHaveBeenCalledOnce();
    expect(saves.store).toHaveBeenCalledWith([queuedSignal]);
  });
});

describe('feedbackLookNameV2_', () => {
  it('warns rather than failing silently when history cannot be read', () => {
    // The signal is already written by the time this resolves a display name, so nothing
    // is lost by falling back to null — but a persistent Drive fault would otherwise present
    // as "names never resolve" with zero trace to diagnose it by.
    const warn = vi.fn();
    const lookName = evaluateAppsScript<(localDate: string, candidateId: string) => string | null>(
      ['Taste.gs', 'FeedbackPage.gs'], 'feedbackLookNameV2_',
      {
        loadHistoryV2_: () => { throw new Error('Drive unavailable'); },
        console: { warn }
      }
    );
    expect(lookName('2026-07-25', 'easy-1')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain('feedbackLookNameV2_');
    expect(message).toContain('Drive unavailable');
  });
});

describe('doGet feedback handler', () => {
  const pageScope = (overrides: Record<string, unknown> = {}) => ({
    ...tokenScope(),
    HtmlService: { createHtmlOutput: (html: string) => ({ html }) },
    escapeHtmlV2_: (value: string) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    localDateV2_: () => '2026-07-25',
    getDailyConfigV2_: () => ({ timezone: 'America/New_York' }),
    loadHistoryV2_: () => [{
      localDate: '2026-07-25',
      recommendations: [{ candidateId: 'easy-1', name: 'Quiet Morning Ease', itemIds: ['a'] }]
    }],
    upsertEmailFeedbackV2_: vi.fn(),
    ...overrides
  });

  const runGet = (scope: Record<string, unknown>, parameter: Record<string, string>) =>
    evaluateAppsScript<(e: unknown) => { html: string }>(
      ['Taste.gs', 'Feedback.gs', 'FeedbackPage.gs'], 'doGet', scope
    )({ parameter });

  const signWith = (scope: Record<string, unknown>) =>
    evaluateAppsScript<(d: string, c: string, v: string, t: boolean) => { fb: string; s: string }>(
      ['Feedback.gs'], 'signFeedbackTokenV2_', scope
    );

  it('records the signal and confirms it by name', () => {
    // Spies on saveEmailFeedbackV2_ (the primitive upsertEmailFeedbackV2_ actually calls)
    // rather than overriding upsertEmailFeedbackV2_ itself: Feedback.gs declares a real
    // top-level upsertEmailFeedbackV2_ function, and once Feedback.gs is concatenated into
    // the same evaluated source as FeedbackPage.gs, that declaration is hoisted and silently
    // overwrites any scope-injected parameter of the same name (standard JS function-
    // declaration-shadows-parameter semantics) — so a mock passed as upsertEmailFeedbackV2_
    // is never actually invoked.
    const scope = pageScope();
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    const result = runGet(scope, token);
    expect(scope.saveEmailFeedbackV2_).toHaveBeenCalledWith([
      { localDate: '2026-07-25', candidateId: 'easy-1', value: 'wore', createdAt: expect.any(Number) }
    ]);
    expect(result.html).toContain('Recorded');
    expect(result.html).toContain('wore this');
    expect(result.html).toContain('Quiet Morning Ease');
  });

  it('offers the other two verbs as corrections', () => {
    const scope = pageScope();
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    const html = runGet(scope, token).html;
    expect(html).toContain('LIKE');
    expect(html).toContain('NOT FOR ME');
    expect(html).not.toContain('WORE THIS');
    expect(html.match(/href="https:/g)).toHaveLength(2);
  });

  it('records nothing for a test-mode token', () => {
    const scope = pageScope();
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', true);
    const html = runGet(scope, token).html;
    expect(scope.saveEmailFeedbackV2_).not.toHaveBeenCalled();
    expect(html).toContain('Test delivery');
    expect(html).not.toContain('href="https:');
  });

  it('falls back to the date when the history entry does not exist yet', () => {
    const scope = pageScope({ loadHistoryV2_: () => [] });
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    const html = runGet(scope, token).html;
    expect(scope.saveEmailFeedbackV2_).toHaveBeenCalledOnce();
    expect(html).toContain('Recorded');
    expect(html).toContain('2026-07-25');
  });

  it('renders one generic page for a tampered signature', () => {
    const scope = pageScope();
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    const html = runGet(scope, { fb: token.fb, s: 'AAAA' }).html;
    expect(html).toContain("isn't valid");
    expect(html).not.toContain('easy-1');
  });

  it('renders the identical page for an out-of-window date', () => {
    const scope = pageScope();
    const stale = signWith(scope)('2026-01-01', 'easy-1', 'wore', false);
    const bad = runGet(scope, { fb: stale.fb, s: 'AAAA' }).html;
    const staleHtml = runGet(scope, stale).html;
    expect(staleHtml).toBe(bad);
  });

  it('renders the generic page when no parameters are supplied', () => {
    expect(runGet(pageScope(), {}).html).toContain("isn't valid");
  });

  it('does not write when the store throws', () => {
    const scope = pageScope({
      loadEmailFeedbackV2_: () => { throw new Error('Corrupt email feedback store'); }
    });
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    expect(runGet(scope, token).html).toContain("isn't valid");
  });
});

describe('feedback vocabulary parity', () => {
  it('keeps the email label verbs in sync with DAILY_V2.FEEDBACK_VALUES, in order', () => {
    const feedbackValues = evaluateAppsScript<string[]>(['Config.gs'], 'DAILY_V2.FEEDBACK_VALUES');
    const emailVerbs = evaluateAppsScript<[string, string][]>(['Email.gs'], 'FEEDBACK_EMAIL_LABELS_V2')
      .map(pair => pair[0]);
    expect(emailVerbs).toEqual(feedbackValues);
  });

  // A link scanner fetching the three links in document order records all three,
  // and last-write-wins means the final link decides the stored rating. 'wore' is
  // the costliest verb to record falsely: it inflates itemFeedbackSignals AND
  // exempts its items from cooldown via wornItemIds, telling the planner an outfit
  // was worn when it was not. 'liked' only touches itemFeedbackSignals.
  it('orders the verbs so a sequential prefetch lands on the cheapest one', () => {
    const emailVerbs = evaluateAppsScript<[string, string][]>(['Email.gs'], 'FEEDBACK_EMAIL_LABELS_V2')
      .map(pair => pair[0]);
    expect(emailVerbs[emailVerbs.length - 1]).toBe('liked');
    expect(emailVerbs.indexOf('wore')).toBeLessThan(emailVerbs.length - 1);
  });
});

describe('email feedback rendering', () => {
  // No escapeHtmlV2_ override: Email.gs declares it, and a function declaration
  // in the concatenated source shadows any same-named injected parameter.
  const emailScope = () => tokenScope();

  it('renders three links per look', () => {
    const html = evaluateAppsScript<(d: string, c: string, t: boolean) => string>(
      ['Email.gs', 'Feedback.gs'], 'feedbackRowHtmlV2_', emailScope()
    )('2026-07-25', 'easy-1', false);
    expect(html.match(/<a href="https:/g)).toHaveLength(3);
    expect(html).toContain('LIKE');
    expect(html).toContain('NOT FOR ME');
    expect(html).toContain('WORE THIS');
  });

  it('gives each link a tappable target', () => {
    const html = evaluateAppsScript<(d: string, c: string, t: boolean) => string>(
      ['Email.gs', 'Feedback.gs'], 'feedbackRowHtmlV2_', emailScope()
    )('2026-07-25', 'easy-1', false);
    expect(html.match(/display:inline-block;padding:14px 0/g)).toHaveLength(3);
  });

  it('renders three labelled plain-text links', () => {
    const lines = evaluateAppsScript<(d: string, c: string, t: boolean) => string[]>(
      ['Email.gs', 'Feedback.gs'], 'feedbackPlainLinesV2_', emailScope()
    )('2026-07-25', 'easy-1', false);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Rate this look:');
    expect(lines.slice(1).every(line => line.includes('https://'))).toBe(true);
  });

  it('marks test-delivery links so the landing page records nothing', () => {
    const live = evaluateAppsScript<(d: string, c: string, t: boolean) => string>(
      ['Email.gs', 'Feedback.gs'], 'feedbackRowHtmlV2_', emailScope()
    );
    expect(live('2026-07-25', 'easy-1', true)).not.toBe(live('2026-07-25', 'easy-1', false));
  });
});

describe('email feedback rendering — full-email integration', () => {
  // Exercises feedbackRowHtmlV2_ / feedbackPlainLinesV2_ through the real
  // renderDailyEmailV2_ assembly, not as isolated units, so a mutation that moves the
  // feedback row into the Encore section (or drops the plain-text call) is actually caught.
  const render = evaluateAppsScript<(
    bundle: Record<string, unknown>,
    snapshotValue: object,
    testMode: boolean,
    pending: object,
    expectedLocalDate: string,
  ) => { html: string; plain: string; inlineImages: Record<string, unknown> }>(
    ['ItemIndex.gs', 'Email.gs'],
    'renderDailyEmailV2_',
    {
      Utilities: {
        newBlob: (_bytes: unknown, mime: string, name: string) => ({ mime, name }),
        base64Decode: () => [],
        formatDate: () => 'Saturday, July 25',
      },
      getDailyConfigV2_: () => ({ appUrl: '' }),
      validFullBundleReadyV2_: () => true,
      feedbackLinkUrlV2_: (localDate: string, candidateId: string, value: string, testMode: boolean) =>
        `https://example.com/feedback?fb=${localDate}-${candidateId}-${value}-${testMode ? 't' : 'l'}`,
      console,
    },
  );

  const items = [
    { id: 'top', slot: 'top', name: 'Tee', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
    { id: 'bottom', slot: 'bottom', name: 'Jeans', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
    { id: 'shoe', slot: 'shoes', name: 'Boots', thumbnailDataUrl: 'data:image/jpeg;base64,QQ==' },
  ];

  const weatherForEmail = {
    locationLabel: 'Brooklyn, NY',
    timezone: 'America/New_York',
    morningFeelsLikeF: 70,
    highTemperatureF: 82,
    maxRainProbability: 0,
    plainEnglishSummary: 'Light pieces.',
    weatherPhrase: 'clear skies',
    windy: false,
  };

  const recommendation = (archetype: 'easy' | 'polished-casual' | 'expressive', index: number) => ({
    candidateId: `look-${index}`,
    archetype,
    name: `Look ${index + 1}`,
    itemIds: ['top', 'bottom', 'shoe'],
    colorHook: 'Navy against cream.',
    whyItWorks: 'The proportions and colors work together.',
    weatherNote: 'Comfortable for the forecast.',
  });

  const bundle = {
    localDate: '2026-07-25',
    weather: weatherForEmail,
    coverage: { deliveryMode: 'complete', selectedArchetypes: ['easy', 'polished-casual', 'expressive'], omittedArchetypes: [] },
    recommendations: [
      recommendation('easy', 0),
      recommendation('polished-casual', 1),
      recommendation('expressive', 2),
    ],
    encore: {
      outfitId: 'saved-1',
      candidateId: 'encore:saved-1',
      name: 'Saved One',
      itemIds: ['top', 'bottom', 'shoe'],
    },
  };

  it('emits exactly 3x3 feedback links across three looks in HTML, none inside the Encore section', () => {
    const rendered = render(bundle, { items }, false, { bundle }, '2026-07-25');

    expect(rendered.html.match(/<a href="https:/g)).toHaveLength(9);

    const encoreHeadingIndex = rendered.html.indexOf('ENCORE — FROM YOUR SAVED OUTFITS');
    expect(encoreHeadingIndex).toBeGreaterThan(-1);
    const encoreSectionHtml = rendered.html.slice(rendered.html.lastIndexOf('<section', encoreHeadingIndex));
    expect(encoreSectionHtml.match(/<a href="https:/g)).toBeNull();

    // The Encore section still renders normally — heading and items are present,
    // only the feedback links were excluded.
    expect(encoreSectionHtml).toContain('Saved One');
    expect(encoreSectionHtml).toContain('TOP — Tee');
  });

  it('emits exactly 3x3 feedback lines across three looks in plain text, none after the Encore heading', () => {
    const rendered = render(bundle, { items }, false, { bundle }, '2026-07-25');

    const encoreHeadingIndex = rendered.plain.indexOf('ENCORE — FROM YOUR SAVED OUTFITS');
    expect(encoreHeadingIndex).toBeGreaterThan(-1);

    const beforeEncore = rendered.plain.slice(0, encoreHeadingIndex);
    const fromEncoreOn = rendered.plain.slice(encoreHeadingIndex);

    expect(beforeEncore.match(/Rate this look:/g)).toHaveLength(3);
    expect(beforeEncore.match(/https:\/\//g)).toHaveLength(9);
    expect(fromEncoreOn.match(/https:\/\//g)).toBeNull();

    // The Encore section still renders normally in plain text too.
    expect(fromEncoreOn).toContain('Saved One');
    expect(fromEncoreOn).toContain('TOP — Tee');
  });
});

describe('feedback drain reaches dailyHistoryContextV2_ (the seam)', () => {
  // This is the spec's decisive test ("Testing" section, last bullet): a `wore` tap
  // must reach dailyHistoryContextV2_ as an itemFeedbackSignals entry and exempt those
  // items from cooldownItemIds. The drain tests above stop at saveHistoryV2_, and
  // historyContracts.test.ts drives dailyHistoryContextV2_ against hand-written history
  // fixtures the drain never produced. Each half is tested; the seam between them is not
  // — which is exactly how this feature was silently dead before this branch.
  //
  // Both functions are pulled out of ONE evaluateAppsScript scope so loadHistoryV2_
  // returns the SAME in-memory `history` array to the drain and to the context builder —
  // the drain's mutation is what the context builder reads, not a copy of it.
  const topId = 'user_closet_seam_top';
  const bottomId = 'user_closet_seam_bottom';

  const snapshot = {
    settings: { timezone: 'America/New_York', maxDailyHistoryDays: 30 },
    items: [
      { id: topId, shortLabel: 'T001', slot: 'top', brand: 'Nike', name: 'ACG Tee', color: 'cream' },
      { id: bottomId, shortLabel: 'B001', slot: 'bottom', brand: 'Dickies', name: 'Double Knee', color: 'brown' }
    ],
    atlasPages: [],
    tasteExamples: []
  };

  const utilities = {
    parseDate: (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`),
    formatDate: (date: Date) => date.toISOString().slice(0, 10)
  };

  // See the identical annotation note on DrainHistoryEntry above: the drain mutates
  // this array in place, adding `feedback`, and without the annotation the literal's
  // inferred type lacks that property, which fails `tsc -b` while still passing Vitest.
  type SeamHistoryEntry = {
    localDate: string;
    recommendations: Array<{ candidateId: string; name: string; archetype: string; itemIds: string[] }>;
    feedback?: Array<{ localDate: string; candidateId: string; value: string; createdAt: number }>;
  };

  it('a wore tap drained from the inbox lands in itemFeedbackSignals and exempts cooldown', () => {
    const localDate = '2026-07-20';
    const nextLocalDate = '2026-07-21';
    const history: SeamHistoryEntry[] = [{
      localDate,
      recommendations: [{
        candidateId: 'easy-1',
        name: 'Quiet Morning Ease',
        archetype: 'easy',
        itemIds: [topId, bottomId]
      }]
    }];
    const stored = [{ localDate, candidateId: 'easy-1', value: 'wore', createdAt: 10 }];
    const saveHistory = vi.fn();
    const saveStore = vi.fn();

    const api = evaluateAppsScript<{
      drain: () => boolean;
      context: (localDateValue: string, snapshotValue: object) => Record<string, any>;
    }>(
      ['ItemIndex.gs', 'ShoeRotation.gs', 'Taste.gs', 'Feedback.gs'],
      '({ drain: mergeEmailFeedbackIntoHistoryV2_, context: dailyHistoryContextV2_ })',
      {
        ...storeScope(),
        loadHistoryV2_: () => history,
        saveHistoryV2_: saveHistory,
        loadEmailFeedbackV2_: () => stored,
        saveEmailFeedbackV2_: saveStore,
        localDateV2_: () => localDate,
        getDailyConfigV2_: () => ({ timezone: 'America/New_York' }),
        Utilities: utilities
      }
    );

    expect(api.drain()).toBe(true);
    expect(saveHistory).toHaveBeenCalledOnce();
    expect(saveStore).toHaveBeenCalledWith([]);
    expect(history[0].feedback).toEqual([
      { localDate, candidateId: 'easy-1', value: 'wore', createdAt: 10 }
    ]);

    const result = api.context(nextLocalDate, snapshot);

    expect(result.itemFeedbackSignals.T001.wore).toBe(1);
    expect(result.itemFeedbackSignals.B001.wore).toBe(1);
    expect(result.wornItemIds).toEqual(expect.arrayContaining([topId, bottomId]));
    expect(result.cooldownItemIds).not.toContain(topId);
    expect(result.cooldownItemIds).not.toContain(bottomId);
  });
});
