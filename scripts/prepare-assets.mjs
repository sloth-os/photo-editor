import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
const target = new URL("../public/vendor/libraw/", import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ["index.js", "worker.js", "libraw.js", "libraw.wasm"])
  await copyFile(
    new URL(`../node_modules/libraw-wasm/dist/${name}`, import.meta.url),
    new URL(name, target),
  );
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
]) {
  const root = new URL(`../node_modules/${name}/`, import.meta.url);
  for (const file of (await readdir(root)).filter((f) =>
    /^licen[cs]e(?:\..*)?$/i.test(f),
  )) {
    await writeFile(
      new URL(`${name}-${file.replace(/\W/g, "-")}.txt`, licenses),
      `${name}\n\n${await readFile(new URL(file, root), "utf8")}`,
    );
  }
}
