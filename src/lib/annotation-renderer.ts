import type { Mark, MarkPoint } from "./annotations";
import { markBounds } from "./annotations";
import { floodFill } from "./fill";
import { blurPixels } from "./blur";
const layer = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const ctx2d = (c: HTMLCanvasElement) =>
  c.getContext("2d", { willReadFrequently: true })!;
const rgb = (color: string) =>
  [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
function path(
  ctx: CanvasRenderingContext2D,
  points: MarkPoint[],
  w: number,
  h: number,
) {
  ctx.beginPath();
  const first = points[0];
  ctx.moveTo(first.x * w, first.y * h);
  if (points.length === 1) ctx.lineTo(first.x * w + 0.01, first.y * h);
  else {
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      ctx.quadraticCurveTo(
        a.x * w,
        a.y * h,
        ((a.x + b.x) * w) / 2,
        ((a.y + b.y) * h) / 2,
      );
    }
    const last = points.at(-1)!;
    ctx.lineTo(last.x * w, last.y * h);
  }
}
function shape(
  ctx: CanvasRenderingContext2D,
  mark: Mark,
  w: number,
  h: number,
  selection = false,
) {
  const a = mark.points[0],
    b = mark.points.at(-1)!,
    x = Math.min(a.x, b.x) * w,
    y = Math.min(a.y, b.y) * h,
    ww = Math.max(1, Math.abs(b.x - a.x) * w),
    hh = Math.max(1, Math.abs(b.y - a.y) * h),
    kind = selection ? mark.shape || "rectangle" : mark.kind;
  ctx.beginPath();
  if (kind === "ellipse")
    ctx.ellipse(x + ww / 2, y + hh / 2, ww / 2, hh / 2, 0, 0, Math.PI * 2);
  else if (kind === "triangle") {
    ctx.moveTo(x + ww / 2, y);
    ctx.lineTo(x + ww, y + hh);
    ctx.lineTo(x, y + hh);
    ctx.closePath();
  } else if (kind === "star") {
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? 0.22 : 0.5,
        px = x + ww * (0.5 + Math.cos(angle) * r),
        py = y + hh * (0.5 + Math.sin(angle) * r);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  } else if (kind === "rounded-rectangle") {
    const r = Math.min(ww, hh) * 0.16;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  } else ctx.rect(x, y, ww, hh);
}
function selection(
  ctx: CanvasRenderingContext2D,
  mark: Mark,
  w: number,
  h: number,
) {
  if (mark.shape === "brush") {
    ctx.lineWidth = Math.max(1, mark.width * Math.min(w, h));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    path(ctx, mark.points, w, h);
    ctx.stroke();
  } else {
    shape(ctx, mark, w, h, true);
    ctx.fill();
  }
}
function paintStroke(
  ctx: CanvasRenderingContext2D,
  mark: Mark,
  w: number,
  h: number,
) {
  const size = Math.max(0.5, mark.width * Math.min(w, h)),
    brush = mark.brush || "round";
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = size;
  if (brush === "marker") {
    ctx.lineWidth = size * 1.4;
    ctx.globalAlpha *= 0.65;
  }
  ctx.lineJoin = "round";
  ctx.lineCap =
    brush === "square" || brush === "marker" || mark.kind === "highlighter"
      ? "butt"
      : "round";
  if (brush === "square") ctx.lineCap = "square";
  if (!["airbrush", "calligraphy", "crayon"].includes(brush)) {
    path(ctx, mark.points, w, h);
    ctx.stroke();
    if (mark.points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        mark.points[0].x * w,
        mark.points[0].y * h,
        size / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    return;
  }
  let seed = [...mark.id].reduce(
    (n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) | 0,
    7,
  );
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const stamp = (p: MarkPoint) => {
    const x = p.x * w,
      y = p.y * h,
      radius = (size / 2) * (0.35 + 0.65 * (p.pressure ?? 1));
    ctx.save();
    if (brush === "airbrush") {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, mark.color);
      gradient.addColorStop(1, `${mark.color}00`);
      ctx.fillStyle = gradient;
      ctx.globalAlpha *= 0.25;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    } else if (brush === "calligraphy") {
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, Math.max(0.4, radius * 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const dots = Math.max(8, Math.ceil(size * 1.5));
      for (let i = 0; i < dots; i++) {
        const angle = random() * Math.PI * 2,
          r = Math.sqrt(random()) * radius;
        ctx.globalAlpha = mark.opacity * (0.2 + random() * 0.5);
        const d = Math.max(0.5, size / 12);
        ctx.fillRect(x + Math.cos(angle) * r, y + Math.sin(angle) * r, d, d);
      }
    }
    ctx.restore();
  };
  stamp(mark.points[0]);
  for (let i = 1; i < mark.points.length; i++) {
    const a = mark.points[i - 1],
      b = mark.points[i],
      steps = Math.max(
        1,
        Math.ceil(
          Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) /
            Math.max(0.5, size * 0.15),
        ),
      );
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      stamp({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure:
          (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t,
      });
    }
  }
}
function vector(
  ctx: CanvasRenderingContext2D,
  mark: Mark,
  w: number,
  h: number,
) {
  const a = mark.points[0],
    b = mark.points.at(-1)!,
    size = Math.max(1, mark.width * Math.min(w, h));
  ctx.save();
  ctx.globalAlpha = mark.opacity;
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (mark.kind === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    paintStroke(ctx, { ...mark, brush: "round" }, w, h);
  } else if (["pen", "highlighter"].includes(mark.kind))
    paintStroke(ctx, mark, w, h);
  else if (mark.kind === "number") {
    ctx.beginPath();
    ctx.arc(a.x * w, a.y * h, size / 2, 0, Math.PI * 2);
    ctx.fill();
    const [r, g, bb] = rgb(mark.color);
    ctx.fillStyle =
      r * 0.2126 + g * 0.7152 + bb * 0.0722 > 150 ? "#101810" : "#ffffff";
    ctx.font = `700 ${size * 0.6}px "DM Sans", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      String(mark.number || 1),
      a.x * w,
      a.y * h + size * 0.02,
      size * 0.8,
    );
  } else if (["line", "arrow", "curve"].includes(mark.kind)) {
    if (mark.dashed) ctx.setLineDash([size * 3, size * 2]);
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    if (mark.kind === "curve") {
      const bend = mark.bend ?? 0.35;
      ctx.quadraticCurveTo(
        ((a.x + b.x) * w) / 2 - (b.y - a.y) * h * bend,
        ((a.y + b.y) * h) / 2 + (b.x - a.x) * w * bend,
        b.x * w,
        b.y * h,
      );
    } else ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
    ctx.setLineDash([]);
    if (mark.kind === "arrow") {
      const head = (p: MarkPoint, q: MarkPoint) => {
        const angle = Math.atan2((p.y - q.y) * h, (p.x - q.x) * w),
          length = Math.max(size * 4, Math.min(w, h) * 0.025);
        ctx.beginPath();
        ctx.moveTo(p.x * w, p.y * h);
        ctx.lineTo(
          p.x * w - Math.cos(angle - 0.45) * length,
          p.y * h - Math.sin(angle - 0.45) * length,
        );
        ctx.lineTo(
          p.x * w - Math.cos(angle + 0.45) * length,
          p.y * h - Math.sin(angle + 0.45) * length,
        );
        ctx.closePath();
        ctx.fill();
      };
      head(b, a);
      if (mark.twoHeads) head(a, b);
    }
  } else {
    shape(ctx, mark, w, h);
    if (mark.filled) {
      ctx.save();
      ctx.globalAlpha *= mark.fillOpacity ?? 0.35;
      ctx.fillStyle = mark.fillColor || mark.color;
      ctx.fill();
      ctx.restore();
    }
    if (mark.dashed) ctx.setLineDash([size * 3, size * 2]);
    ctx.stroke();
  }
  ctx.restore();
}
function privacy(out: HTMLCanvasElement, mark: Mark) {
  const w = out.width,
    h = out.height,
    ctx = ctx2d(out);
  if (mark.kind === "redact" || mark.kind === "highlight") {
    ctx.save();
    ctx.fillStyle = mark.color;
    ctx.strokeStyle = mark.color;
    ctx.globalAlpha = mark.kind === "redact" ? 1 : mark.opacity;
    ctx.globalCompositeOperation =
      mark.kind === "highlight" ? "multiply" : "source-over";
    selection(ctx, mark, w, h);
    ctx.restore();
    return;
  }
  const radius = Math.max(2, (Math.min(w, h) * (mark.strength ?? 55)) / 1800),
    bounds = markBounds(mark, w, h),
    pad = mark.kind === "blur" ? Math.ceil(radius * 3) : 0,
    x = Math.max(0, Math.floor(bounds.x * w) - pad),
    y = Math.max(0, Math.floor(bounds.y * h) - pad),
    ww = Math.max(1, Math.min(w - x, Math.ceil(bounds.width * w) + pad * 2)),
    hh = Math.max(1, Math.min(h - y, Math.ceil(bounds.height * h) + pad * 2)),
    mask = layer(ww, hh),
    mx = ctx2d(mask);
  mx.translate(-x, -y);
  mx.fillStyle = mx.strokeStyle = "#fff";
  selection(mx, mark, w, h);
  const source = ctx.getImageData(x, y, ww, hh),
    masked = mx.getImageData(0, 0, ww, hh).data;
  let processed: Uint8ClampedArray;
  if (mark.kind === "blur")
    processed = blurPixels(source.data.slice(), ww, hh, radius);
  else {
    const block = Math.max(
        3,
        Math.round((Math.min(w, h) * (mark.strength ?? 55)) / 1200),
      ),
      small = layer(
        Math.max(1, Math.ceil(ww / block)),
        Math.max(1, Math.ceil(hh / block)),
      ),
      large = layer(ww, hh);
    ctx2d(small).drawImage(out, x, y, ww, hh, 0, 0, small.width, small.height);
    const lx = ctx2d(large);
    lx.imageSmoothingEnabled = false;
    lx.drawImage(small, 0, 0, ww, hh);
    processed = lx.getImageData(0, 0, ww, hh).data;
  }
  for (let i = 0; i < source.data.length; i += 4) {
    const a = (masked[i + 3] / 255) * mark.opacity;
    for (let c = 0; c < 3; c++)
      source.data[i + c] += (processed[i + c] - source.data[i + c]) * a;
  }
  ctx.putImageData(source, x, y);
}
export function renderAnnotations(out: HTMLCanvasElement, marks: Mark[]) {
  const w = out.width,
    h = out.height,
    ctx = ctx2d(out);
  let normal: HTMLCanvasElement | undefined,
    highlighter: HTMLCanvasElement | undefined;
  const spotlights = marks.filter((mark) => mark.kind === "spotlight");
  for (const mark of marks) {
    if (mark.kind === "fill") {
      const image = ctx.getImageData(0, 0, w, h),
        color = rgb(mark.color);
      floodFill(
        image.data,
        w,
        h,
        mark.points[0].x * w,
        mark.points[0].y * h,
        [color[0], color[1], color[2], mark.opacity * 255],
        mark.tolerance,
        mark.scope,
        mark.clear,
      );
      ctx.putImageData(image, 0, 0);
    } else if (["blur", "pixelate", "redact", "highlight"].includes(mark.kind))
      privacy(out, mark);
    else if (mark.kind === "spotlight") continue;
    else if (mark.kind === "eraser") {
      if (normal) vector(ctx2d(normal), mark, w, h);
      if (highlighter) vector(ctx2d(highlighter), mark, w, h);
    } else if (mark.kind === "highlighter") {
      highlighter ??= layer(w, h);
      vector(ctx2d(highlighter), mark, w, h);
    } else {
      normal ??= layer(w, h);
      vector(ctx2d(normal), mark, w, h);
    }
  }
  if (spotlights.length) {
    const mask = layer(w, h),
      mx = ctx2d(mask);
    mx.fillStyle = mx.strokeStyle = "#fff";
    for (const mark of spotlights) selection(mx, mark, w, h);
    const data = ctx.getImageData(0, 0, w, h),
      selected = mx.getImageData(0, 0, w, h).data,
      strength =
        Math.max(...spotlights.map((mark) => mark.strength ?? 65)) / 100;
    for (let i = 0; i < data.data.length; i += 4) {
      const factor = 1 - strength * (1 - selected[i + 3] / 255);
      for (let c = 0; c < 3; c++) data.data[i + c] *= factor;
    }
    ctx.putImageData(data, 0, 0);
  }
  ctx.save();
  if (highlighter) {
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(highlighter, 0, 0);
  }
  ctx.globalCompositeOperation = "source-over";
  if (normal) ctx.drawImage(normal, 0, 0);
  ctx.restore();
  return out;
}
