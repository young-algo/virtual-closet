import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const apps = (file: string): string =>
  readFileSync(join(process.cwd(), 'apps-script/daily-outfits-v2', file), 'utf8');

export const evaluateAppsScript = <T>(
  files: string[],
  returnExpression: string,
  scope: Record<string, unknown> = {}
): T => {
  const runtimeFiles = files.includes('Planner.gs') && !files.includes('ShoeRotation.gs')
    ? ['ShoeRotation.gs', ...files]
    : files;
  const names = Object.keys(scope);
  const values = Object.values(scope);
  const source = runtimeFiles.map(apps).join('\n');
  return new Function(...names, `${source}\nreturn ${returnExpression};`)(...values) as T;
};
