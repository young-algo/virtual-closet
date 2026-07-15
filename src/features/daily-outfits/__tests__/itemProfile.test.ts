import { mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryDefaultProfile, fillManifestDailyProfiles } from '../itemProfile';
import type { DailyRecommendationProfileV2, DailySourceItem } from '../types';
// The enrichment utility is intentionally plain ESM so it can run directly with Node.
// @ts-expect-error TypeScript does not generate declarations for standalone .mjs scripts.
import * as enrichmentScript from '../../../../scripts/enrich_daily_profiles.mjs';

const {
  imagePathsFor,
  mergeDailyProfile,
  resolvePublicImagePath,
  sanitizeStructuredProfile,
  shouldRetryStatus,
  shouldWriteManifests
} = enrichmentScript;

const item = (
  dailyProfile?: DailySourceItem['dailyProfile'],
  id = 'one'
): DailySourceItem => ({
  id,
  name: 'Graphic Tee',
  category: 'T-Shirts',
  color: 'navy',
  brand: 'Nike',
  image: '/one.jpg',
  description: 'graphic',
  dailyProfile
});

const inferredProfile = (overrides: Record<string, unknown> = {}) => ({
  silhouette: 'relaxed',
  secondaryColorFamily: 'cream',
  accentColors: ['red'],
  patternIntensity: 2,
  formality: 2,
  warmth: 2,
  breathability: 4,
  windProtection: 0,
  rainSafety: 'unknown',
  ...overrides
});

describe('daily profile enrichment hydration', () => {
  it('trims accent colors to four plain non-empty names', () => {
    const accentColors = [' cream ', '', 'red', 'sky blue', 'blue/white', 42, 'black', 'fifth'] as unknown as string[];

    expect(categoryDefaultProfile(item({ accentColors })).accentColors)
      .toEqual(['cream', 'red', 'sky blue', 'black']);
  });

  it('preserves category defaults around a partial override', () => {
    const profile = categoryDefaultProfile(item({ silhouette: 'slim' }));

    expect(profile).toMatchObject({
      silhouette: 'slim',
      warmth: 2,
      primaryColorFamily: 'navy',
      source: 'category-default'
    });
  });

  it('fills a missing local profile from the manifest', () => {
    const profile = { silhouette: 'relaxed', source: 'ai-inferred', confidence: 0.75, updatedAt: 1 } as const;

    expect(fillManifestDailyProfiles([item()], [item(profile)])[0].dailyProfile).toEqual(profile);
  });

  it('never merges over an existing local profile object', () => {
    const local = item({ silhouette: 'slim', source: 'manual' });
    const manifest = item({ silhouette: 'relaxed', accentColors: ['cream'], source: 'ai-inferred' });

    const [result] = fillManifestDailyProfiles([local], [manifest]);

    expect(result).toBe(local);
    expect(result.dailyProfile).toEqual(local.dailyProfile);
  });

  it('treats an empty local profile object as authoritative', () => {
    const local = item({});
    const manifest = item({ silhouette: 'relaxed', source: 'ai-inferred' });

    expect(fillManifestDailyProfiles([local], [manifest])[0]).toBe(local);
  });

  it('does not mutate local or manifest inputs', () => {
    const local = [item(undefined, 'missing'), item({ silhouette: 'slim' }, 'existing')];
    const manifest = [
      item({ silhouette: 'relaxed', source: 'ai-inferred' }, 'missing'),
      item({ silhouette: 'oversized', source: 'ai-inferred' }, 'existing')
    ];
    const localBefore = structuredClone(local);
    const manifestBefore = structuredClone(manifest);

    const result = fillManifestDailyProfiles(local, manifest);

    expect(result).not.toBe(local);
    expect(local).toEqual(localBefore);
    expect(manifest).toEqual(manifestBefore);
  });

  it('uses the last duplicate manifest id deterministically', () => {
    const first = item({ silhouette: 'slim' }, 'duplicate');
    const last = item({ silhouette: 'oversized' }, 'duplicate');

    const result = fillManifestDailyProfiles([item(undefined, 'duplicate')], [first, last]);

    expect(result[0].dailyProfile).toEqual(last.dailyProfile);
  });

  it('handles ids that collide with object prototype keys', () => {
    const ids = ['__proto__', 'constructor', 'toString'];
    const local = ids.map(id => item(undefined, id));
    const manifest = ids.map((id, index) => item({ warmth: (index + 1) as 1 | 2 | 3 }, id));

    expect(fillManifestDailyProfiles(local, manifest).map(entry => entry.dailyProfile?.warmth))
      .toEqual([1, 2, 3]);
  });
});

describe('daily profile enrichment script helpers', () => {
  it('sanitizes valid structured output before assignment', () => {
    expect(sanitizeStructuredProfile(inferredProfile({
      secondaryColorFamily: ' cream ',
      accentColors: [' red ', 'sky blue']
    }), 'T-Shirts')).toEqual(inferredProfile({
      secondaryColorFamily: 'cream',
      accentColors: ['red', 'sky blue']
    }));
  });

  it('rejects invalid structured fields instead of partially accepting them', () => {
    expect(() => sanitizeStructuredProfile(inferredProfile({ warmth: 6 }), 'T-Shirts'))
      .toThrow(/warmth/);
    expect(() => sanitizeStructuredProfile(inferredProfile({ accentColors: ['blue/white'] }), 'T-Shirts'))
      .toThrow(/accentColors/);
    expect(() => sanitizeStructuredProfile(inferredProfile({ rainSafety: 'good' }), 'T-Shirts'))
      .toThrow(/rainSafety/);
  });

  it('preserves existing fields and metadata without force', () => {
    const existing = {
      silhouette: 'slim',
      source: 'manual',
      confidence: 0.9,
      updatedAt: 10
    } satisfies Partial<DailyRecommendationProfileV2>;

    const result = mergeDailyProfile(existing, inferredProfile(), 'T-Shirts', { force: false, now: 20 });

    expect(result.changed).toBe(true);
    expect(result.profile).toMatchObject({
      silhouette: 'slim',
      secondaryColorFamily: 'cream',
      source: 'manual',
      confidence: 0.9,
      updatedAt: 20
    });
  });

  it('does not refresh the timestamp when no profile field changes', () => {
    const existing = {
      ...inferredProfile(),
      source: 'manual',
      confidence: 0.9,
      updatedAt: 10
    };

    const result = mergeDailyProfile(existing, inferredProfile(), 'T-Shirts', { force: false, now: 20 });

    expect(result).toEqual({ profile: existing, changed: false });
  });

  it('overwrites profile fields and inference metadata with force', () => {
    const existing = {
      ...inferredProfile({ silhouette: 'slim' }),
      source: 'manual',
      confidence: 0.9,
      updatedAt: 10
    };

    const result = mergeDailyProfile(existing, inferredProfile(), 'T-Shirts', { force: true, now: 20 });

    expect(result.profile).toMatchObject({
      silhouette: 'relaxed',
      source: 'ai-inferred',
      confidence: 0.75,
      updatedAt: 20
    });
  });

  it('resolves exact public image paths and rejects traversal', () => {
    expect(resolvePublicImagePath('/closet/one.jpg', '/repo/public')).toBe('/repo/public/closet/one.jpg');
    expect(() => resolvePublicImagePath('/../secret.jpg', '/repo/public')).toThrow(/outside public/);
  });

  it('includes both exact images when an item has a top view', () => {
    expect(imagePathsFor({ image: '/sneakers/side.png', imageTop: '/sneakers/top.png' }))
      .toEqual(['/sneakers/side.png', '/sneakers/top.png']);
  });

  it('retries only bounded rate-limit and server failures', () => {
    expect(shouldRetryStatus(429, 1)).toBe(true);
    expect(shouldRetryStatus(503, 2)).toBe(true);
    expect(shouldRetryStatus(503, 3)).toBe(false);
    expect(shouldRetryStatus(400, 1)).toBe(false);
  });

  it('keeps the Gemini API key out of the request URL and sends it only in a header', async () => {
    const secret = 'secret-key-that-must-not-leak';
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const callGemini = enrichmentScript.callGemini;

    expect(callGemini).toBeTypeOf('function');
    if (typeof callGemini !== 'function') return;

    await callGemini([{ text: 'profile this item' }], secret, {
      fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init: init ?? {} });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify(inferredProfile()) }] } }]
          })
        };
      },
      sleepImpl: async () => undefined
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).not.toContain(secret);
    expect(requests[0].url).not.toContain('?key=');
    expect(requests[0].init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': secret
    });
  });

  it('cancels a retryable response body before sleeping and retrying', async () => {
    const events: string[] = [];
    let requestCount = 0;
    const callGemini = enrichmentScript.callGemini;

    expect(callGemini).toBeTypeOf('function');
    if (typeof callGemini !== 'function') return;

    await callGemini([{ text: 'profile this item' }], 'header-only-key', {
      fetchImpl: async () => {
        requestCount += 1;
        events.push(`fetch-${requestCount}`);
        if (requestCount === 1) {
          return {
            ok: false,
            status: 429,
            body: {
              cancel: async () => {
                events.push('cancel-body');
              }
            }
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify(inferredProfile()) }] } }]
          })
        };
      },
      sleepImpl: async (milliseconds: number) => {
        events.push(`sleep-${milliseconds}`);
      }
    });

    expect(events).toEqual(['fetch-1', 'cancel-body', 'sleep-2000', 'fetch-2']);
  });

  it('restores both original manifests when the second replacement fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'daily-profiles-rollback-'));
    const firstFile = path.join(directory, 'closet.json');
    const secondFile = path.join(directory, 'sneakers.json');
    const firstOriginal = '[{"id":"closet-original"}]\n';
    const secondOriginal = '[{"id":"sneaker-original"}]\n';
    const writeManifestsTransaction = enrichmentScript.writeManifestsTransaction;

    try {
      await Promise.all([
        writeFile(firstFile, firstOriginal),
        writeFile(secondFile, secondOriginal)
      ]);
      expect(writeManifestsTransaction).toBeTypeOf('function');
      if (typeof writeManifestsTransaction !== 'function') return;

      let replacements = 0;
      const injectedFileSystem = {
        readFile,
        writeFile,
        unlink,
        rename: async (source: string, destination: string) => {
          if (source.endsWith('.tmp') && (destination === firstFile || destination === secondFile)) {
            replacements += 1;
            if (replacements === 2) throw new Error('injected second replacement failure');
          }
          await rename(source, destination);
        }
      };

      await expect(writeManifestsTransaction([
        { file: firstFile, items: [{ id: 'closet-updated' }] },
        { file: secondFile, items: [{ id: 'sneaker-updated' }] }
      ], {
        fileSystem: injectedFileSystem,
        transactionId: 'rollback-test'
      })).rejects.toThrow('injected second replacement failure');

      expect(await readFile(firstFile, 'utf8')).toBe(firstOriginal);
      expect(await readFile(secondFile, 'utf8')).toBe(secondOriginal);
      expect((await readdir(directory)).sort()).toEqual(['closet.json', 'sneakers.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['tmp', 'backup'] as const)(
    'waits for every %s preparation write before cleaning failed transactions',
    async failingSuffix => {
      const directory = await mkdtemp(path.join(os.tmpdir(), `daily-profiles-${failingSuffix}-race-`));
      const firstFile = path.join(directory, 'closet.json');
      const secondFile = path.join(directory, 'sneakers.json');
      const firstOriginal = '[{"id":"closet-original"}]\n';
      const secondOriginal = '[{"id":"sneaker-original"}]\n';
      const transactionId = `${failingSuffix}-race-test`;
      const failingArtifact = path.join(directory, `.closet.json.${transactionId}.${failingSuffix}`);
      const delayedArtifact = path.join(directory, `.sneakers.json.${transactionId}.${failingSuffix}`);
      const writeManifestsTransaction = enrichmentScript.writeManifestsTransaction;
      let signalCleanupStarted: () => void = () => undefined;
      const cleanupStarted = new Promise<void>(resolve => {
        signalCleanupStarted = resolve;
      });
      let signalDelayedWriteFinished: () => void = () => undefined;
      const delayedWriteFinished = new Promise<void>(resolve => {
        signalDelayedWriteFinished = resolve;
      });

      try {
        await Promise.all([
          writeFile(firstFile, firstOriginal),
          writeFile(secondFile, secondOriginal)
        ]);
        expect(writeManifestsTransaction).toBeTypeOf('function');
        if (typeof writeManifestsTransaction !== 'function') return;

        const injectedFileSystem = {
          readFile,
          rename,
          unlink: async (file: string) => {
            try {
              await unlink(file);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            if (file === delayedArtifact) signalCleanupStarted();
          },
          writeFile: async (...args: Parameters<typeof writeFile>) => {
            const [file] = args;
            if (String(file) === failingArtifact) {
              throw new Error(`injected ${failingSuffix} preparation failure`);
            }
            if (String(file) === delayedArtifact) {
              await Promise.race([
                cleanupStarted,
                new Promise<void>(resolve => setTimeout(resolve, 25))
              ]);
              await writeFile(...args);
              signalDelayedWriteFinished();
              return;
            }
            await writeFile(...args);
          }
        };

        await expect(writeManifestsTransaction([
          { file: firstFile, items: [{ id: 'closet-updated' }] },
          { file: secondFile, items: [{ id: 'sneaker-updated' }] }
        ], {
          fileSystem: injectedFileSystem,
          transactionId
        })).rejects.toThrow(`injected ${failingSuffix} preparation failure`);
        await delayedWriteFinished;

        expect(await readFile(firstFile, 'utf8')).toBe(firstOriginal);
        expect(await readFile(secondFile, 'utf8')).toBe(secondOriginal);
        expect((await readdir(directory)).sort()).toEqual(['closet.json', 'sneakers.json']);
      } finally {
        signalCleanupStarted();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it('replaces both manifests with deterministic JSON and removes transaction artifacts', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'daily-profiles-success-'));
    const firstFile = path.join(directory, 'closet.json');
    const secondFile = path.join(directory, 'sneakers.json');
    const writeManifestsTransaction = enrichmentScript.writeManifestsTransaction;

    try {
      await Promise.all([
        writeFile(firstFile, 'closet original bytes\n'),
        writeFile(secondFile, 'sneaker original bytes\n')
      ]);
      expect(writeManifestsTransaction).toBeTypeOf('function');
      if (typeof writeManifestsTransaction !== 'function') return;

      await writeManifestsTransaction([
        { file: firstFile, items: [{ id: 'closet-updated' }] },
        { file: secondFile, items: [{ id: 'sneaker-updated' }] }
      ], { transactionId: 'success-test' });

      expect(await readFile(firstFile, 'utf8')).toBe('[\n  {\n    "id": "closet-updated"\n  }\n]\n');
      expect(await readFile(secondFile, 'utf8')).toBe('[\n  {\n    "id": "sneaker-updated"\n  }\n]\n');
      expect((await readdir(directory)).sort()).toEqual(['closet.json', 'sneakers.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes only a successful non-dry-run batch with changes', () => {
    expect(shouldWriteManifests({ dryRun: true, failed: 0, enriched: 1 })).toBe(false);
    expect(shouldWriteManifests({ dryRun: false, failed: 1, enriched: 115 })).toBe(false);
    expect(shouldWriteManifests({ dryRun: false, failed: 0, enriched: 0 })).toBe(false);
    expect(shouldWriteManifests({ dryRun: false, failed: 0, enriched: 116 })).toBe(true);
  });
});
