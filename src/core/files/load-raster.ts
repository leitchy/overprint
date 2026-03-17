const SUPPORTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
  'image/bmp',
]);

export function loadRasterImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!SUPPORTED_TYPES.has(file.type) && file.type !== '') {
      reject(new Error(`Unsupported image type: ${file.type}`));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
      img.src = reader.result as string;
    };

    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
