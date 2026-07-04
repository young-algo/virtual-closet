// Resize an image file to a square white-backed JPEG data URL — the storage
// format for user-provided imagery. White backgrounds blend into the grey
// wells via mix-blend-mode: multiply, and the cap keeps localStorage small.
export const resizeImageToDataUrl = (blob: Blob, maxDim = 500): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }

      canvas.width = maxDim;
      canvas.height = maxDim;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, maxDim, maxDim);
      ctx.drawImage(img, (maxDim - width) / 2, (maxDim - height) / 2, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
  });
};
