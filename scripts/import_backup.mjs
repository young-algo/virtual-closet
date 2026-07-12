import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: node scripts/import_backup.mjs <virtual-closet-backup.json>');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const backup = JSON.parse(await readFile(backupPath, 'utf8'));
if (backup.version !== 1 || !Array.isArray(backup.items) || !Array.isArray(backup.sneakers) || !Array.isArray(backup.outfits)) {
  throw new Error('Unsupported or invalid Virtual Closet backup');
}

const extensionFor = (mime) => ({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
})[mime] ?? 'bin';

const safeId = (value) => value.replace(/[^a-zA-Z0-9_-]+/g, '_');

const externalize = async (dataUrl, folder, filename) => {
  if (!dataUrl?.startsWith('data:')) return dataUrl;
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error(`Unsupported embedded image for ${filename}`);
  const [, mime, encoded] = match;
  const extension = extensionFor(mime);
  if (extension === 'bin') throw new Error(`Unsupported image type ${mime}`);
  const relativePath = `${folder}/${filename}.${extension}`;
  const outputPath = path.join(root, 'public', relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(encoded, 'base64'));
  return `/${relativePath}`;
};

const items = [];
for (const item of backup.items) {
  items.push({
    ...item,
    image: await externalize(item.image, 'closet', `user_${safeId(item.id)}`)
  });
}

const sneakers = [];
for (const sneaker of backup.sneakers) {
  sneakers.push({
    ...sneaker,
    image: await externalize(sneaker.image, 'sneakers', `user_${safeId(sneaker.id)}_side`),
    ...(sneaker.imageTop
      ? { imageTop: await externalize(sneaker.imageTop, 'sneakers', `user_${safeId(sneaker.id)}_top`) }
      : {})
  });
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
await writeFile(path.join(root, 'src/data/closet.json'), json(items));
await writeFile(path.join(root, 'src/data/sneakers.json'), json(sneakers));
await writeFile(path.join(root, 'src/data/outfits.json'), json(backup.outfits));
await writeFile(path.join(root, 'src/data/app-defaults.json'), json({
  packedItemIds: backup.packedItemIds ?? [],
  deletedItemIds: backup.deletedItemIds ?? [],
  deletedSneakerIds: backup.deletedSneakerIds ?? []
}));

console.log(`Imported ${items.length} garments, ${sneakers.length} sneakers, and ${backup.outfits.length} outfits.`);
