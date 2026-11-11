import piexif from "piexifjs";
export type CameraMetadata = { exif?: string };
const binary = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192)
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
};
export async function readMetadata(
  file: Blob,
): Promise<CameraMetadata | undefined> {
  const bytes = new Uint8Array(
    await file.slice(0, 2 * 1024 * 1024).arrayBuffer(),
  );
  const png = bytes[0] === 137 && binary(bytes.subarray(1, 4)) === "PNG",
    webp =
      binary(bytes.subarray(0, 4)) === "RIFF" &&
      binary(bytes.subarray(8, 12)) === "WEBP";
  if (png || webp) {
    for (
      let p = png ? 8 : 12, count = 0;
      p + 8 <= file.size && count++ < 10000;
    ) {
      const header = new Uint8Array(await file.slice(p, p + 8).arrayBuffer()),
        view = new DataView(header.buffer),
        length = view.getUint32(png ? 0 : 4, !png),
        kind = binary(header.subarray(png ? 4 : 0, png ? 8 : 4)),
        end = p + 8 + length + (png ? 4 : length % 2);
      if (end > file.size) break;
      if (kind === (png ? "eXIf" : "EXIF") && length <= 1024 * 1024) {
        const value = binary(
          new Uint8Array(await file.slice(p + 8, p + 8 + length).arrayBuffer()),
        );
        return {
          exif: value.startsWith("Exif\0\0") ? value : "Exif\0\0" + value,
        };
      }
      p = end;
    }
    return undefined;
  }
  if (bytes[0] !== 255 || bytes[1] !== 216) return undefined;
  for (let p = 2; p + 4 < bytes.length;) {
    if (bytes[p] !== 255) break;
    const marker = bytes[p + 1];
    if (marker === 218 || marker === 217) break;
    const length = bytes[p + 2] * 256 + bytes[p + 3];
    if (length < 2 || p + 2 + length > bytes.length) break;
    if (marker === 225 && binary(bytes.subarray(p + 4, p + 10)) === "Exif\0\0")
      return { exif: binary(bytes.subarray(p + 4, p + 2 + length)) };
    p += 2 + length;
  }
  return undefined;
}
export function metadataFromRaw(meta: {
  camera_make?: string;
  camera_model?: string;
  iso_speed?: number;
  shutter?: number;
  aperture?: number;
  focal_len?: number;
  timestamp?: Date;
}): CameraMetadata {
  const tags: {
    "0th": Record<number, unknown>;
    Exif: Record<number, unknown>;
  } = { "0th": {}, Exif: {} };
  if (meta.camera_make) tags["0th"][piexif.ImageIFD.Make] = meta.camera_make;
  if (meta.camera_model) tags["0th"][piexif.ImageIFD.Model] = meta.camera_model;
  for (const [value, key] of [
    [meta.shutter, piexif.ExifIFD.ExposureTime],
    [meta.aperture, piexif.ExifIFD.FNumber],
    [meta.focal_len, piexif.ExifIFD.FocalLength],
  ])
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      tags.Exif[key!] = [Math.round(value * 1000000), 1000000];
  if (meta.iso_speed && Number.isFinite(meta.iso_speed))
    tags.Exif[piexif.ExifIFD.ISOSpeedRatings] = Math.min(
      65535,
      Math.round(meta.iso_speed),
    );
  if (
    meta.timestamp instanceof Date &&
    Number.isFinite(meta.timestamp.getTime())
  )
    tags.Exif[piexif.ExifIFD.DateTimeOriginal] = meta.timestamp
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")
      .replace(/-/g, ":");
  return { exif: piexif.dump(tags) };
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(name: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12),
    view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(name), 4);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
}
function ascii(value: string) {
  return Uint8Array.from(value, (ch) => ch.charCodeAt(0));
}
export async function withMetadata(
  blob: Blob,
  metadata: CameraMetadata | undefined,
  width: number,
  height: number,
): Promise<Blob> {
  if (!metadata?.exif) return blob;
  const tags = piexif.load(metadata.exif);
  tags["0th"] ??= {};
  tags.Exif ??= {};
  tags["0th"][piexif.ImageIFD.Orientation] = 1;
  tags["0th"][piexif.ImageIFD.ImageWidth] = width;
  tags["0th"][piexif.ImageIFD.ImageLength] = height;
  tags.Exif[piexif.ExifIFD.PixelXDimension] = width;
  tags.Exif[piexif.ExifIFD.PixelYDimension] = height;
  tags.Exif[piexif.ExifIFD.ColorSpace] = 1;
  delete tags.thumbnail;
  tags["1st"] = {};
  const exif = ascii(piexif.dump(tags)),
    bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === "image/jpeg") {
    if (exif.length > 65533)
      throw new Error(
        "Camera metadata is too large to preserve. Turn metadata preservation off and try again.",
      );
    const header = new Uint8Array([
      255,
      225,
      (exif.length + 2) >> 8,
      (exif.length + 2) & 255,
    ]);
    return new Blob([bytes.subarray(0, 2), header, exif, bytes.subarray(2)], {
      type: blob.type,
    });
  }
  if (blob.type === "image/png")
    return new Blob(
      [
        bytes.subarray(0, 33),
        pngChunk("eXIf", exif.subarray(6)),
        bytes.subarray(33),
      ],
      { type: blob.type },
    );
  if (blob.type === "image/webp") {
    const header = new Uint8Array(bytes.subarray(0, 12)),
      chunks: Uint8Array[] = [];
    let hasExtended = false;
    for (let p = 12; p + 8 <= bytes.length;) {
      const name = binary(bytes.subarray(p, p + 4)),
        length = new DataView(
          bytes.buffer,
          bytes.byteOffset + p + 4,
          4,
        ).getUint32(0, true),
        end = p + 8 + length + (length % 2);
      if (end > bytes.length) throw new Error("Invalid WebP export.");
      if (name === "VP8X") {
        const chunk = bytes.slice(p, end);
        chunk[8] |= 8;
        chunks.push(chunk);
        hasExtended = true;
      } else if (name !== "EXIF") chunks.push(bytes.slice(p, end));
      p = end;
    }
    if (!hasExtended) {
      const extended = new Uint8Array(18);
      extended.set(ascii("VP8X"));
      new DataView(extended.buffer).setUint32(4, 10, true);
      extended[8] = 8;
      for (let k = 0; k < 3; k++) {
        extended[12 + k] = ((width - 1) >> (k * 8)) & 255;
        extended[15 + k] = ((height - 1) >> (k * 8)) & 255;
      }
      chunks.unshift(extended);
    }
    const chunk = new Uint8Array(8 + exif.length + (exif.length % 2));
    chunk.set(ascii("EXIF"));
    new DataView(chunk.buffer).setUint32(4, exif.length, true);
    chunk.set(exif, 8);
    chunks.push(chunk);
    new DataView(header.buffer).setUint32(
      4,
      4 + chunks.reduce((n, c) => n + c.length, 0),
      true,
    );
    return new Blob([header, ...chunks], { type: blob.type });
  }
  return blob;
}
