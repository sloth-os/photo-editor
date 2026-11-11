import { parseXmp } from "./presets";
import { decodeLookPayload } from "./snapseed";
import { developRaw, rawMetadata } from "./raw";
import { readMetadata, type CameraMetadata } from "./metadata";
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
  rawSource?: Blob;
  metadata?: CameraMetadata;
};

export async function readPhoto(file: File): Promise<Photo> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error(
      "This photo is larger than 100 MB. Please choose a smaller file.",
    );
  let blob: Blob = file;
  const raw = isRaw(file.name);
  if (raw) {
    try {
      const image = await developRaw(file),
        c = canvas(image.naturalWidth, image.naturalHeight);
      c.getContext("2d")!.drawImage(image, 0, 0);
      blob = await toBlob(c, "image/png");
    } catch (error) {
      throw new Error(
        `Could not develop this RAW file. ${error instanceof Error ? error.message : "This camera format may not be supported."}`,
      );
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
      rawSource: raw ? file : undefined,
      metadata: raw ? rawMetadata(file) : await readMetadata(file),
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

export type Recipe = {
  version: 1;
  name: string;
  edits: Edit[];
  nativeSnapseed?: string;
  warnings?: string[];
};
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
    if (
      p.lutPng &&
      !(
        typeof p.lutPng === "string" &&
        /^data:image\/png;base64,/.test(p.lutPng)
      )
    )
      throw new Error("LUT images must be embedded PNG files.");
    if (edit.tool === "curves")
      for (const key of ["curveRGB", "curveRed", "curveGreen", "curveBlue"])
        if (p[key]) {
          let points: unknown;
          try {
            points = JSON.parse(String(p[key]));
          } catch {
            throw new Error("Invalid tone curve in this look.");
          }
          if (
            !Array.isArray(points) ||
            points.length < 2 ||
            points.length > 64 ||
            points.some(
              (point, i) =>
                !Array.isArray(point) ||
                point.length !== 2 ||
                !point.every(
                  (v) =>
                    typeof v === "number" &&
                    Number.isFinite(v) &&
                    v >= 0 &&
                    v <= 1,
                ) ||
                (i > 0 && point[0] <= points![i - 1][0]),
            )
          )
            throw new Error("Invalid tone curve in this look.");
        }
    if (edit.image && !/^data:image\/(png|jpeg|webp);base64,/.test(edit.image))
      throw new Error("Only embedded image overlays are allowed in looks.");
    for (const field of ["mask", "depth"] as const)
      if (
        edit[field] &&
        (typeof edit[field] !== "string" ||
          edit[field]!.length > 8 * 1024 * 1024 ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(edit[field]!))
      )
        throw new Error(
          "Only embedded masks and depth maps are allowed in looks.",
        );
    if (
      edit.faces &&
      (!Array.isArray(edit.faces) ||
        edit.faces.length > 5 ||
        edit.faces.some(
          (face) =>
            !Array.isArray(face) ||
            face.length < 468 ||
            face.length > 478 ||
            face.some(
              (point) =>
                !point ||
                ![point.x, point.y, point.z].every(
                  (v) =>
                    typeof v === "number" &&
                    Number.isFinite(v) &&
                    Math.abs(v) <= 5,
                ),
            ),
        ))
    )
      throw new Error("Invalid face landmarks in this look.");
    if (
      edit.mesh &&
      (!Array.isArray(edit.mesh) ||
        edit.mesh.length > 2000 ||
        !edit.faces?.length ||
        edit.mesh.some(
          (triangle) =>
            !Array.isArray(triangle) ||
            triangle.length !== 3 ||
            triangle.some(
              (index) =>
                !Number.isInteger(index) ||
                index < 0 ||
                edit.faces!.some((face) => index >= face.length),
            ),
        ))
    )
      throw new Error("Invalid face mesh in this look.");
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
  return {
    version: 1,
    name: r.name,
    edits,
    ...(typeof r.nativeSnapseed === "string" &&
    r.nativeSnapseed.length < 200000 &&
    /^https:\/\/(www\.)?snapseed\.com\/qr\?l=/.test(r.nativeSnapseed)
      ? { nativeSnapseed: r.nativeSnapseed }
      : {}),
    ...(Array.isArray(r.warnings)
      ? {
          warnings: r.warnings
            .filter((v) => typeof v === "string")
            .slice(0, 10)
            .map((v) => v.slice(0, 500)),
        }
      : {}),
  };
}

export { parseXmp } from "./presets";
/** The 200-edit interchange limit must never discard a larger local project. */
export function validateProjectEdits(edits: Edit[]): Edit[] {
  if (!Array.isArray(edits)) throw new Error("Invalid saved edit stack.");
  return edits.flatMap(
    (edit) =>
      validateRecipe({
        version: 1,
        name: "Recovered adjustment",
        edits: [edit],
      }).edits,
  );
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
      "Use a square LUT PNG (8×8, 27×27, 64×64, 125×125, 216×216, 343×343, or 512×512). Choose Hald or tiled layout after import.",
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
export async function blobDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("The local file could not be read."));
    reader.readAsDataURL(file);
  });
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
    if (code) return [validateRecipe(await decodeLookPayload(code.data))];
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
              params: {
                strength: 100,
                cube,
                lutName: file.name,
                lutPng: await blobDataUrl(file),
                lutLayout: "hald",
              },
            },
          ],
        },
      ];
    }
    throw new Error("No Still QR look was found in this image.");
  }
  if (/\.xmp$/i.test(file.name))
    return [validateRecipe(parseXmp(await file.text()))];
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
  return [validateRecipe(await decodeLookPayload(await file.text()))];
}
