const bytesToHex = (bytes: Uint8Array): string => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

export const hashBytes = async (value: ArrayBuffer): Promise<string> =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', value)));

export const hashText = async (value: string): Promise<string> =>
  hashBytes(new TextEncoder().encode(value).buffer);

export const fetchImageFingerprint = async (source: string): Promise<{ blob: Blob; fingerprint: string }> => {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to load wardrobe image (${response.status})`);
  const blob = await response.blob();
  return { blob, fingerprint: await hashBytes(await blob.arrayBuffer()) };
};
