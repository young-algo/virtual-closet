import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const featureRoot = join(process.cwd(), 'src/features/daily-outfits');
const files = readdirSync(featureRoot).filter(file => /\.(ts|tsx)$/.test(file));

describe('on-demand stylist isolation', () => {
  it('does not import AIStylist or call generateOutfit', () => {
    for (const file of files) {
      const source = readFileSync(join(featureRoot, file), 'utf8');
      expect(source, file).not.toMatch(/components\/AIStylist|generateOutfit\s*\(/);
    }
  });

  it('does not directly write localStorage outside the storage gateway', () => {
    for (const file of files.filter(file => file !== 'storage.ts')) {
      const source = readFileSync(join(featureRoot, file), 'utf8');
      expect(source, file).not.toMatch(/localStorage\.setItem/);
    }
  });

  it('leaves the protected on-demand runtime files unreferenced by the Apps Script sidecar', () => {
    const appsScriptRoot = join(process.cwd(), 'apps-script/daily-outfits-v2');
    const combined = readdirSync(appsScriptRoot).filter(file => statSync(join(appsScriptRoot, file)).isFile()).map(file => readFileSync(join(appsScriptRoot, file), 'utf8')).join('\n');
    expect(combined).not.toMatch(/stylist_recent_item_ids|closet_outfits|generateOutfit|AIStylist/);
  });
});
