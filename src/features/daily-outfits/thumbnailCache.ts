import { fetchImageFingerprint } from './imageFingerprint';
import { idbGet, idbPut } from './storage';
import type { DailySourceItem } from './types';

interface CachedThumbnail {
  fingerprint: string;
  dataUrl: string;
}

const imageFromBlob = (blob: Blob): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Unable to decode wardrobe image'));
  };
  image.src = url;
});

const createThumbnail = async (blob: Blob): Promise<string> => {
  const image = await imageFromBlob(blob);
  const size = 320;
  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL('image/jpeg', 0.78);
};

export const getDailyThumbnail = async (item: DailySourceItem): Promise<CachedThumbnail> => {
  const { blob, fingerprint } = await fetchImageFingerprint(item.image);
  const cacheKey = `${item.id}:${fingerprint}`;
  const cached = await idbGet<CachedThumbnail>('item_thumbnails', cacheKey);
  if (cached?.fingerprint === fingerprint) return cached;
  const result = { fingerprint, dataUrl: await createThumbnail(blob) };
  await idbPut('item_thumbnails', cacheKey, result);
  return result;
};
