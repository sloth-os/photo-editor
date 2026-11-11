let active:
  | {
      worker: Worker;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  | undefined;
export async function contentAware(
  source: HTMLCanvasElement,
  mask: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, 1000 / Math.max(source.width, source.height)),
    w = Math.max(1, Math.round(source.width * scale)),
    h = Math.max(1, Math.round(source.height * scale)),
    small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d")!;
  ctx.drawImage(source, 0, 0, w, h);
  const mc = document.createElement("canvas");
  mc.width = w;
  mc.height = h;
  const mx = mc.getContext("2d")!;
  mx.drawImage(mask, 0, 0, w, h);
  const rgba = mx.getImageData(0, 0, w, h).data,
    selection = new Uint8Array(w * h);
  for (let i = 0; i < selection.length; i++)
    selection[i] = rgba[i * 4 + 3] > 16 ? 1 : 0;
  if (!selection.some((v) => v)) return source;
  if (active) {
    active.worker.terminate();
    clearTimeout(active.timer);
    active.reject(
      new DOMException("A newer edit replaced this preview.", "AbortError"),
    );
    active = undefined;
  }
  const worker = new Worker(
      new URL("../workers/inpaint.worker.ts", import.meta.url),
      { type: "module" },
    ),
    pixels = ctx.getImageData(0, 0, w, h).data;
  const output = await new Promise<Uint8ClampedArray>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      if (active?.worker === worker) active = undefined;
      reject(
        new Error(
          "This fill took too long. Use a smaller healing area or expansion.",
        ),
      );
    }, 60_000);
    active = { worker, reject, timer };
    worker.onmessage = ({
      data,
    }: {
      data: { pixels?: Uint8ClampedArray; error?: string };
    }) => {
      clearTimeout(timer);
      worker.terminate();
      if (active?.worker === worker) active = undefined;
      if (data.error) reject(new Error(data.error));
      else resolve(data.pixels!);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      if (active?.worker === worker) active = undefined;
      reject(new Error("Content-aware processing could not start."));
    };
    worker.postMessage({ pixels, mask: selection, width: w, height: h }, [
      pixels.buffer,
      selection.buffer,
    ]);
  });
  ctx.putImageData(new ImageData(new Uint8ClampedArray(output), w, h), 0, 0);
  const fill = document.createElement("canvas");
  fill.width = source.width;
  fill.height = source.height;
  const fx = fill.getContext("2d")!;
  fx.drawImage(small, 0, 0, fill.width, fill.height);
  fx.globalCompositeOperation = "destination-in";
  fx.drawImage(mask, 0, 0);
  fx.globalCompositeOperation = "source-over";
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ox = out.getContext("2d")!;
  ox.drawImage(source, 0, 0);
  ox.drawImage(fill, 0, 0);
  return out;
}
