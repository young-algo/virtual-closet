# Emailed Outfit Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a daily outfit email be rated in one tap — `liked`, `disliked`, or `wore` — with the signal reaching the planner, and retire the in-app feedback path that silently discards every tap today.

**Architecture:** Each generated look in the email carries three links to the existing Apps Script web app, each an HMAC-signed token naming one `(localDate, candidateId, value)` triple. A new `doGet` verifies the token, upserts into a Drive-backed feedback inbox, and renders a confirmation page offering the other two verbs as corrections. A `mergeEmailFeedbackIntoHistoryV2_()` drains that inbox into daily history at the three Scheduler callsites where `mergeSnapshotFeedbackIntoHistoryV2_` runs today, so history stays the single source the planner reads.

**Tech Stack:** Google Apps Script (ES5-style `.gs`, no modules), React 19 + TypeScript 6 (Vite 8), Vitest 3. Apps Script sources are tested from Node by `evaluateAppsScript` in `src/features/daily-outfits/__tests__/appsScriptTestHarness.ts`, which concatenates `.gs` files and evaluates them with an injected scope.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-07-25-emailed-outfit-feedback-design.md`.
- `.gs` files are ES5-flavored: `var`, `function`, no arrow functions, no `let`/`const`, no template literals, no modules. Match the surrounding style exactly.
- Feedback vocabulary is exactly `liked`, `disliked`, `wore`. No reason field, no note field.
- Encore looks render **no** feedback links.
- Test deliveries render links for layout parity but record nothing.
- Replay bound is the new constant `DAILY_V2.MAX_EMAIL_FEEDBACK_AGE_DAYS = 30`, never the snapshot's `maxDailyHistoryDays`. `doGet` must not load the wardrobe snapshot.
- `FEEDBACK_SECRET` is distinct from `SYNC_SECRET` and never appears in a URL.
- `doGet` handles feedback only. Generation and sending stay `doPost`-only behind `SYNC_SECRET`.
- Every failure mode in `doGet` renders one identical invalid-link page. Never distinguish bad signature from bad payload from out-of-window date in output.
- Missing `FEEDBACK_SECRET` or `WEB_APP_URL` must throw during email render, so no email ships with dead links.
- The on-demand stylist (`src/components/AIStylist.tsx`, `src/services/stylist.ts`) is untouched.
- Apps Script byte arrays are **signed** (`-128..127`). Any Node-side test double for `Utilities` must model that, or HMAC round-trips will silently diverge.
- Run tests with `npx vitest run <path>`. Full suite is `npm test`.

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `apps-script/daily-outfits-v2/Feedback.gs` | Feedback domain logic: validation, upsert, token sign/verify, link URL construction, history drain |
| `apps-script/daily-outfits-v2/FeedbackPage.gs` | `doGet` handler and landing-page HTML rendering |
| `src/features/daily-outfits/__tests__/feedbackContracts.test.ts` | Contract tests for store, token, drain, `doGet`, and email rendering |

**Modified:**

| Path | Change |
| --- | --- |
| `apps-script/daily-outfits-v2/Config.gs` | Add three `DAILY_V2` constants; remove `appUrl` from `getDailyConfigV2_` |
| `apps-script/daily-outfits-v2/DriveStore.gs` | Add `loadEmailFeedbackV2_` / `saveEmailFeedbackV2_` |
| `apps-script/daily-outfits-v2/Taste.gs` | Replace `mergeSnapshotFeedbackIntoHistoryV2_` with `mergeEmailFeedbackIntoHistoryV2_` |
| `apps-script/daily-outfits-v2/Scheduler.gs` | Repoint the three merge callsites (lines 39, 82, 143) |
| `apps-script/daily-outfits-v2/Encore.gs` | Remove the `snapshot.dailyFeedback` branch (lines 232–236) |
| `apps-script/daily-outfits-v2/Email.gs` | Add feedback rows to HTML and plain text; remove `appLink` |
| `apps-script/daily-outfits-v2/README.md` | Script Property list and deploy steps |
| `src/features/daily-outfits/DailyBundlePreview.tsx` | Drop feedback props and render sites; relabel heading |
| `src/features/daily-outfits/DailyOutfitSettings.tsx` | Drop feedback state, handler, and prop pass |
| `src/features/daily-outfits/storage.ts` | Drop feedback load/save and storage key |
| `src/features/daily-outfits/snapshotBuilder.ts` | Drop `feedback` param and `dailyFeedback` field |
| `src/features/daily-outfits/types.ts` | Drop `DailyFeedbackV2` and `dailyFeedback` |
| `src/features/daily-outfits/__tests__/resilienceContracts.test.ts` | Replace the byte-equal merge test (lines 243–256) |
| `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts` | Rename ~20 merge stubs |
| `src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx` | Drop feedback props from render calls |
| `src/features/daily-outfits/__tests__/storage.test.ts` | Drop feedback storage assertions |

**Deleted:** `src/features/daily-outfits/DailyFeedbackControls.tsx`

---

## Task 1: Feedback store and constants

**Files:**
- Modify: `apps-script/daily-outfits-v2/Config.gs:1-27` (constants), `apps-script/daily-outfits-v2/Config.gs:72` (drop `appUrl`)
- Modify: `apps-script/daily-outfits-v2/DriveStore.gs` (append)
- Create: `apps-script/daily-outfits-v2/Feedback.gs`
- Create: `src/features/daily-outfits/__tests__/feedbackContracts.test.ts`
- Modify: `apps-script/daily-outfits-v2/README.md:16`

**Interfaces:**
- Consumes: `getJsonFileByPropertyV2_`, `replaceJsonFileV2_` (DriveStore.gs); `shoeRotationCalendarOrdinalV2_(localDate) -> number|null` (ShoeRotation.gs)
- Produces:
  - `DAILY_V2.EMAIL_FEEDBACK_FILE`, `DAILY_V2.MAX_EMAIL_FEEDBACK_AGE_DAYS`, `DAILY_V2.FEEDBACK_VALUES`
  - `loadEmailFeedbackV2_() -> Array<{localDate,candidateId,value,createdAt}>`
  - `saveEmailFeedbackV2_(entries) -> string`
  - `validFeedbackEntryV2_(entry) -> boolean`
  - `feedbackDateWithinWindowV2_(localDate, todayLocalDate) -> boolean`
  - `upsertEmailFeedbackV2_(localDate, candidateId, value, createdAt) -> void`

- [ ] **Step 1: Write the failing tests**

Create `src/features/daily-outfits/__tests__/feedbackContracts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts`
Expected: FAIL — `ENOENT` reading `Feedback.gs`.

- [ ] **Step 3: Add the constants**

In `apps-script/daily-outfits-v2/Config.gs`, inside the `DAILY_V2` object literal, after the `PENDING_FILE` line:

```javascript
  EMAIL_FEEDBACK_FILE: 'virtual-closet-daily-v2-email-feedback.json',
```

and after `REQUIRED_SLOTS`:

```javascript
  MAX_EMAIL_FEEDBACK_AGE_DAYS: 30,
  FEEDBACK_VALUES: ['liked', 'disliked', 'wore']
```

Remember `REQUIRED_SLOTS` currently ends the literal with no trailing comma — add one.

- [ ] **Step 4: Add the store accessors**

Append to `apps-script/daily-outfits-v2/DriveStore.gs`:

```javascript
function loadEmailFeedbackV2_() {
  return getJsonFileByPropertyV2_('EMAIL_FEEDBACK_FILE_ID_V2', []);
}

function saveEmailFeedbackV2_(entries) {
  return replaceJsonFileV2_('EMAIL_FEEDBACK_FILE_ID_V2', DAILY_V2.EMAIL_FEEDBACK_FILE, entries);
}
```

- [ ] **Step 5: Create Feedback.gs**

Create `apps-script/daily-outfits-v2/Feedback.gs`:

```javascript
function validFeedbackLocalDateV2_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validFeedbackCandidateIdV2_(value) {
  return typeof value === 'string' && value.length > 0 && value.indexOf('|') < 0;
}

function validFeedbackValueV2_(value) {
  return DAILY_V2.FEEDBACK_VALUES.indexOf(value) >= 0;
}

function validFeedbackEntryV2_(entry) {
  return Boolean(entry) && typeof entry === 'object' &&
    validFeedbackLocalDateV2_(entry.localDate) &&
    validFeedbackCandidateIdV2_(entry.candidateId) &&
    validFeedbackValueV2_(entry.value) &&
    typeof entry.createdAt === 'number' && isFinite(entry.createdAt);
}

function feedbackDateWithinWindowV2_(localDate, todayLocalDate) {
  var then = shoeRotationCalendarOrdinalV2_(localDate);
  var now = shoeRotationCalendarOrdinalV2_(todayLocalDate);
  if (then === null || now === null) return false;
  var age = now - then;
  return age >= 0 && age <= DAILY_V2.MAX_EMAIL_FEEDBACK_AGE_DAYS;
}

function readEmailFeedbackStoreV2_() {
  var stored = loadEmailFeedbackV2_();
  if (!Array.isArray(stored)) throw new Error('Corrupt email feedback store: expected a JSON array');
  stored.forEach(function(entry) {
    if (!validFeedbackEntryV2_(entry)) {
      throw new Error('Corrupt email feedback store: invalid entry');
    }
  });
  return stored;
}

function upsertEmailFeedbackV2_(localDate, candidateId, value, createdAt) {
  var entry = { localDate: localDate, candidateId: candidateId, value: value, createdAt: createdAt };
  if (!validFeedbackEntryV2_(entry)) throw new Error('Invalid feedback signal');
  var stored = readEmailFeedbackStoreV2_();
  var next = stored.filter(function(existing) {
    return !(existing.localDate === localDate && existing.candidateId === candidateId);
  });
  next.push(entry);
  saveEmailFeedbackV2_(next);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 7: Update the deploy README**

In `apps-script/daily-outfits-v2/README.md`, in the Script Properties list, add below the `SYNC_SECRET` line:

```markdown
   - `FEEDBACK_SECRET` — at least 16 random characters, distinct from `SYNC_SECRET`; signs the one-tap feedback links in the daily email
   - `WEB_APP_URL` — the deployment's `/exec` URL, used to build feedback links
```

In the same file, on line 23, add `EMAIL_FEEDBACK_FILE_ID_V2` to the list of script-managed properties.

- [ ] **Step 8: Commit**

```bash
git add apps-script/daily-outfits-v2/Config.gs apps-script/daily-outfits-v2/DriveStore.gs apps-script/daily-outfits-v2/Feedback.gs apps-script/daily-outfits-v2/README.md src/features/daily-outfits/__tests__/feedbackContracts.test.ts
git commit -m "feat(daily-outfits): add email feedback store and retention window"
```

---

## Task 2: Signed feedback tokens

**Files:**
- Modify: `apps-script/daily-outfits-v2/Feedback.gs` (append)
- Modify: `src/features/daily-outfits/__tests__/feedbackContracts.test.ts` (append)

**Interfaces:**
- Consumes: `validFeedbackEntryV2_`, `feedbackDateWithinWindowV2_` (Task 1); `getRequiredPropertyV2_` (Config.gs)
- Produces:
  - `signFeedbackTokenV2_(localDate, candidateId, value, testMode) -> {fb: string, s: string}`
  - `verifyFeedbackTokenV2_(parameter, todayLocalDate) -> {localDate, candidateId, value, testMode}` (throws on any failure)
  - `feedbackLinkUrlV2_(localDate, candidateId, value, testMode) -> string`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/daily-outfits/__tests__/feedbackContracts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "feedback token"`
Expected: FAIL — `signFeedbackTokenV2_ is not defined`.

- [ ] **Step 3: Implement token signing and verification**

Append to `apps-script/daily-outfits-v2/Feedback.gs`:

```javascript
function feedbackPayloadV2_(localDate, candidateId, value, testMode) {
  return ['v1', localDate, candidateId, value, testMode ? '1' : '0'].join('|');
}

function feedbackSignatureV2_(payload) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, getRequiredPropertyV2_('FEEDBACK_SECRET'))
  ).replace(/=+$/, '');
}

function constantTimeEqualsV2_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  var diff = 0;
  for (var index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function signFeedbackTokenV2_(localDate, candidateId, value, testMode) {
  var entry = { localDate: localDate, candidateId: candidateId, value: value, createdAt: 0 };
  if (!validFeedbackEntryV2_(entry)) throw new Error('Cannot sign an invalid feedback signal');
  var payload = feedbackPayloadV2_(localDate, candidateId, value, testMode);
  return {
    fb: Utilities.base64EncodeWebSafe(payload).replace(/=+$/, ''),
    s: feedbackSignatureV2_(payload)
  };
}

function verifyFeedbackTokenV2_(parameter, todayLocalDate) {
  if (!parameter || typeof parameter.fb !== 'string' || typeof parameter.s !== 'string') {
    throw new Error('Invalid feedback link');
  }
  var payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parameter.fb)).getDataAsString('UTF-8');
  } catch (_ignored) {
    throw new Error('Invalid feedback link');
  }
  if (!constantTimeEqualsV2_(feedbackSignatureV2_(payload), parameter.s)) {
    throw new Error('Invalid feedback link');
  }
  var parts = payload.split('|');
  if (parts.length !== 5 || parts[0] !== 'v1') throw new Error('Invalid feedback link');
  var token = { localDate: parts[1], candidateId: parts[2], value: parts[3], testMode: parts[4] === '1' };
  if (parts[4] !== '0' && parts[4] !== '1') throw new Error('Invalid feedback link');
  if (!validFeedbackEntryV2_({
    localDate: token.localDate, candidateId: token.candidateId, value: token.value, createdAt: 0
  })) {
    throw new Error('Invalid feedback link');
  }
  if (!feedbackDateWithinWindowV2_(token.localDate, todayLocalDate)) {
    throw new Error('Invalid feedback link');
  }
  return token;
}

function feedbackLinkUrlV2_(localDate, candidateId, value, testMode) {
  var token = signFeedbackTokenV2_(localDate, candidateId, value, testMode);
  return getRequiredPropertyV2_('WEB_APP_URL') + '?fb=' + token.fb + '&s=' + token.s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add apps-script/daily-outfits-v2/Feedback.gs src/features/daily-outfits/__tests__/feedbackContracts.test.ts
git commit -m "feat(daily-outfits): sign and verify one-tap feedback tokens"
```

---

## Task 3: Drain the inbox into daily history

**Files:**
- Modify: `apps-script/daily-outfits-v2/Taste.gs:181-197` (replace)
- Modify: `apps-script/daily-outfits-v2/Scheduler.gs:39,82,143`
- Modify: `apps-script/daily-outfits-v2/Encore.gs:232-236`
- Modify: `src/features/daily-outfits/__tests__/resilienceContracts.test.ts:243-256`
- Modify: `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts` (~20 stub renames)
- Modify: `src/features/daily-outfits/__tests__/feedbackContracts.test.ts` (append)

**Interfaces:**
- Consumes: `readEmailFeedbackStoreV2_`, `saveEmailFeedbackV2_` (Task 1); `loadHistoryV2_`, `saveHistoryV2_` (DriveStore.gs); `historyLooksV2_` (Taste.gs)
- Produces: `mergeEmailFeedbackIntoHistoryV2_() -> boolean` (true when history changed)

- [ ] **Step 1: Write the failing tests**

Append to `src/features/daily-outfits/__tests__/feedbackContracts.test.ts`:

```ts
describe('feedback drain', () => {
  const drainScope = (history: unknown[], stored: unknown[], saves: Record<string, ReturnType<typeof vi.fn>>) => ({
    ...storeScope(),
    loadHistoryV2_: () => history,
    saveHistoryV2_: saves.history,
    loadEmailFeedbackV2_: () => stored,
    saveEmailFeedbackV2_: saves.store
  });

  it('merges a signal into its history entry and drains it', () => {
    const history = [{ localDate: '2026-07-25', recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }] }];
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
    const history = [{ localDate: '2026-07-25', recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }] }];
    const saves = { history: vi.fn(), store: vi.fn() };
    const stored = [{ localDate: '2026-07-25', candidateId: 'ghost-9', value: 'wore', createdAt: 10 }];
    const drain = evaluateAppsScript<() => boolean>(
      ['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', drainScope(history, stored, saves)
    );
    expect(drain()).toBe(false);
    expect(saves.store).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "feedback drain"`
Expected: FAIL — `mergeEmailFeedbackIntoHistoryV2_ is not defined`.

- [ ] **Step 3: Replace the merge function**

In `apps-script/daily-outfits-v2/Taste.gs`, delete `mergeSnapshotFeedbackIntoHistoryV2_` (lines 181–197 in full) and replace it with:

```javascript
function mergeEmailFeedbackIntoHistoryV2_() {
  var stored = readEmailFeedbackStoreV2_();
  if (!stored.length) return false;
  var history = loadHistoryV2_();
  var changed = false;
  var retained = [];
  stored.forEach(function(signal) {
    var entry = history.find(function(value) { return value.localDate === signal.localDate; });
    if (!entry) {
      // The email ships before finalizeSentBundleV2_ writes history. Keep the
      // signal queued rather than discarding it, and merge it on a later run.
      retained.push(signal);
      return;
    }
    var known = historyLooksV2_(entry).some(function(look) { return look.candidateId === signal.candidateId; });
    if (!known) return;
    var before = entry.feedback || [];
    var matching = before.filter(function(value) { return value.candidateId === signal.candidateId; });
    if (matching.length === 1 && JSON.stringify(matching[0]) === JSON.stringify(signal)) return;
    var after = before.filter(function(value) { return value.candidateId !== signal.candidateId; });
    after.push(signal);
    entry.feedback = after;
    changed = true;
  });
  if (changed) saveHistoryV2_(history);
  if (retained.length !== stored.length) saveEmailFeedbackV2_(retained);
  return changed;
}
```

Note the `known` guard: unlike the old snapshot merge, a signal naming a candidate that is not among that date's looks is dropped rather than written. That is the class of silent corruption this feature exists to end.

- [ ] **Step 4: Repoint the Scheduler callsites**

In `apps-script/daily-outfits-v2/Scheduler.gs`, replace all three occurrences:

```javascript
    mergeSnapshotFeedbackIntoHistoryV2_(snapshot);
```

with:

```javascript
    mergeEmailFeedbackIntoHistoryV2_();
```

Verify exactly three replacements at lines 39, 82, and 143 (indentation differs — line 82 and 143 are more deeply nested; preserve each line's existing indentation).

- [ ] **Step 5: Remove the Encore snapshot branch**

In `apps-script/daily-outfits-v2/Encore.gs`, delete lines 232–236:

```javascript
  if (ownEncoreKeyV2_(snapshot, 'dailyFeedback')) {
    if (!validEncoreArrayV2_(snapshot.dailyFeedback)) {
      throw new Error('Invalid snapshot dailyFeedback for Encore selection');
    }
    snapshot.dailyFeedback.forEach(addSignal);
  }
```

- [ ] **Step 6: Update the existing merge tests**

In `src/features/daily-outfits/__tests__/resilienceContracts.test.ts`, replace the test at lines 243–256 with:

```ts
  it('does not rewrite history when the queued signal is already byte-equal', () => {
    const signal = { localDate: '2026-07-13', candidateId: 'easy-1', value: 'wore', createdAt: 2 };
    const history = [{
      localDate: '2026-07-13',
      recommendations: [{ candidateId: 'easy-1', itemIds: ['a'] }],
      feedback: [signal]
    }];
    const saveHistoryV2_ = vi.fn();
    const merge = evaluateAppsScript<() => boolean>(['Taste.gs', 'Feedback.gs'], 'mergeEmailFeedbackIntoHistoryV2_', {
      DAILY_V2: { FEEDBACK_VALUES: ['liked', 'disliked', 'wore'], MAX_EMAIL_FEEDBACK_AGE_DAYS: 30 },
      loadHistoryV2_: () => history,
      saveHistoryV2_,
      loadEmailFeedbackV2_: () => [signal],
      saveEmailFeedbackV2_: vi.fn(),
      itemMapV2_: () => ({}),
    });
    expect(merge()).toBe(false);
    expect(saveHistoryV2_).not.toHaveBeenCalled();
    expect(history[0].feedback).toEqual([signal]);
  });
```

In `src/features/daily-outfits/__tests__/appsScriptContracts.test.ts`, rename every stub key `mergeSnapshotFeedbackIntoHistoryV2_` to `mergeEmailFeedbackIntoHistoryV2_`:

```bash
sed -i '' 's/mergeSnapshotFeedbackIntoHistoryV2_/mergeEmailFeedbackIntoHistoryV2_/g' src/features/daily-outfits/__tests__/appsScriptContracts.test.ts
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS. Any failure naming `dailyFeedback` or `mergeSnapshotFeedbackIntoHistoryV2_` is a missed callsite — grep and fix before continuing.

- [ ] **Step 8: Commit**

```bash
git add apps-script/daily-outfits-v2/Taste.gs apps-script/daily-outfits-v2/Scheduler.gs apps-script/daily-outfits-v2/Encore.gs src/features/daily-outfits/__tests__/
git commit -m "feat(daily-outfits): drain email feedback inbox into daily history"
```

---

## Task 4: doGet handler and landing page

**Files:**
- Create: `apps-script/daily-outfits-v2/FeedbackPage.gs`
- Modify: `src/features/daily-outfits/__tests__/feedbackContracts.test.ts` (append)

**Interfaces:**
- Consumes: `verifyFeedbackTokenV2_`, `upsertEmailFeedbackV2_`, `feedbackLinkUrlV2_` (Tasks 1–2); `loadHistoryV2_`, `historyLooksV2_`, `escapeHtmlV2_`, `localDateV2_`, `getDailyConfigV2_` (existing)
- Produces: `doGet(e) -> HtmlOutput`, `feedbackLookNameV2_(localDate, candidateId) -> string|null`, `renderFeedbackPageV2_(token, lookName) -> string`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/daily-outfits/__tests__/feedbackContracts.test.ts`:

```ts
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
    const upsert = vi.fn();
    const scope = pageScope({ upsertEmailFeedbackV2_: upsert });
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    const result = runGet(scope, token);
    expect(upsert).toHaveBeenCalledWith('2026-07-25', 'easy-1', 'wore', expect.any(Number));
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
    const upsert = vi.fn();
    const scope = pageScope({ upsertEmailFeedbackV2_: upsert });
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', true);
    const html = runGet(scope, token).html;
    expect(upsert).not.toHaveBeenCalled();
    expect(html).toContain('Test delivery');
    expect(html).not.toContain('href="https:');
  });

  it('falls back to the date when the history entry does not exist yet', () => {
    const upsert = vi.fn();
    const scope = pageScope({ loadHistoryV2_: () => [], upsertEmailFeedbackV2_: upsert });
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    const html = runGet(scope, token).html;
    expect(upsert).toHaveBeenCalledOnce();
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
      upsertEmailFeedbackV2_: () => { throw new Error('Corrupt email feedback store'); }
    });
    const token = signWith(scope)('2026-07-25', 'easy-1', 'wore', false);
    expect(runGet(scope, token).html).toContain("isn't valid");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "doGet"`
Expected: FAIL — `ENOENT` reading `FeedbackPage.gs`.

- [ ] **Step 3: Create FeedbackPage.gs**

Create `apps-script/daily-outfits-v2/FeedbackPage.gs`:

```javascript
var FEEDBACK_LABELS_V2 = { liked: 'like', disliked: 'not for me', wore: 'wore this' };

function feedbackLookNameV2_(localDate, candidateId) {
  var history;
  try {
    history = loadHistoryV2_();
  } catch (_ignored) {
    return null;
  }
  var entry = (history || []).find(function(value) { return value.localDate === localDate; });
  if (!entry) return null;
  var look = historyLooksV2_(entry).find(function(value) { return value.candidateId === candidateId; });
  return look && typeof look.name === 'string' && look.name ? look.name : null;
}

function feedbackPageShellV2_(body) {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '</head><body style="margin:0;background:#fff">' +
    '<div style="max-width:520px;margin:0 auto;padding:56px 24px;font-family:Arial,sans-serif;color:#111">' +
    '<div style="font:600 11px monospace;letter-spacing:4px">WARDROBE</div>' + body +
    '</div></body></html>';
}

function invalidFeedbackPageV2_() {
  return HtmlService.createHtmlOutput(feedbackPageShellV2_(
    '<p style="margin:28px 0 0;font:400 15px/1.6 Arial,sans-serif">This link isn\'t valid.</p>'
  ));
}

function feedbackCorrectionLinksV2_(token) {
  return DAILY_V2.FEEDBACK_VALUES.filter(function(value) {
    return value !== token.value;
  }).map(function(value) {
    return '<a href="' + escapeHtmlV2_(feedbackLinkUrlV2_(token.localDate, token.candidateId, value, false)) +
      '" style="display:inline-block;padding:14px 24px 14px 0;font:600 10px monospace;letter-spacing:2px;color:#111">' +
      escapeHtmlV2_(FEEDBACK_LABELS_V2[value].toUpperCase()) + '</a>';
  }).join('');
}

function renderFeedbackPageV2_(token, lookName) {
  var subject = lookName ? escapeHtmlV2_(lookName) + ' · ' + escapeHtmlV2_(token.localDate) : escapeHtmlV2_(token.localDate);
  if (token.testMode) {
    return feedbackPageShellV2_(
      '<p style="margin:28px 0 6px;font:400 22px/1.3 Arial,sans-serif">Test delivery — not recorded</p>' +
      '<p style="margin:0;color:#666;font:400 13px/1.6 Arial,sans-serif">' + subject + '</p>'
    );
  }
  return feedbackPageShellV2_(
    '<p style="margin:28px 0 6px;font:400 22px/1.3 Arial,sans-serif">Recorded — ' +
      escapeHtmlV2_(FEEDBACK_LABELS_V2[token.value]) + '</p>' +
    '<p style="margin:0 0 26px;color:#666;font:400 13px/1.6 Arial,sans-serif">' + subject + '</p>' +
    '<div style="border-top:1px solid #deddd8;padding-top:8px">' +
      '<div style="font:600 10px monospace;letter-spacing:2px;color:#777;padding-bottom:4px">CHANGE TO</div>' +
      feedbackCorrectionLinksV2_(token) +
    '</div>'
  );
}

function doGet(e) {
  try {
    var today = localDateV2_(new Date(), getDailyConfigV2_().timezone);
    var token = verifyFeedbackTokenV2_(e && e.parameter, today);
    if (!token.testMode) {
      upsertEmailFeedbackV2_(token.localDate, token.candidateId, token.value, Date.now());
    }
    return HtmlService.createHtmlOutput(
      renderFeedbackPageV2_(token, feedbackLookNameV2_(token.localDate, token.candidateId))
    );
  } catch (error) {
    console.error('Daily V2 feedback link failed: ' + error.message);
    return invalidFeedbackPageV2_();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts`
Expected: PASS, 35 tests.

- [ ] **Step 5: Commit**

```bash
git add apps-script/daily-outfits-v2/FeedbackPage.gs src/features/daily-outfits/__tests__/feedbackContracts.test.ts
git commit -m "feat(daily-outfits): add doGet feedback landing page with corrections"
```

---

## Task 5: Feedback links in the email

**Files:**
- Modify: `apps-script/daily-outfits-v2/Email.gs:80-120`
- Modify: `apps-script/daily-outfits-v2/Config.gs:72`
- Modify: `apps-script/daily-outfits-v2/README.md:16`
- Modify: `src/features/daily-outfits/__tests__/feedbackContracts.test.ts` (append)

**Interfaces:**
- Consumes: `feedbackLinkUrlV2_` (Task 2), `escapeHtmlV2_` (Email.gs)
- Produces: `feedbackRowHtmlV2_(localDate, candidateId, testMode) -> string`, `feedbackPlainLinesV2_(localDate, candidateId, testMode) -> string[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/daily-outfits/__tests__/feedbackContracts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/daily-outfits/__tests__/feedbackContracts.test.ts -t "email feedback rendering"`
Expected: FAIL — `feedbackRowHtmlV2_ is not defined`.

- [ ] **Step 3: Add the renderers to Email.gs**

Insert into `apps-script/daily-outfits-v2/Email.gs` immediately after `archetypeEmailLabelV2_` (line 13):

```javascript
var FEEDBACK_EMAIL_LABELS_V2 = [
  ['liked', 'LIKE'],
  ['disliked', 'NOT FOR ME'],
  ['wore', 'WORE THIS']
];

function feedbackRowHtmlV2_(localDate, candidateId, testMode) {
  var cells = FEEDBACK_EMAIL_LABELS_V2.map(function(pair) {
    return '<td style="width:33%;text-align:center">' +
      '<a href="' + escapeHtmlV2_(feedbackLinkUrlV2_(localDate, candidateId, pair[0], testMode)) +
      '" style="display:inline-block;padding:14px 0;font:600 10px monospace;letter-spacing:2px;color:#111;text-decoration:none">' +
      pair[1] + '</a></td>';
  }).join('');
  return '<table role="presentation" cellpadding="0" cellspacing="0" ' +
    'style="width:100%;table-layout:fixed;margin-top:16px;border-top:1px solid #deddd8"><tr>' +
    cells + '</tr></table>';
}

function feedbackPlainLinesV2_(localDate, candidateId, testMode) {
  return ['Rate this look:'].concat(FEEDBACK_EMAIL_LABELS_V2.map(function(pair) {
    return '  ' + pair[1] + ' -> ' + feedbackLinkUrlV2_(localDate, candidateId, pair[0], testMode);
  }));
}
```

- [ ] **Step 4: Wire them into the section renderer**

In `renderDailyEmailV2_`, inside the `bundle.recommendations.map` callback:

After the existing `plain.push('')` at the end of the plain-text block (line 92), replace that single line with:

```javascript
    feedbackPlainLinesV2_(bundle.localDate, rec.candidateId, testMode).forEach(function(line) { plain.push(line); });
    plain.push('');
```

Then in the returned HTML string, insert the feedback row immediately before the closing `'</section>'`:

```javascript
      feedbackRowHtmlV2_(bundle.localDate, rec.candidateId, testMode) +
      '</section>';
```

- [ ] **Step 5: Remove the app link**

In `renderDailyEmailV2_`, delete the `appLink` declaration (line 106) and remove `appLink +` from the `html` concatenation (line 118).

In `apps-script/daily-outfits-v2/Config.gs`, delete line 72:

```javascript
    appUrl: getDailyPropertiesV2_().getProperty('APP_URL') || '',
```

In `apps-script/daily-outfits-v2/README.md`, delete the `APP_URL` bullet on line 16.

- [ ] **Step 6: Verify no appUrl reference remains in source**

Run: `grep -rn "appUrl\|APP_URL" apps-script/ src/ --include="*.gs" --include="*.ts" --include="*.tsx" --include="*.md" | grep -v "__tests__"`
Expected: no output. The ~28 `appUrl: ''` stubs inside `__tests__` are inert and stay.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps-script/daily-outfits-v2/Email.gs apps-script/daily-outfits-v2/Config.gs apps-script/daily-outfits-v2/README.md src/features/daily-outfits/__tests__/feedbackContracts.test.ts
git commit -m "feat(daily-outfits): add one-tap feedback rows to the outfit email"
```

---

## Task 6: Retire the in-app feedback path

**Files:**
- Delete: `src/features/daily-outfits/DailyFeedbackControls.tsx`
- Modify: `src/features/daily-outfits/DailyBundlePreview.tsx`
- Modify: `src/features/daily-outfits/DailyOutfitSettings.tsx:42,65,131,166,249`
- Modify: `src/features/daily-outfits/storage.ts:8,42-43`
- Modify: `src/features/daily-outfits/snapshotBuilder.ts:25,73`
- Modify: `src/features/daily-outfits/types.ts:67-74,91`
- Modify: `src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx`
- Modify: `src/features/daily-outfits/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks
- Produces: `DailyBundlePreview` props narrow to `{ bundle: DailyBundleV2; items: DailySourceItem[] }`; `buildDailySnapshot` loses its third parameter, becoming `(items, outfits, settings, onProgress?)`

- [ ] **Step 1: Update the preview test first**

In `src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx`, remove `feedback={...}` and `onFeedback={...}` from every `<DailyBundlePreview />` render, drop any `DailyFeedbackV2` import, and delete assertions naming the feedback buttons (`Like`, `Not for me`, `I wore this`).

Add this assertion so the relabelled heading is covered:

```tsx
it('labels the preview as the last generated test bundle', () => {
  render(<DailyBundlePreview bundle={bundleFixture} items={itemsFixture} />);
  expect(screen.getByText(/Last generated test bundle/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/daily-outfits/__tests__/DailyBundlePreview.test.tsx`
Expected: FAIL — the heading still reads `Latest bundle`, and the component still requires `feedback` props.

- [ ] **Step 3: Strip feedback from the preview**

In `src/features/daily-outfits/DailyBundlePreview.tsx`:

Replace the import line:

```tsx
import type { DailyBundleV2, DailySourceItem } from './types';
```

Delete the `import DailyFeedbackControls from './DailyFeedbackControls';` line.

Replace the props interface and signature:

```tsx
interface Props {
  bundle: DailyBundleV2;
  items: DailySourceItem[];
}

export default function DailyBundlePreview({ bundle: bundleValue, items }: Props) {
```

Delete the `encoreFeedback` declaration, the `selectedFeedback` declaration, and both `<DailyFeedbackControls ... />` elements.

Change the kicker and heading to name what the panel actually shows:

```tsx
          <span className="daily-kicker">Last generated test bundle</span>
```

- [ ] **Step 4: Delete the controls component**

```bash
git rm src/features/daily-outfits/DailyFeedbackControls.tsx
```

- [ ] **Step 5: Strip feedback from settings, storage, builder, and types**

In `src/features/daily-outfits/DailyOutfitSettings.tsx`: delete the `feedback` state (line 42) and `handleFeedback` (line 166); drop `feedback` from both `buildDailySnapshot` argument lists (lines 65, 131) and from both `useCallback` dependency arrays; change the preview render to `<DailyBundlePreview bundle={bundle} items={items} />`; drop now-unused imports of `loadDailyFeedback` and `DailyFeedbackV2`.

In `src/features/daily-outfits/storage.ts`: delete the `feedback` key from `DAILY_STORAGE_KEYS`, delete `loadDailyFeedback` and `saveDailyFeedback` (lines 42–43), and drop `DailyFeedbackV2` from the type import.

In `src/features/daily-outfits/snapshotBuilder.ts`: delete the `feedback` parameter (line 25) and the `dailyFeedback: feedback` field (line 73); drop `DailyFeedbackV2` from the type import.

In `src/features/daily-outfits/types.ts`: delete the `DailyFeedbackV2` interface (lines 67–74) and the `dailyFeedback: DailyFeedbackV2[];` field (line 91).

In `src/features/daily-outfits/__tests__/storage.test.ts`: delete assertions covering `loadDailyFeedback` / `saveDailyFeedback` and any `daily_outfits_feedback_v2` expectations.

- [ ] **Step 6: Typecheck and test**

Run: `npx tsc -b`
Expected: no errors. Any `DailyFeedbackV2` error names a missed reference.

Run: `npm test`
Expected: PASS.

Run: `npm run lint`
Expected: no new findings.

- [ ] **Step 7: Confirm the stylist is untouched**

Run: `git diff --name-only HEAD~5 -- src/components/AIStylist.tsx src/services/stylist.ts`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add -A src/features/daily-outfits/
git commit -m "refactor(daily-outfits): retire the in-app feedback path

The preview reads the last hand-generated test bundle, so its candidateIds
never matched a sent history entry and every signal was discarded silently.
The email is now the single feedback surface. The preview is retained for
shadow-rollout QA and relabelled to say what it actually shows."
```

---

## Task 7: Deployment runbook

**Files:**
- Modify: `apps-script/daily-outfits-v2/README.md`

**Interfaces:**
- Consumes: everything above
- Produces: no code

- [ ] **Step 1: Document the feedback loop**

Add this section to `apps-script/daily-outfits-v2/README.md` after the `## Weather providers` section:

```markdown
## Outfit feedback

Every generated look in the daily email carries three one-tap links: `LIKE`, `NOT FOR ME`, `WORE THIS`. Encore looks carry none, because saving an outfit is already the taste signal and unsaving it is the way to retire one.

Each link is an HMAC-signed token naming exactly one `(localDate, candidateId, value)` triple, verified by `doGet` against `FEEDBACK_SECRET`. `doGet` serves feedback only; generation and sending remain `doPost` actions behind `SYNC_SECRET`. Every failure mode — bad signature, malformed payload, unknown verb, out-of-window date, missing parameters — renders one identical invalid-link page, so the endpoint reveals nothing to a prober.

A tap upserts into `virtual-closet-daily-v2-email-feedback.json` and lands on a page confirming what was stored, with the other two verbs as one-tap corrections. Last write wins per `(localDate, candidateId)`.

The store is a durable inbox rather than a direct history write. The daily email is sent before `finalizeSentBundleV2_` creates the history entry, so a tap in that window has nothing to attach to. `mergeEmailFeedbackIntoHistoryV2_()` drains the inbox at the start of each generation run: a signal whose history entry exists is merged and removed, and one whose entry does not yet exist stays queued for a later run. A signal naming a candidate absent from that date's looks is dropped rather than written.

Tokens do not expire. Replay is bounded by `DAILY_V2.MAX_EMAIL_FEEDBACK_AGE_DAYS` (30), checked against the current local date without loading the wardrobe snapshot.

Test deliveries render the links for layout parity, but their tokens carry a test flag: the landing page reports `Test delivery — not recorded` and writes nothing.
```

- [ ] **Step 2: Document the deployment steps**

Replace step 4 of the `## Deploy` section with:

```markdown
4. Deploy as a Web app that executes as the owner, with access set to **Anyone**. Anonymous access is already required for the React app's `doPost` calls, and the feedback links depend on it too. Copy its `/exec` URL into both **Wardrobe → Daily email** in the React app and the `WEB_APP_URL` Script Property.
```

Add to the end of the `## Deploy` section:

```markdown
Redeploying matters for the feedback links specifically. The time-driven trigger runs HEAD, but the web app serves the *deployed* version, so `clasp push` alone leaves `doGet` unreachable and every link in the morning email dead. Run `clasp deploy -i <deploymentId>` to update the existing deployment in place and preserve the `/exec` URL. Pin clasp to v3.

After deploying, send a test delivery and confirm the links render and report `Test delivery — not recorded`. Then confirm that a real morning email records a tap, and that the signal appears in the next day's `dailyHistoryContextV2_` output via **Inspect diagnostics**.
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/daily-outfits-v2/README.md
git commit -m "docs(daily-outfits): document the email feedback loop and redeploy step"
```

---

## Verification

After all tasks:

- [ ] `npm test` passes
- [ ] `npx tsc -b` clean
- [ ] `npm run lint` clean
- [ ] `grep -rn "mergeSnapshotFeedbackIntoHistoryV2_\|DailyFeedbackControls\|dailyFeedback" apps-script/ src/` returns nothing
- [ ] `grep -rn "appUrl\|APP_URL" apps-script/ src/ --include="*.gs" --include="*.ts" --include="*.tsx" --include="*.md" | grep -v __tests__` returns nothing
