import type { Edit } from "./catalog";

export type Analysis = {
  mask?: string;
  depth?: string;
  faces?: NonNullable<Edit["faces"]>;
  mesh?: NonNullable<Edit["mesh"]>;
};
type Request = {
  id: number;
  kind: "subject" | "depth" | "face";
  image: ImageBitmap;
  base: string;
};
let worker: Worker | undefined,
  sequence = 0;
const pending = new Map<
  number,
  { resolve: (result: Analysis) => void; reject: (error: Error) => void }
>();
export function cancelAnalysis() {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values())
    request.reject(
      new DOMException("Image analysis was cancelled.", "AbortError"),
    );
  pending.clear();
}

export async function analyze(
  image: HTMLCanvasElement,
  kind: Request["kind"],
): Promise<Analysis> {
  if (!worker) {
    worker = new Worker(
      new URL("../workers/intelligence.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({
      data,
    }: {
      data: { id: number; result?: Analysis; error?: string };
    }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result || {});
    };
    worker.onerror = () => {
      for (const p of pending.values())
        p.reject(
          new Error(
            "Local image analysis could not start. Reopen the app after offline installation completes.",
          ),
        );
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const currentWorker = worker;
  const bitmap = await createImageBitmap(image),
    id = ++sequence;
  if (currentWorker !== worker) {
    bitmap.close();
    throw new DOMException("Image analysis was cancelled.", "AbortError");
  }
  const base = new URL(import.meta.env.BASE_URL, location.origin).href;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, kind, image: bitmap, base } satisfies Request, [
      bitmap,
    ]);
  });
}

export function isLocalImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length < 8 * 1024 * 1024 &&
    /^data:image\/(png|jpeg|webp);base64,/.test(value)
  );
}
