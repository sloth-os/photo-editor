import type { Edit, Params } from "./catalog";
export type MarkPoint = { x: number; y: number; pressure?: number };
export const markKinds = [
  "pen",
  "highlighter",
  "eraser",
  "arrow",
  "line",
  "curve",
  "rectangle",
  "rounded-rectangle",
  "ellipse",
  "triangle",
  "star",
  "number",
  "fill",
  "blur",
  "pixelate",
  "redact",
  "highlight",
  "spotlight",
] as const;
export type MarkKind = (typeof markKinds)[number];
export const brushTypes = [
  "round",
  "square",
  "marker",
  "airbrush",
  "calligraphy",
  "crayon",
  "eraser",
] as const;
export type Mark = {
  id: string;
  kind: MarkKind;
  points: MarkPoint[];
  color: string;
  width: number;
  opacity: number;
  brush?: (typeof brushTypes)[number];
  shape?: "rectangle" | "ellipse" | "brush";
  filled?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  dashed?: boolean;
  twoHeads?: boolean;
  number?: number;
  bend?: number;
  strength?: number;
  tolerance?: number;
  scope?: "connected" | "matching" | "canvas";
  clear?: boolean;
};
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const color = (v: unknown) => typeof v === "string" && /^#[\da-f]{6}$/i.test(v);
export function validateMarks(value: unknown): asserts value is Mark[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("A drawing supports up to 1000 marks.");
  let count = 0;
  for (const mark of value) {
    if (
      !mark ||
      typeof mark.id !== "string" ||
      mark.id.length > 100 ||
      !markKinds.includes(mark.kind) ||
      !Array.isArray(mark.points) ||
      !mark.points.length ||
      mark.points.length > 10000 ||
      !color(mark.color) ||
      !finite(mark.width, 0.0001, 1) ||
      !finite(mark.opacity, 0, 1)
    )
      throw new Error("Invalid drawing mark.");
    count += mark.points.length;
    if (
      count > 50000 ||
      mark.points.some(
        (p: MarkPoint) =>
          !p ||
          !finite(p.x, 0, 1) ||
          !finite(p.y, 0, 1) ||
          (p.pressure !== undefined && !finite(p.pressure, 0, 1)),
      )
    )
      throw new Error("Invalid drawing points.");
    if (mark.brush !== undefined && !brushTypes.includes(mark.brush))
      throw new Error("Unknown brush type.");
    if (
      mark.shape !== undefined &&
      !["rectangle", "ellipse", "brush"].includes(mark.shape)
    )
      throw new Error("Unknown selection shape.");
    if (
      mark.scope !== undefined &&
      !["connected", "matching", "canvas"].includes(mark.scope)
    )
      throw new Error("Unknown fill scope.");
    if (mark.fillColor !== undefined && !color(mark.fillColor))
      throw new Error("Invalid fill color.");
    for (const key of ["filled", "dashed", "twoHeads", "clear"] as const)
      if (mark[key] !== undefined && typeof mark[key] !== "boolean")
        throw new Error("Invalid drawing flag.");
    for (const [key, min, max] of [
      ["fillOpacity", 0, 1],
      ["bend", -1, 1],
      ["strength", 0, 100],
      ["tolerance", 0, 100],
      ["number", 1, 999],
    ] as const)
      if (
        mark[key] !== undefined &&
        (!finite(mark[key], min, max) ||
          (key === "number" && !Number.isInteger(mark[key])))
      )
        throw new Error("Invalid drawing value.");
  }
}
export const usesMarks = (edit: Edit) =>
  ["draw", "privacy", "fill"].includes(edit.tool) ||
  (edit.tool === "brush" && edit.params.mode === "paint");
export function createMark(edit: Edit, point: MarkPoint): Mark {
  const p: Params = edit.params,
    mode = String(p.drawMode || "pen"),
    brush = String(p.brush || "round") as Mark["brush"],
    kind = (
      edit.tool === "fill"
        ? "fill"
        : edit.tool === "privacy"
          ? p.effect || "blur"
          : brush === "eraser" && ["pen", "highlighter"].includes(mode)
            ? "eraser"
            : mode
    ) as MarkKind;
  return {
    id: crypto.randomUUID(),
    kind,
    points: [point],
    color: String(p.color || "#ef6351"),
    width: Math.max(
      0.0001,
      (Number(p.size || 1.5) / 100) * (kind === "number" ? 4 : 1),
    ),
    opacity: Number(p.opacity ?? (kind === "highlighter" ? 35 : 100)) / 100,
    brush,
    shape: String(p.region || "rectangle") as Mark["shape"],
    filled: !!p.filled,
    fillColor: String(p.fillColor || p.color || "#ef6351"),
    fillOpacity: Number(p.fillOpacity ?? 35) / 100,
    dashed: !!p.dashed,
    twoHeads: !!p.twoHeads,
    number: Math.max(1, Math.min(999, Number(p.nextNumber || 1))),
    bend: Number(p.bend ?? 35) / 100,
    strength: Number(p.strength ?? 55),
    tolerance: Number(p.tolerance ?? 15),
    scope: String(p.scope || "connected") as Mark["scope"],
    clear: p.fillMode === "clear",
  };
}
export function markBounds(mark: Mark, width: number, height: number) {
  const points = [...mark.points];
  if (mark.kind === "curve" && points.length > 1) {
    const a = points[0],
      b = points.at(-1)!,
      bend = mark.bend ?? 0.35;
    points.push({
      x: (a.x + b.x) / 2 - (((b.y - a.y) * height) / width) * bend,
      y: (a.y + b.y) / 2 + (((b.x - a.x) * width) / height) * bend,
    });
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    pad =
      mark.width *
      Math.min(width, height) *
      (mark.kind === "number" ? 0.6 : 0.5);
  return {
    x: Math.min(...xs) - pad / width,
    y: Math.min(...ys) - pad / height,
    width: Math.max(...xs) - Math.min(...xs) + (pad * 2) / width,
    height: Math.max(...ys) - Math.min(...ys) + (pad * 2) / height,
  };
}
export function hitMark(
  marks: Mark[],
  point: MarkPoint,
  width: number,
  height: number,
) {
  return [...marks].reverse().find((mark) => {
    const b = markBounds(mark, width, height),
      pad = 18 / Math.max(width, height);
    return (
      point.x >= b.x - pad &&
      point.x <= b.x + b.width + pad &&
      point.y >= b.y - pad &&
      point.y <= b.y + b.height + pad
    );
  });
}
