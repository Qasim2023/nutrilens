/* ==========================================================================
   NutriLens — image helpers
   Resize/compress before sending, and generate tiny thumbnails for history.
   ========================================================================== */

export const MAX_BYTES = 12 * 1024 * 1024;

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Could not read that file."));
    fr.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be decoded as an image."));
    img.src = src;
  });
}

/**
 * Downscale + re-encode an image so requests stay fast and cheap.
 * Returns { dataUrl, width, height, bytes }.
 */
export async function compressImage(file, maxDim = 1280, quality = 0.85) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > MAX_BYTES) throw new Error("That image is larger than 12 MB. Please choose a smaller photo.");

  const original = await readFileAsDataUrl(file);

  const img = await loadImage(original);
  let { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const type = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  let dataUrl = canvas.toDataURL(type, quality);
  // If the result is somehow bigger than the original (small images), keep original.
  if (dataUrl.length > original.length && original.length < 600000) dataUrl = original;

  return { dataUrl, width, height, bytes: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75) };
}

/** Small square-ish thumbnail (data URL) for history entries. */
export async function makeThumbnail(dataUrl, size = 160) {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (_) {
    return null;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}