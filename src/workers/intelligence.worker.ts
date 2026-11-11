/// <reference lib="webworker" />
import {
  FilesetResolver,
  ImageSegmenter,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";
import type { Analysis } from "../lib/intelligence";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

let segmenter: Promise<ImageSegmenter> | undefined,
  landmarker: Promise<FaceLandmarker> | undefined;
let depthSession:
  Promise<import("onnxruntime-web").InferenceSession> | undefined;
let queue = Promise.resolve();
async function visionFiles(base: string) {
  const factory = await import(
    /* @vite-ignore */ `${base}vendor/vision/vision_wasm_module_internal.js`
  );
  (globalThis as unknown as { ModuleFactory: unknown }).ModuleFactory =
    factory.default;
  return FilesetResolver.forVisionTasks(`${base}vendor/vision`, true);
}

async function encode(
  values: Float32Array | Uint8Array,
  w: number,
  h: number,
  alpha = true,
): Promise<string> {
  const c = new OffscreenCanvas(w, h),
    ctx = c.getContext("2d")!,
    image = ctx.createImageData(w, h);
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(values[i] * 255)));
    image.data[i * 4] = alpha ? 255 : v;
    image.data[i * 4 + 1] = alpha ? 255 : v;
    image.data[i * 4 + 2] = alpha ? 255 : v;
    image.data[i * 4 + 3] = alpha ? v : 255;
  }
  ctx.putImageData(image, 0, 0);
  const blob = await c.convertToBlob({ type: "image/png" }),
    bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
}

async function subject(image: ImageBitmap, base: string): Promise<Analysis> {
  segmenter ??= (async () =>
    ImageSegmenter.createFromOptions(await visionFiles(base), {
      baseOptions: {
        modelAssetPath: `${base}models/deeplab_v3.tflite`,
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    }))();
  try {
    const model = await segmenter,
      result = model.segment(image),
      category = result.categoryMask;
    if (!category) throw new Error("No segmentation mask was produced.");
    const labels = category.getAsUint8Array(),
      foreground = new Float32Array(labels.length),
      confidence = result.confidenceMasks;
    let selected = 0;
    if (confidence?.[0]) {
      const background = confidence[0].getAsFloat32Array();
      for (let i = 0; i < foreground.length; i++) {
        foreground[i] = 1 - background[i];
        if (foreground[i] > 0.5) selected++;
      }
    } else
      for (let i = 0; i < labels.length; i++) {
        foreground[i] = labels[i] === 0 ? 0 : 1;
        if (foreground[i]) selected++;
      }
    if (selected < Math.max(5, labels.length * 0.001)) {
      result.close();
      throw new Error(
        "No supported subject was found. Try a person, pet, vehicle, plant, or another clear foreground object.",
      );
    }
    const mask = await encode(foreground, category.width, category.height);
    result.close();
    return { mask };
  } catch (error) {
    segmenter = undefined;
    throw error;
  }
}

function triangles(
  connections: { start: number; end: number }[],
): [number, number, number][] {
  const neighbors = new Map<number, Set<number>>();
  for (const { start, end } of connections) {
    if (!neighbors.has(start)) neighbors.set(start, new Set());
    if (!neighbors.has(end)) neighbors.set(end, new Set());
    neighbors.get(start)!.add(end);
    neighbors.get(end)!.add(start);
  }
  const out: [number, number, number][] = [];
  for (const [a, set] of neighbors)
    for (const b of set)
      if (b > a)
        for (const c of set)
          if (c > b && neighbors.get(b)?.has(c)) out.push([a, b, c]);
  return out;
}
async function face(image: ImageBitmap, base: string): Promise<Analysis> {
  landmarker ??= (async () =>
    FaceLandmarker.createFromOptions(await visionFiles(base), {
      baseOptions: {
        modelAssetPath: `${base}models/face_landmarker.task`,
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      numFaces: 5,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
    }))();
  try {
    const result = (await landmarker).detect(image);
    if (!result.faceLandmarks.length)
      throw new Error(
        "No face was found. Choose a clearer, front-facing portrait or use the manual face controls.",
      );
    return {
      faces: result.faceLandmarks.map((points) =>
        points.map((p: NormalizedLandmark) => ({ x: p.x, y: p.y, z: p.z })),
      ),
      mesh: triangles(FaceLandmarker.FACE_LANDMARKS_TESSELATION),
    };
  } catch (error) {
    landmarker = undefined;
    throw error;
  }
}

async function depth(image: ImageBitmap, base: string): Promise<Analysis> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${base}vendor/ort/`;
  depthSession ??= ort.InferenceSession.create(
    `${base}models/depth-anything-v2-small.onnx`,
    { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
  );
  try {
    const session = await depthSession,
      w = 518,
      h = 518,
      c = new OffscreenCanvas(w, h),
      ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data,
      input = new Float32Array(3 * w * h),
      mean = [0.485, 0.456, 0.406],
      std = [0.229, 0.224, 0.225];
    for (let i = 0; i < w * h; i++)
      for (let k = 0; k < 3; k++)
        input[k * w * h + i] = (rgba[i * 4 + k] / 255 - mean[k]) / std[k];
    const output = await session.run({
        [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]),
      }),
      tensor = output[session.outputNames[0]],
      values = tensor.data as Float32Array,
      sorted = Float32Array.from(values).sort(),
      lo = sorted[Math.floor(sorted.length * 0.01)],
      hi = sorted[Math.floor(sorted.length * 0.99)],
      normalized = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++)
      normalized[i] = Math.max(
        0,
        Math.min(1, (values[i] - lo) / Math.max(0.0001, hi - lo)),
      );
    const dims = tensor.dims;
    return {
      depth: await encode(
        normalized,
        Number(dims[dims.length - 1]),
        Number(dims[dims.length - 2]),
        false,
      ),
    };
  } catch (error) {
    depthSession = undefined;
    throw error;
  }
}

self.onmessage = ({
  data,
}: {
  data: {
    id: number;
    kind: "subject" | "face" | "depth";
    image: ImageBitmap;
    base: string;
  };
}) => {
  queue = queue.then(async () => {
    try {
      const result = await (data.kind === "subject"
        ? subject(data.image, data.base)
        : data.kind === "face"
          ? face(data.image, data.base)
          : depth(data.image, data.base));
      self.postMessage({ id: data.id, result });
    } catch (error) {
      self.postMessage({
        id: data.id,
        error:
          error instanceof Error ? error.message : "Local analysis failed.",
      });
    } finally {
      data.image.close();
    }
  });
};
