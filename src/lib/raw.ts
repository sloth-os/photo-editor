import type LibRaw from "libraw-wasm";
import type { Params } from "./catalog";
import { metadataFromRaw, type CameraMetadata } from "./metadata";
const metadata = new WeakMap<Blob, CameraMetadata>();
export const rawMetadata = (source: Blob) => metadata.get(source);
const cache = new WeakMap<Blob, Map<string, Promise<HTMLImageElement>>>();

export async function developRaw(
  source: Blob,
  params: Params = {},
): Promise<HTMLImageElement> {
  let entries = cache.get(source);
  if (!entries) {
    entries = new Map();
    cache.set(source, entries);
  }
  const key = JSON.stringify(
    [
      "exposure",
      "highlights",
      "shadows",
      "temperature",
      "tint",
      "saturation",
      "contrast",
      "ambiance",
      "whites",
      "blacks",
    ].map((k) => params[k] || 0),
  );
  if (entries.has(key)) return entries.get(key)!;
  const result = (async () => {
    const module = (await import(
        /* @vite-ignore */ `${import.meta.env.BASE_URL}vendor/libraw/index.js`
      )) as { default: typeof LibRaw },
      decoder = new module.default();
    try {
      await decoder.open(new Uint8Array(await source.arrayBuffer()), {
        useCameraWb: true,
        outputBps: 16,
        outputColor: 1,
        gamm: [1, 1],
        highlight: 2,
        halfSize: source.size > 35 * 1024 * 1024,
      });
      const image = await decoder.imageData();
      const details = await decoder.metadata();
      if (details) metadata.set(source, metadataFromRaw(details));
      if (!image || !image.width || !image.height)
        throw new Error("No image data was found in this RAW file.");
      if (image.width * image.height > 40_000_000)
        throw new Error(
          "Decoded RAW is over 40 megapixels. Export a smaller DNG and try again.",
        );
      const n = (k: string) => Number(params[k] || 0),
        rgba = new Uint8ClampedArray(image.width * image.height * 4),
        gain = 2 ** (n("exposure") / 50),
        red = Math.exp(n("temperature") / 300 + n("tint") / 450),
        green = Math.exp(-n("tint") / 300),
        blue = Math.exp(-n("temperature") / 300 + n("tint") / 450),
        max = image.bits === 16 ? 65535 : 255,
        sat = 1 + n("saturation") / 100;
      const transfer = (v: number) =>
        255 *
        (v <= 0.0031308
          ? 12.92 * v
          : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += image.colors) {
        let r = (image.data[j] / max) * gain * red,
          g = ((image.data[j + 1] ?? image.data[j]) / max) * gain * green,
          b = ((image.data[j + 2] ?? image.data[j]) / max) * gain * blue;
        const contrast = 1 + n("contrast") / 125;
        r = (r - 0.18) * contrast + 0.18;
        g = (g - 0.18) * contrast + 0.18;
        b = (b - 0.18) * contrast + 0.18;
        const l = r * 0.2126 + g * 0.7152 + b * 0.0722,
          shadows = (n("shadows") / 100) * 0.18 * Math.max(0, 1 - l) ** 3,
          highlights = ((n("highlights") / 100) * 0.5 * l * l) / (1 + l);
        r =
          l +
          (r - l) * sat +
          shadows +
          highlights +
          (n("blacks") / 100) * 0.1 * Math.max(0, 1 - l) ** 4 +
          (n("whites") / 100) * 0.25 * l ** 4;
        g =
          l +
          (g - l) * sat +
          shadows +
          highlights +
          (n("blacks") / 100) * 0.1 * Math.max(0, 1 - l) ** 4 +
          (n("whites") / 100) * 0.25 * l ** 4;
        b =
          l +
          (b - l) * sat +
          shadows +
          highlights +
          (n("blacks") / 100) * 0.1 * Math.max(0, 1 - l) ** 4 +
          (n("whites") / 100) * 0.25 * l ** 4;
        rgba[i] = transfer(r);
        rgba[i + 1] = transfer(g);
        rgba[i + 2] = transfer(b);
        rgba[i + 3] = 255;
      }
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      c.getContext("2d")!.putImageData(
        new ImageData(rgba, image.width, image.height),
        0,
        0,
      );
      const url = c.toDataURL("image/png");
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const decoded = new Image();
        decoded.onload = () => resolve(decoded);
        decoded.onerror = () =>
          reject(new Error("The developed RAW bitmap could not be decoded."));
        decoded.src = url;
      });
    } finally {
      decoder.dispose();
    }
  })();
  entries.set(key, result);
  if (entries.size > 2) entries.delete(entries.keys().next().value!);
  result.catch(() => entries!.delete(key));
  return result;
}
