import { describe, expect, it, vi } from 'vitest';
import { evaluateAppsScript } from './appsScriptTestHarness';

const response = (status: number, payload: object) => ({
  getResponseCode: () => status,
  getContentText: () => JSON.stringify(payload)
});
const ok = (value: object) => response(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
const failure = (status: number, message: string) => response(status, { error: { message } });

const transport = (fetch: ReturnType<typeof vi.fn>, fetchAll: ReturnType<typeof vi.fn>, sleep: ReturnType<typeof vi.fn>) =>
  evaluateAppsScript<{
    callGeminiV2_: (stage: string, parts: object[], schema: object, temperature: number) => object;
    callGeminiBatchV2_: (stage: string, calls: Array<{ context?: string; parts: object[]; schema: object; temperature: number }>) => object[];
  }>(['GeminiTransport.gs'], '({ callGeminiV2_: callGeminiV2_, callGeminiBatchV2_: callGeminiBatchV2_ })', {
    UrlFetchApp: { fetch, fetchAll },
    Utilities: { sleep },
    getRequiredPropertyV2_: () => 'test-key',
    getModelNameV2_: () => 'test-model',
    console: { error: vi.fn() }
  });

describe('Gemini transport retry policy', () => {
  it('retries one 5xx on a single call after four seconds', () => {
    const fetch = vi.fn().mockReturnValueOnce(failure(503, 'busy')).mockReturnValueOnce(ok({ done: true }));
    const sleep = vi.fn();
    const api = transport(fetch, vi.fn(), sleep);
    expect(api.callGeminiV2_('critic', [{ text: 'score' }], {}, 0.3)).toEqual({ done: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it('retries one transport failure on a single call after four seconds', () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => { throw new Error('socket timeout'); })
      .mockReturnValueOnce(ok({ done: true }));
    const sleep = vi.fn();
    const api = transport(fetch, vi.fn(), sleep);
    expect(api.callGeminiV2_('critic', [{ text: 'score' }], {}, 0.3)).toEqual({ done: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(4000);
  });

  it('retries only failed planner indices and preserves successful responses', () => {
    const fetchAll = vi.fn()
      .mockReturnValueOnce([ok({ id: 'easy' }), failure(429, 'rate limited'), ok({ id: 'expressive' })])
      .mockReturnValueOnce([ok({ id: 'polished' })]);
    const sleep = vi.fn();
    const api = transport(vi.fn(), fetchAll, sleep);
    const calls = ['easy', 'polished-casual', 'expressive'].map(context => ({ context, parts: [], schema: {}, temperature: 0.9 }));
    expect(api.callGeminiBatchV2_('planner', calls)).toEqual([{ id: 'easy' }, { id: 'polished' }, { id: 'expressive' }]);
    expect(fetchAll.mock.calls[1][0]).toHaveLength(1);
    expect(sleep).toHaveBeenCalledWith(20000);
  });

  it('does not retry a non-429 4xx and names the archetype', () => {
    const fetchAll = vi.fn().mockReturnValueOnce([ok({ id: 'easy' }), failure(400, 'bad request'), ok({ id: 'expressive' })]);
    const api = transport(vi.fn(), fetchAll, vi.fn());
    const calls = ['easy', 'polished-casual', 'expressive'].map(context => ({ context, parts: [], schema: {}, temperature: 0.9 }));
    expect(() => api.callGeminiBatchV2_('planner', calls)).toThrow(/planner\[polished-casual\].*HTTP 400/);
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });
});
