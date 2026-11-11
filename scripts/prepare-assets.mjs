import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
const target = new URL("../public/vendor/libraw/", import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ["index.js", "worker.js", "libraw.js", "libraw.wasm"])
  await copyFile(
    new URL(`../node_modules/libraw-wasm/dist/${name}`, import.meta.url),
    new URL(name, target),
  );
for (const [pkg, files, directory] of [
  [
    "@mediapipe/tasks-vision",
    [
      "wasm/vision_wasm_module_internal.js",
      "wasm/vision_wasm_module_internal.wasm",
    ],
    "vision",
  ],
  [
    "onnxruntime-web",
    ["dist/ort-wasm-simd-threaded.wasm", "dist/ort-wasm-simd-threaded.mjs"],
    "ort",
  ],
]) {
  const root = new URL(`../public/vendor/${directory}/`, import.meta.url);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const file of files)
    await copyFile(
      new URL(`../node_modules/${pkg}/${file}`, import.meta.url),
      new URL(file.split("/").pop(), root),
    );
}
const models = {
  "deeplab_v3.tflite":
    "ff36e24d40547fe9e645e2f4e8745d1876d6e38b332d39a82f0bf0f5d1d561b3",
  "face_landmarker.task":
    "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
  "depth-anything-v2-small.onnx":
    "fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d",
};
for (const [name, expected] of Object.entries(models)) {
  const actual = createHash("sha256")
    .update(
      await readFile(new URL(`../public/models/${name}`, import.meta.url)),
    )
    .digest("hex");
  if (actual !== expected) throw new Error(`Model checksum mismatch: ${name}`);
}
const licenses = new URL("../public/licenses/generated/", import.meta.url);
await mkdir(licenses, { recursive: true });
for (const name of [
  "react",
  "react-dom",
  "scheduler",
  "lucide-react",
  "jszip",
  "pako",
  "lie",
  "immediate",
  "setimmediate",
  "readable-stream",
  "qrcode",
  "dijkstrajs",
  "jsqr",
  "workbox-window",
  "workbox-core",
  "workbox-precaching",
  "workbox-routing",
  "workbox-strategies",
  "workbox-expiration",
  "workbox-cacheable-response",
  "@mediapipe/tasks-vision",
  "onnxruntime-web",
  "piexifjs",
]) {
  const root = new URL(`../node_modules/${name}/`, import.meta.url);
  for (const file of (await readdir(root)).filter((f) =>
    /^licen[cs]e(?:\..*)?$/i.test(f),
  )) {
    await writeFile(
      new URL(
        `${name.replace(/\W/g, "-")}-${file.replace(/\W/g, "-")}.txt`,
        licenses,
      ),
      `${name}\n\n${await readFile(new URL(file, root), "utf8")}`,
    );
  }
}
