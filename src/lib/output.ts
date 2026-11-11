import type { Edit } from "./catalog";
import {
  canvas,
  fitDimensions,
  loadImage,
  toBlob,
  renderImage,
} from "./engine";
import { collageLayout } from "./composition";
import { idPhotoDimensions } from "./id-photo";
import {
  withMetadata,
  withPrintDensity,
  type CameraMetadata,
} from "./metadata";
export type Dimensions = { width: number; height: number };
export function exportFileName(name: string, format: string) {
  const base = (name.trim() || "my-photo")
    .replace(/\.(jpe?g|png|webp|avif|bmp|gif|tiff?|heic|dng|arw|nef)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "-");
  return `${base || "my-photo"}.${format === "image/png" ? "png" : format === "image/webp" ? "webp" : "jpg"}`;
}
export function resizedDimensions(
  source: Dimensions,
  mode: string,
  customWidth: string,
  customHeight: string,
  percent: number,
): Dimensions {
  let factor = 1;
  if (mode === "custom") {
    const width = Number(customWidth),
      height = Number(customHeight);
    if (
      ![width, height].every(
        (value) => Number.isFinite(value) && value >= 1 && value <= 6000,
      )
    )
      throw new Error("Enter a width and height from 1 to 6000 pixels.");
    factor = Math.min(1, width / source.width, height / source.height);
  } else if (mode === "percent")
    factor = Math.max(0.01, Math.min(1, percent / 100));
  else if (mode !== "original")
    factor = Math.min(1, Number(mode) / Math.max(source.width, source.height));
  return {
    width: Math.max(1, Math.round(source.width * factor)),
    height: Math.max(1, Math.round(source.height * factor)),
  };
}
/** Mirror geometry without re-running expensive image effects when export controls change. */
export async function measureOutput(
  source: Dimensions,
  edits: Edit[],
  maxDimension = 6000,
): Promise<Dimensions> {
  let size = { ...source };
  for (const edit of edits) {
    const p = edit.params,
      n = (key: string, fallback = 0) => Number(p[key] ?? fallback),
      { width: w, height: h } = size;
    if (edit.tool === "crop")
      size = {
        width: Math.max(
          1,
          Math.round(w * (1 - (n("left") + n("right")) / 100)),
        ),
        height: Math.max(
          1,
          Math.round(h * (1 - (n("top") + n("bottom")) / 100)),
        ),
      };
    else if (edit.tool === "rotate") {
      const angle = ((n("turns") * 90 + n("angle")) * Math.PI) / 180,
        cos = Math.abs(Math.cos(angle)),
        sin = Math.abs(Math.sin(angle));
      size = {
        width: Math.round(w * cos + h * sin),
        height: Math.round(w * sin + h * cos),
      };
    } else if (edit.tool === "expand" || edit.tool === "frames") {
      const pad =
        edit.tool === "expand"
          ? Math.round((Math.min(w, h) * n("amount")) / 100)
          : (Math.min(w, h) * n("width", 5)) / 100;
      size = {
        width: Math.round(w + pad * 2),
        height: Math.round(h + pad * 2),
      };
    } else if (edit.tool === "id-photo") size = idPhotoDimensions(p);
    else if (edit.tool === "collage" && edit.images?.length) {
      const images = await Promise.all(
          edit.images.map((url) => loadImage(url)),
        ),
        layout = collageLayout(
          [
            size,
            ...images.map((image) => ({
              width: image.naturalWidth,
              height: image.naturalHeight,
            })),
          ],
          p,
          Math.max(w, h),
        );
      size = { width: layout.width, height: layout.height };
    }
  }
  return fitDimensions(size.width, size.height, maxDimension);
}
export async function renderForExport(
  photo: Dimensions & { image: HTMLImageElement; rawSource?: Blob },
  edits: Edit[],
  size: Dimensions,
) {
  const native = await measureOutput(photo, edits, Infinity),
    max = Math.min(
      6000,
      Math.ceil(
        (Math.max(photo.width, photo.height) *
          Math.max(size.width, size.height)) /
          Math.max(native.width, native.height),
      ),
    );
  return resize(
    await renderImage(photo.image, edits, Math.max(1, max), photo.rawSource),
    size,
  );
}
function resize(source: HTMLCanvasElement, size: Dimensions) {
  if (source.width === size.width && source.height === size.height)
    return source;
  const out = canvas(size.width, size.height),
    ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}
export async function encodeOutput(
  source: HTMLCanvasElement,
  options: {
    size: Dimensions;
    format: string;
    quality: number;
    targetBytes?: number;
    metadata?: CameraMetadata;
    dpi?: number;
  },
) {
  let image = resize(source, options.size);
  const target = options.targetBytes,
    maxQuality = Math.max(0.1, Math.min(1, options.quality / 100));
  const encode = async (quality: number) => {
    const plain = await toBlob(image, options.format, quality);
    if (plain.type !== options.format)
      throw new Error(
        "This browser cannot save this format. Choose JPG or PNG.",
      );
    const dpi = options.dpi
        ? (options.dpi * image.width) / source.width
        : undefined,
      tagged = await withMetadata(
        plain,
        options.metadata,
        image.width,
        image.height,
        dpi,
      );
    return dpi ? withPrintDensity(tagged, dpi) : tagged;
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    let blob = await encode(maxQuality),
      quality = maxQuality;
    if (!target || blob.size <= target)
      return { blob, width: image.width, height: image.height, quality };
    if (options.format !== "image/png") {
      const minimum = await encode(0.1);
      if (minimum.size <= target) {
        let low = 0.1,
          high = maxQuality;
        blob = minimum;
        quality = 0.1;
        for (let pass = 0; pass < 7; pass++) {
          const q = (low + high) / 2,
            candidate = await encode(q);
          if (candidate.size <= target) {
            low = q;
            blob = candidate;
            quality = q;
          } else high = q;
        }
        return { blob, width: image.width, height: image.height, quality };
      }
      blob = minimum;
    }
    if (options.dpi)
      throw new Error(
        "This file limit is too small to retain the ID photo dimensions. Use JPG or raise the limit.",
      );
    const scale = Math.min(0.9, Math.sqrt(target / blob.size) * 0.9),
      next = {
        width: Math.max(16, Math.floor(image.width * scale)),
        height: Math.max(16, Math.floor(image.height * scale)),
      };
    if (next.width >= image.width || next.height >= image.height) break;
    image = resize(image, next);
  }
  throw new Error(
    "This file-size limit is too small. Choose a larger limit or smaller dimensions.",
  );
}
