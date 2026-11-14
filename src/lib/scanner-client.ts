import { canvas, fitDimensions, loadImage, toBlob } from "./engine";
import { readPhoto } from "./files";
import {
  defaultScanSettings,
  fullPage,
  type ScanPage,
  type ScanQuad,
  type ScanSettings,
} from "./scanner-types";
import type { detectDocument } from "./scanner";

export class ScanProcessor {
  private worker: Worker | undefined;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  private request(
    operation: "detect" | "render",
    source: HTMLCanvasElement,
    options: { corners?: ScanQuad; settings?: ScanSettings; max?: number } = {},
  ) {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./scanner.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = (event) => {
        const job = this.pending.get(event.data.id);
        if (!job) return;
        this.pending.delete(event.data.id);
        if (event.data.error) job.reject(new Error(event.data.error));
        else job.resolve(event.data.result);
      };
      this.worker.onerror = () =>
        this.dispose(
          new Error(
            "Document processing stopped. Try opening the scanner again.",
          ),
        );
    }
    const id = ++this.nextId,
      data = source
        .getContext("2d", { willReadFrequently: true })!
        .getImageData(0, 0, source.width, source.height).data.buffer;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage(
        {
          id,
          operation,
          width: source.width,
          height: source.height,
          data,
          ...options,
        },
        [data],
      );
    });
  }
  async detect(source: HTMLCanvasElement) {
    const size = fitDimensions(source.width, source.height, 480),
      small = canvas(size.width, size.height);
    small.getContext("2d")!.drawImage(source, 0, 0, size.width, size.height);
    return (await this.request("detect", small)) as ReturnType<
      typeof detectDocument
    >;
  }
  async render(
    source: HTMLCanvasElement,
    corners: ScanQuad,
    settings: ScanSettings,
    max = 3200,
  ) {
    const result = (await this.request("render", source, {
        corners,
        settings,
        max,
      })) as { width: number; height: number; data: ArrayBuffer },
      out = canvas(result.width, result.height);
    out
      .getContext("2d")!
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(result.data),
          result.width,
          result.height,
        ),
        0,
        0,
      );
    return out;
  }
  dispose(reason: Error = new DOMException("Scan cancelled.", "AbortError")) {
    this.worker?.terminate();
    this.worker = undefined;
    for (const job of this.pending.values()) job.reject(reason);
    this.pending.clear();
  }
}

export async function scanSource(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url, false),
      size = fitDimensions(image.naturalWidth, image.naturalHeight, 3200),
      scale = Math.min(1, Math.sqrt(8000000 / (size.width * size.height))),
      c = canvas(
        Math.floor(size.width * scale),
        Math.floor(size.height * scale),
      );
    c.getContext("2d")!.fillStyle = "#ffffff";
    c.getContext("2d")!.fillRect(0, 0, c.width, c.height);
    c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function scanThumbnail(source: HTMLCanvasElement) {
  const size = fitDimensions(source.width, source.height, 180),
    thumb = canvas(size.width, size.height);
  thumb.getContext("2d")!.drawImage(source, 0, 0, size.width, size.height);
  return thumb.toDataURL("image/jpeg", 0.75);
}
export async function importScanPage(
  file: File,
  processor: ScanProcessor,
): Promise<ScanPage> {
  const photo = await readPhoto(file),
    source = await scanSource(photo.blob),
    detected = await processor.detect(source);
  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Page",
    source: await toBlob(source, "image/jpeg", 0.96),
    width: source.width,
    height: source.height,
    thumbnail: scanThumbnail(source),
    corners: detected?.corners || fullPage(),
    detected: !!detected,
    settings: defaultScanSettings(),
  };
}
