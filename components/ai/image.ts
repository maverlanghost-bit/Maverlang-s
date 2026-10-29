/** Lado largo de la foto antes de enviarla al asistente. */
export const MAX_EDGE = 1600;
const MAX_BYTES = 15 * 1024 * 1024;
const JPEG_QUALITY = 0.82;

export type ImagePrepCode = "type" | "size" | "fail";

export class ImagePrepError extends Error {
  readonly code: ImagePrepCode;

  constructor(code: ImagePrepCode) {
    super(code);
    this.name = "ImagePrepError";
    this.code = code;
  }
}

export function fittedSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const safeW = Number.isFinite(width) && width > 0 ? width : 1;
  const safeH = Number.isFinite(height) && height > 0 ? height : 1;
  const edge = Math.max(safeW, safeH);
  if (edge <= maxEdge) return { width: Math.round(safeW), height: Math.round(safeH) };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

function isAllowed(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/png") return true;
  if (type && type !== "application/octet-stream") return false;
  return /\.(jpe?g|png)$/i.test(file.name);
}

type Loaded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function loadBitmap(file: File): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new ImagePrepError("fail"));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:image/jpeg")) resolve(result);
      else reject(new ImagePrepError("fail"));
    };
    reader.onerror = () => reject(new ImagePrepError("fail"));
    reader.readAsDataURL(blob);
  });
}

/** Baja la foto a JPEG de ~1600 px. El original no se envía. */
export async function compressImageFile(file: File): Promise<string> {
  if (!isAllowed(file)) throw new ImagePrepError("type");
  if (file.size > MAX_BYTES) throw new ImagePrepError("size");
  const bitmap = await loadBitmap(file);
  try {
    const size = fittedSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImagePrepError("fail");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap.source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((next) => resolve(next), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) throw new ImagePrepError("fail");
    return await blobToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}
