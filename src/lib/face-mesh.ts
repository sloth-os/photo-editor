import type { Edit } from "./catalog";
type Point = { x: number; y: number; z: number };
export function faceRegion(points: Point[], width = 1, height = 1) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  return {
    centerX: (left + right) * 50,
    centerY: (top + bottom) * 50,
    radius: ((right - left) * 55 * width) / Math.min(width, height),
  };
}
export function warpFace(
  source: HTMLCanvasElement,
  edit: Edit,
): HTMLCanvasElement {
  const points = edit.faces?.[Number(edit.params.faceIndex || 0)],
    triangles = edit.mesh;
  if (!points || !triangles?.length) return source;
  const w = source.width,
    h = source.height,
    n = (key: string) => Number(edit.params[key] || 0),
    center = points[168] || points[1],
    yaw = ((n("yaw") / 100) * Math.PI) / 7,
    pitch = ((n("pitch") / 100) * Math.PI) / 7;
  const leftEye = points[468] || points[33],
    rightEye = points[473] || points[263],
    corners = [points[61], points[291]],
    size = Math.abs(points[234].x - points[454].x) * w;
  const moved = points.map((p) => {
    let x = (p.x - center.x) * w,
      y = (p.y - center.y) * h,
      z = (p.z - center.z) * w;
    for (const eye of [leftEye, rightEye]) {
      const ex = (eye.x - center.x) * w,
        ey = (eye.y - center.y) * h,
        d = ((x - ex) ** 2 + (y - ey) ** 2) / Math.max(1, (size * 0.12) ** 2),
        a = (Math.exp(-d) * n("pupils")) / 350;
      x += (x - ex) * a;
      y += (y - ey) * a;
    }
    for (const corner of corners) {
      const cx = (corner.x - center.x) * w,
        cy = (corner.y - center.y) * h,
        a = Math.exp(
          -((x - cx) ** 2 + (y - cy) ** 2) / Math.max(1, (size * 0.18) ** 2),
        );
      y -= ((a * n("smile")) / 100) * size * 0.07;
      x += ((Math.sign(cx) * a * n("smile")) / 100) * size * 0.025;
    }
    const xx = Math.cos(yaw) * x + Math.sin(yaw) * z,
      zz = -Math.sin(yaw) * x + Math.cos(yaw) * z,
      yy = Math.cos(pitch) * y - Math.sin(pitch) * zz,
      depth = Math.sin(pitch) * y + Math.cos(pitch) * zz,
      focal = w * 2,
      projection = focal / (focal + depth);
    return {
      x: center.x * w + xx * projection,
      y: center.y * h + yy * projection,
      z: depth,
    };
  });
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  const ordered = [...triangles].sort(
    (a, b) =>
      b.reduce((s, i) => s + moved[i].z, 0) -
      a.reduce((s, i) => s + moved[i].z, 0),
  );
  for (const triangle of ordered) {
    const [i, j, k] = triangle,
      s = [points[i], points[j], points[k]].map((p) => ({
        x: p.x * w,
        y: p.y * h,
      })),
      d = [moved[i], moved[j], moved[k]],
      det =
        s[0].x * (s[1].y - s[2].y) +
        s[1].x * (s[2].y - s[0].y) +
        s[2].x * (s[0].y - s[1].y);
    if (Math.abs(det) < 0.001) continue;
    const coefficients = (values: number[]) => [
      (values[0] * (s[1].y - s[2].y) +
        values[1] * (s[2].y - s[0].y) +
        values[2] * (s[0].y - s[1].y)) /
        det,
      (values[0] * (s[2].x - s[1].x) +
        values[1] * (s[0].x - s[2].x) +
        values[2] * (s[1].x - s[0].x)) /
        det,
      (values[0] * (s[1].x * s[2].y - s[2].x * s[1].y) +
        values[1] * (s[2].x * s[0].y - s[0].x * s[2].y) +
        values[2] * (s[0].x * s[1].y - s[1].x * s[0].y)) /
        det,
    ];
    const ax = coefficients(d.map((p) => p.x)),
      ay = coefficients(d.map((p) => p.y));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d[0].x, d[0].y);
    ctx.lineTo(d[1].x, d[1].y);
    ctx.lineTo(d[2].x, d[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(ax[0], ay[0], ax[1], ay[1], ax[2], ay[2]);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }
  return out;
}
