import type { Params } from "./catalog";

export const stickers = [
  {
    id: "heart",
    name: "Heart",
    path: "M50 88C38 75 8 57 8 32C8 9 36 4 50 24C64 4 92 9 92 32C92 57 62 75 50 88Z",
  },
  {
    id: "star",
    name: "Star",
    path: "M50 5L63 35L96 39L71 61L78 94L50 77L22 94L29 61L4 39L37 35Z",
  },
  {
    id: "sparkle",
    name: "Sparkle",
    path: "M50 3Q55 44 97 50Q55 56 50 97Q44 56 3 50Q44 44 50 3Z",
  },
  {
    id: "flower",
    name: "Flower",
    path: "M50 28C17-9 0 32 28 50C-9 83 32 100 50 72C83 109 100 68 72 50C109 17 68 0 50 28Z",
  },
  { id: "arrow", name: "Arrow", path: "M4 39H58V17L97 50L58 83V61H4Z" },
  {
    id: "bubble",
    name: "Speech bubble",
    path: "M13 8H87Q97 8 97 20V64Q97 76 85 76H48L23 96V76H13Q3 76 3 64V20Q3 8 13 8Z",
  },
];

export function compositionOrder(count: number, value: unknown): number[] {
  let requested: unknown = [];
  try {
    requested = JSON.parse(String(value || "[]"));
  } catch {
    /* Use source order. */
  }
  const order = Array.isArray(requested)
    ? [
        ...new Set(
          requested.filter(
            (n): n is number => Number.isInteger(n) && n >= 0 && n < count,
          ),
        ),
      ]
    : [];
  return [
    ...order,
    ...Array.from({ length: count }, (_, i) => i).filter(
      (i) => !order.includes(i),
    ),
  ];
}

type Size = { width: number; height: number };
export type Cell = Size & { x: number; y: number; index: number };
/** Use a fixed longest edge so preview and full-size export have identical proportions. */
export function collageLayout(sizes: Size[], params: Params, edge: number) {
  const order = compositionOrder(sizes.length, params.order),
    gap = Math.max(0, Math.min(10, Number(params.gap) || 0)) / 100,
    cells: Cell[] = [];
  let width: number, height: number;
  if (params.layout === "horizontal" || params.layout === "vertical") {
    const horizontal = params.layout === "horizontal";
    let offset = gap;
    for (const index of order) {
      const size = sizes[index],
        ratio = horizontal
          ? size.width / size.height
          : size.height / size.width;
      cells.push({
        index,
        x: horizontal ? offset : gap,
        y: horizontal ? gap : offset,
        width: horizontal ? ratio : 1,
        height: horizontal ? 1 : ratio,
      });
      offset += ratio + gap;
    }
    width = horizontal ? offset : 1 + 2 * gap;
    height = horizontal ? 1 + 2 * gap : offset;
  } else {
    const columns = Math.max(
        1,
        Math.min(4, Math.round(Number(params.columns) || 2), sizes.length),
      ),
      rows = Math.ceil(sizes.length / columns),
      parts = String(params.ratio || "1:1")
        .split(":")
        .map(Number),
      ratio =
        params.ratio === "original"
          ? sizes[0].width / sizes[0].height
          : parts[0] / parts[1],
      aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    width = aspect >= 1 ? aspect : 1;
    height = aspect >= 1 ? 1 : 1 / aspect;
    const spacing = Math.min(
        gap,
        (width / (columns + 1)) * 0.8,
        (height / (rows + 1)) * 0.8,
      ),
      cw = (width - spacing * (columns + 1)) / columns,
      ch = (height - spacing * (rows + 1)) / rows;
    order.forEach((index, i) =>
      cells.push({
        index,
        x: spacing + (i % columns) * (cw + spacing),
        y: spacing + Math.floor(i / columns) * (ch + spacing),
        width: cw,
        height: ch,
      }),
    );
  }
  const scale = edge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    cells: cells.map((cell) => ({
      ...cell,
      x: cell.x * scale,
      y: cell.y * scale,
      width: cell.width * scale,
      height: cell.height * scale,
    })),
  };
}

/** Soft YCbCr skin chroma selection, including a broad range of skin luminance. */
export function skinWeight(r: number, g: number, b: number) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
    chroma = Math.exp(-(((cb - 108) / 27) ** 4 + ((cr - 151) / 29) ** 4)),
    light = Math.max(r, g, b) / 255;
  return (
    chroma *
    Math.min(1, light / 0.12) *
    Math.max(0, Math.min(1, (cr - 129) / 9))
  );
}

export function cutoutAlpha(confidence: number, edge: number, feather: number) {
  const threshold = 0.5 - Math.max(-30, Math.min(30, edge)) / 100,
    softness = 0.01 + Math.max(0, Math.min(100, feather)) / 250,
    t = Math.max(
      0,
      Math.min(1, (confidence - threshold + softness) / (softness * 2)),
    );
  return t * t * (3 - 2 * t);
}
