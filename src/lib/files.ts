import type LibRaw from "libraw-wasm";
import { canvas, fitDimensions, loadImage, toBlob } from "./engine";
import type { Edit, Params } from "./catalog";
import { defaults, tools, looks } from "./catalog";
import { parseCube } from "./color";

export const ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,image/bmp,image/gif,.dng,.cr2,.cr3,.nef,.arw,.raf,.rw2,.orf,.pef,.srw";
export const isRaw = (name: string) =>
  /\.(dng|cr2|cr3|nef|arw|raf|rw2|orf|pef|srw)$/i.test(name);
export type Photo = {
  image: HTMLImageElement;
  blob: Blob;
  name: string;
  width: number;
  height: number;
  size: number;
  raw: boolean;
};

export async function readPhoto(file: File): Promise<Photo> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error(
      "This photo is larger than 100 MB. Please choose a smaller file.",
    );
  let blob: Blob = file;
  const raw = isRaw(file.name);
  if (raw) {
    const module = (await import(
      /* @vite-ignore */ `${import.meta.env.BASE_URL}vendor/libraw/index.js`
    )) as { default: typeof LibRaw };
    const decoder = new module.default();
    try {
      await decoder.open(new Uint8Array(await file.arrayBuffer()), {
        useCameraWb: true,
        outputBps: 8,
        outputColor: 1,
        halfSize: file.size > 35 * 1024 * 1024,
      });
      const result = await decoder.imageData();
      if (!result || !result.width || !result.height)
        throw new Error("No image data was found in this RAW file.");
      if (result.width * result.height > 40_000_000)
        throw new Error(
          "Decoded RAW is over 40 megapixels. Export a smaller DNG and try again.",
        );
      const rgba = new Uint8ClampedArray(result.width * result.height * 4);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += result.colors) {
        rgba[i] = result.data[j];
        rgba[i + 1] = result.data[j + 1] ?? result.data[j];
        rgba[i + 2] = result.data[j + 2] ?? result.data[j];
        rgba[i + 3] = 255;
      }
      const c = canvas(result.width, result.height);
      c.getContext("2d")!.putImageData(
        new ImageData(rgba, result.width, result.height),
        0,
        0,
      );
      blob = await toBlob(c, "image/png");
    } catch (error) {
      throw new Error(
        `Could not develop this RAW file. ${error instanceof Error ? error.message : "This camera format may not be supported."}`,
      );
    } finally {
      decoder.dispose();
    }
  } else if (
    !file.type.startsWith("image/") &&
    !/\.(jpe?g|png|webp|avif|bmp|gif)$/i.test(file.name)
  )
    throw new Error(
      "Choose a JPG, PNG, WebP, AVIF, BMP, GIF, or supported camera RAW.",
    );
  let url = URL.createObjectURL(blob);
  try {
    let image = await loadImage(url, false);
    if (image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error(
        "This image is over 40 megapixels. Please resize it before opening.",
      );
    // Limit the working bitmap for predictable memory use on mobile.
    if (Math.max(image.naturalWidth, image.naturalHeight) > 6000) {
      const dim = fitDimensions(image.naturalWidth, image.naturalHeight, 6000),
        c = canvas(dim.width, dim.height);
      c.getContext("2d")!.drawImage(image, 0, 0, dim.width, dim.height);
      blob = await toBlob(c, "image/png");
      URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      image = await loadImage(url, false);
    }
    return {
      image,
      blob,
      name: file.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      size: file.size,
      raw,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function fileSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(size / 1024)} KB`;
}

export type Recipe = { version: 1; name: string; edits: Edit[] };
export function validateRecipe(value: unknown): Recipe {
  if (!value || typeof value !== "object")
    throw new Error("This is not a Still look.");
  const r = value as Recipe;
  if (
    r.version !== 1 ||
    !Array.isArray(r.edits) ||
    r.edits.length > 200 ||
    typeof r.name !== "string" ||
    r.name.length > 100
  )
    throw new Error(
      "This look is not supported. Use a Still .json look file with up to 200 adjustments.",
    );
  const ids = new Set([...tools.map((t) => t.id), "look"]);
  const edits = r.edits.map((edit) => {
    if (
      !edit ||
      !ids.has(edit.tool) ||
      !edit.params ||
      typeof edit.params !== "object" ||
      Array.isArray(edit.params)
    )
      throw new Error("This look contains an unknown tool.");
    const d = defaults(edit.tool),
      tool = tools.find((t) => t.id === edit.tool),
      p: Params = { ...d };
    for (const [key, value] of Object.entries(edit.params)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        const control = tool?.controls.find((c) => c.key === key);
        p[key] = control
          ? Math.max(control.min, Math.min(control.max, value))
          : Math.max(-1000, Math.min(1000, value));
      } else if (typeof value === "string" && value.length <= 8 * 1024 * 1024)
        p[key] = value;
      else throw new Error("This look contains invalid values.");
    }
    if (edit.tool === "look" && !looks.some((l) => l.id === p.look))
      throw new Error("This look references an unknown filter.");
    if (edit.tool === "lut" && p.cube) parseCube(String(p.cube));
    if (edit.image && !/^data:image\/(png|jpeg|webp);base64,/.test(edit.image))
      throw new Error("Only embedded image overlays are allowed in looks.");
    const points = edit.points;
    if (
      points &&
      (!Array.isArray(points) ||
        points.length > 20_000 ||
        points.some(
          (pt) =>
            !pt ||
            !["x", "y", "radius", "amount"].every(
              (k) =>
                typeof pt[k as keyof typeof pt] === "number" &&
                Number.isFinite(pt[k as keyof typeof pt]),
            ) ||
            pt.x < 0 ||
            pt.x > 1 ||
            pt.y < 0 ||
            pt.y > 1 ||
            pt.radius <= 0 ||
            pt.radius > 1,
        ))
    )
      throw new Error("Invalid brush strokes in this look.");
    return { ...edit, id: crypto.randomUUID(), params: p };
  });
  return { version: 1, name: r.name, edits };
}

export function parseXmp(text: string): Recipe {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Invalid XMP file.");
  const p = defaults("tune"),
    map: Record<string, string> = {
      Exposure2012: "exposure",
      Contrast2012: "contrast",
      Highlights2012: "highlights",
      Shadows2012: "shadows",
      Saturation: "saturation",
      Vibrance: "ambiance",
      Temperature: "warmth",
    };
  let count = 0;
  for (const el of Array.from(xml.getElementsByTagName("*")))
    for (const attr of Array.from(el.attributes)) {
      const key = map[attr.localName],
        v = Number(attr.value);
      if (!key || !Number.isFinite(v)) continue;
      const adjusted =
        attr.localName === "Temperature"
          ? (v - 5500) / 50
          : attr.localName === "Exposure2012"
            ? v * 35
            : v;
      p[key] = Math.max(-100, Math.min(100, adjusted));
      count++;
    }
  if (!count)
    throw new Error(
      "No supported Camera Raw tone settings were found in this XMP.",
    );
  return {
    version: 1,
    name: "Imported XMP",
    edits: [{ id: crypto.randomUUID(), tool: "tune", params: p }],
  };
}

export async function fileToDataUrl(file: File): Promise<string> {
  const photo = await readPhoto(file),
    dim = fitDimensions(photo.width, photo.height, 2400),
    c = canvas(dim.width, dim.height);
  c.getContext("2d")!.drawImage(photo.image, 0, 0, dim.width, dim.height);
  return c.toDataURL("image/jpeg", 0.9);
}

export async function pngToCube(file: File): Promise<string> {
  const photo = await readPhoto(file),
    size = Math.round(Math.cbrt(photo.width * photo.height));
  if (
    photo.width !== photo.height ||
    size < 2 ||
    size > 64 ||
    size ** 3 !== photo.width * photo.height
  )
    throw new Error(
      "Use a square Hald CLUT PNG (8×8, 27×27, 64×64, 125×125, 216×216, 343×343, or 512×512). Tiled LUT images are not supported.",
    );
  const c = canvas(photo.width, photo.height),
    ctx = c.getContext("2d")!;
  ctx.drawImage(photo.image, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height),
    rows = [`LUT_3D_SIZE ${size}`];
  for (let i = 0; i < data.length; i += 4)
    rows.push(
      `${(data[i] / 255).toFixed(5)} ${(data[i + 1] / 255).toFixed(5)} ${(data[i + 2] / 255).toFixed(5)}`,
    );
  return rows.join("\n");
}

export async function importLookFile(file: File): Promise<Recipe[]> {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Please use a look file smaller than 8 MB.");
  if (/\.zip$/i.test(file.name)) {
    const { default: JSZip } = await import("jszip"),
      zip = await JSZip.loadAsync(file),
      entries = Object.values(zip.files).filter(
        (e) => !e.dir && /\.(json|xmp|cube)$/i.test(e.name),
      );
    if (!entries.length || entries.length > 20)
      throw new Error(
        "A pack must contain 1–20 JSON, XMP, or .cube look files.",
      );
    let total = 0;
    const recipes: Recipe[] = [];
    for (const entry of entries) {
      // Stream with a byte limit rather than fully expanding an untrusted ZIP member.
      const text = await new Promise<string>((resolve, reject) => {
        type ZipStream = {
          on: (
            event: string,
            fn:
              | ((chunk: Uint8Array) => void)
              | ((error: Error) => void)
              | (() => void),
          ) => void;
          pause: () => void;
          resume: () => void;
        };
        const chunks: Uint8Array[] = [];
        let size = 0;
        const stream = (
          entry as unknown as { internalStream: (type: string) => ZipStream }
        ).internalStream("uint8array");
        stream.on("data", (chunk: Uint8Array) => {
          size += chunk.length;
          total += chunk.length;
          if (size > 8 * 1024 * 1024 || total > 12 * 1024 * 1024) {
            stream.pause();
            reject(new Error("This look pack expands beyond the 12 MB limit."));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("error", reject);
        stream.on("end", () => {
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(new TextDecoder().decode(bytes));
        });
        stream.resume();
      });
      recipes.push(...(await importLookFile(new File([text], entry.name))));
    }
    return recipes;
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(file.name)) {
    const [{ default: jsQR }, p] = await Promise.all([
        import("jsqr"),
        readPhoto(file),
      ]),
      dim = fitDimensions(p.width, p.height, 1800),
      c = canvas(dim.width, dim.height),
      ctx = c.getContext("2d")!;
    ctx.drawImage(p.image, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height),
      code = jsQR(data.data, c.width, c.height);
    if (code) return [validateRecipe(JSON.parse(code.data))];
    if (/\.png$/i.test(file.name)) {
      const cube = await pngToCube(file);
      return [
        {
          version: 1,
          name: file.name.replace(/\.png$/i, ""),
          edits: [
            {
              id: crypto.randomUUID(),
              tool: "lut",
              params: { strength: 100, cube, lutName: file.name },
            },
          ],
        },
      ];
    }
    throw new Error("No Still QR look was found in this image.");
  }
  if (/\.xmp$/i.test(file.name)) return [parseXmp(await file.text())];
  if (/\.cube$/i.test(file.name)) {
    const cube = await file.text();
    parseCube(cube);
    return [
      {
        version: 1,
        name: file.name.replace(/\.cube$/i, ""),
        edits: [
          {
            id: crypto.randomUUID(),
            tool: "lut",
            params: { strength: 100, cube, lutName: file.name },
          },
        ],
      },
    ];
  }
  return [validateRecipe(JSON.parse(await file.text()))];
}
