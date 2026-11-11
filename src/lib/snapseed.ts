import type { Recipe } from "./files";
import { defaults, type Edit } from "./catalog";
type Field = { id: number; wire: number; value: number | Uint8Array };
function parse(bytes: Uint8Array): Field[] {
  let offset = 0;
  const fields: Field[] = [];
  const number = () => {
    let value = 0,
      shift = 0;
    for (let i = 0; i < 10; i++) {
      if (offset >= bytes.length) throw new Error("Truncated Snapseed data.");
      const b = bytes[offset++];
      value += (b & 127) * 2 ** shift;
      if (!(b & 128)) return value;
      shift += 7;
    }
    throw new Error("Invalid Snapseed integer.");
  };
  while (offset < bytes.length) {
    const tag = number(),
      id = Math.floor(tag / 8),
      wire = tag % 8;
    if (!id || id > 536870911 || fields.length > 10000)
      throw new Error("Invalid Snapseed field.");
    let value: number | Uint8Array;
    if (wire === 0) value = number();
    else if (wire === 2) {
      const length = number();
      if (length < 0 || length > bytes.length - offset)
        throw new Error("Truncated Snapseed block.");
      value = bytes.slice(offset, offset + length);
      offset += length;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length)
        throw new Error("Truncated Snapseed float.");
      value = new DataView(
        bytes.buffer,
        bytes.byteOffset + offset,
        4,
      ).getFloat32(0, true);
      offset += 4;
    } else if (wire === 1) {
      if (offset + 8 > bytes.length)
        throw new Error("Truncated Snapseed number.");
      value = new DataView(
        bytes.buffer,
        bytes.byteOffset + offset,
        8,
      ).getFloat64(0, true);
      offset += 8;
    } else throw new Error("Unsupported Snapseed wire format.");
    fields.push({ id, wire, value });
  }
  return fields;
}
async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream("gzip")),
    reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new Error("This Snapseed look expands beyond the 1 MB limit.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export async function importSnapseed(value: string): Promise<Recipe> {
  const url = new URL(value);
  if (
    !["snapseed.com", "www.snapseed.com"].includes(url.hostname) ||
    url.pathname !== "/qr"
  )
    throw new Error("This is not a supported Snapseed look link.");
  const encoded = url.searchParams.get("l");
  if (!encoded || encoded.length > 200000)
    throw new Error("Invalid Snapseed QR payload.");
  let compressed: Uint8Array;
  try {
    compressed = Uint8Array.from(
      atob(encoded.replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=")),
      (ch) => ch.charCodeAt(0),
    );
  } catch {
    throw new Error("Invalid Snapseed QR encoding.");
  }
  const fields = parse(await decompress(compressed)),
    edits: Edit[] = [],
    unsupported: number[] = [];
  for (const step of fields.filter(
    (field) => field.id === 2 && field.value instanceof Uint8Array,
  )) {
    for (const operation of parse(step.value as Uint8Array)) {
      if (!(operation.value instanceof Uint8Array)) continue;
      const params = parse(operation.value);
      if (operation.id === 70516243) {
        const p = defaults("tune"),
          keys = [
            "brightness",
            "contrast",
            "saturation",
            "ambiance",
            "highlights",
            "shadows",
            "warmth",
          ];
        for (const field of params)
          if (
            field.id >= 1 &&
            field.id <= 7 &&
            typeof field.value === "number" &&
            Number.isFinite(field.value)
          )
            p[keys[field.id - 1]] = Math.round(
              Math.max(-100, Math.min(100, field.value * 100)),
            );
        edits.push({ id: crypto.randomUUID(), tool: "tune", params: p });
      } else if (operation.id === 139220080) {
        const p = defaults("curves"),
          channels: Record<number, string> = {
            3: "curveRGB",
            4: "curveRed",
            5: "curveGreen",
            6: "curveBlue",
            7: "curveLuma",
          };
        for (const field of params) {
          if (
            !channels[field.id] ||
            !(field.value instanceof Uint8Array) ||
            field.value.length < 8 ||
            field.value.length % 4 ||
            field.value.length > 256
          )
            continue;
          const view = new DataView(
              field.value.buffer,
              field.value.byteOffset,
              field.value.byteLength,
            ),
            points: number[][] = [];
          for (let i = 0; i < field.value.length; i += 4)
            points.push([
              view.getUint16(i, true) / 65535,
              view.getUint16(i + 2, true) / 65535,
            ]);
          if (
            points.every((point, i) => i === 0 || point[0] > points[i - 1][0])
          )
            p[channels[field.id]] = JSON.stringify(points);
        }
        edits.push({ id: crypto.randomUUID(), tool: "curves", params: p });
      } else unsupported.push(operation.id);
    }
  }
  if (!edits.length)
    throw new Error(
      "This Snapseed QR uses operators that Still cannot render yet. Its private operator IDs are not documented; use a Still look or a compatible XMP/LUT.",
    );
  return {
    version: 1,
    name: "Imported Snapseed look",
    edits,
    nativeSnapseed: value,
    warnings: unsupported.length
      ? [
          `${unsupported.length} Snapseed operator${unsupported.length === 1 ? " is" : "s are"} preserved in the original QR but not rendered. Imported Tune image and Curves settings are editable.`,
        ]
      : [],
  };
}
function varint(value: number) {
  const bytes: number[] = [];
  do {
    const b = value % 128;
    value = Math.floor(value / 128);
    bytes.push(b | (value ? 128 : 0));
  } while (value);
  return bytes;
}
const block = (id: number, bytes: number[]) => [
  ...varint(id * 8 + 2),
  ...varint(bytes.length),
  ...bytes,
];
function floating(id: number, value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return [...varint(id * 8 + 5), ...bytes];
}
export async function exportSnapseed(recipe: Recipe): Promise<string> {
  if (recipe.nativeSnapseed) {
    const original = await importSnapseed(recipe.nativeSnapseed),
      signature = (r: Recipe) =>
        JSON.stringify(
          r.edits.map((edit) => ({
            tool: edit.tool,
            params: Object.fromEntries(
              Object.entries(edit.params).sort(([a], [b]) =>
                a.localeCompare(b),
              ),
            ),
          })),
        );
    if (signature(original) === signature(recipe)) return recipe.nativeSnapseed;
    if (original.warnings?.length)
      throw new Error(
        "This native look was edited and contains unsupported Snapseed operators. Use Still QR or JSON to preserve your edits.",
      );
  }
  if (recipe.edits.some((edit) => !["tune", "curves"].includes(edit.tool)))
    throw new Error(
      "Snapseed QR export currently supports Tune image and Curves. Still QR and JSON preserve every tool.",
    );
  const payload: number[] = [8, 0];
  for (const edit of recipe.edits) {
    let operator: number,
      params: number[] = [];
    if (edit.tool === "tune") {
      operator = 70516243;
      [
        "brightness",
        "contrast",
        "saturation",
        "ambiance",
        "highlights",
        "shadows",
        "warmth",
      ].forEach((key, i) =>
        params.push(...floating(i + 1, Number(edit.params[key] || 0) / 100)),
      );
    } else {
      operator = 139220080;
      params = [8, 21, 16, 4];
      const channels = [
        "curveRGB",
        "curveRed",
        "curveGreen",
        "curveBlue",
        "curveLuma",
      ];
      for (let channel = 0; channel < channels.length; channel++) {
        const points: number[][] = edit.params[channels[channel]]
            ? JSON.parse(String(edit.params[channels[channel]]))
            : channel === 0
              ? ["blacks", "shadows", "midtones", "highlights", "whites"].map(
                  (key, i) => [
                    i / 4,
                    Math.max(
                      0,
                      Math.min(1, i / 4 + Number(edit.params[key] || 0) / 300),
                    ),
                  ],
                )
              : [
                  [0, 0],
                  [1, 1],
                ],
          bytes = new Uint8Array(points.length * 4),
          view = new DataView(bytes.buffer);
        points.forEach((point, i) => {
          view.setUint16(i * 4, Math.round(point[0] * 65535), true);
          view.setUint16(i * 4 + 2, Math.round(point[1] * 65535), true);
        });
        params.push(...block(channel + 3, [...bytes]));
      }
      params.push(64, 1);
    }
    payload.push(...block(2, block(operator, params)));
  }
  const stream = new Blob([new Uint8Array(payload)])
      .stream()
      .pipeThrough(new CompressionStream("gzip")),
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `https://snapseed.com/qr?l=${base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ".")}`;
}
export async function decodeLookPayload(text: string): Promise<Recipe> {
  const trimmed = text.trim();
  if (/^https?:\/\/(www\.)?snapseed\.com\/qr\?/i.test(trimmed))
    return importSnapseed(trimmed);
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(
      "This is not a Still JSON look or a supported Snapseed QR.",
    );
  }
}
