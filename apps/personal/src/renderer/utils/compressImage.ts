// Canvas-based client-side image compression.
// Input: any Blob/File (typically a pay stub screenshot, potentially 20+ MB).
// Output: a JPEG Blob no larger than ~1-2 MB, max 2000px on the longest edge,
// 85% quality. Preserves readability of pay-stub text / CRM numbers while
// keeping upload payloads small. Users never see a "file too big" error.

const MAX_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.85;

export async function compressImage(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("Canvas.toBlob returned null");
    return blob;
  } finally {
    bitmap.close?.();
  }
}
