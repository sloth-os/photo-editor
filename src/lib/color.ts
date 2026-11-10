export const clamp = (v: number, lo = 0, hi = 255) =>
  Math.max(lo, Math.min(hi, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const luminance = (r: number, g: number, b: number) =>
  r * 0.2126 + g * 0.7152 + b * 0.0722;

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}
export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const a = s * Math.min(l, 1 - l),
    f = (n: number) => {
      const k = (n + h / 30) % 12;
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
  return [f(0), f(8), f(4)];
}

export type CubeLut = {
  size: number;
  values: number[];
  domainMin: number[];
  domainMax: number[];
};
export function parseCube(text: string): CubeLut {
  let size = 0,
    domainMin = [0, 0, 0],
    domainMax = [1, 1, 1];
  const values: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim();
    if (!clean) continue;
    const [key, ...rest] = clean.split(/\s+/);
    if (key === "LUT_3D_SIZE") size = Number(rest[0]);
    else if (key === "DOMAIN_MIN") domainMin = rest.map(Number);
    else if (key === "DOMAIN_MAX") domainMax = rest.map(Number);
    else if (key === "TITLE") continue;
    else if (key === "LUT_1D_SIZE")
      throw new Error("Please use a 3D .cube LUT. 1D LUTs are not supported.");
    else {
      const row = clean.split(/\s+/).map(Number);
      if (row.length === 3 && row.every(Number.isFinite)) values.push(...row);
    }
  }
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 64 ||
    values.length !== size ** 3 * 3 ||
    domainMin.length !== 3 ||
    domainMax.length !== 3 ||
    domainMin.some(
      (v, i) =>
        !Number.isFinite(v) ||
        !Number.isFinite(domainMax[i]) ||
        domainMax[i] <= v,
    )
  )
    throw new Error(
      "Invalid .cube LUT. Use a 3D LUT with 2–64 points per channel.",
    );
  return { size, values, domainMin, domainMax };
}
export function sampleLut(
  lut: CubeLut,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const v = [r, g, b].map(
    (v, i) =>
      clamp(
        (v / 255 - lut.domainMin[i]) / (lut.domainMax[i] - lut.domainMin[i]),
        0,
        1,
      ) *
      (lut.size - 1),
  );
  const low = v.map(Math.floor),
    high = low.map((n) => Math.min(n + 1, lut.size - 1)),
    f = v.map((n, i) => n - low[i]);
  const out = [0, 0, 0];
  for (let z = 0; z < 2; z++)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const index =
          ((z ? high[2] : low[2]) * lut.size * lut.size +
            (y ? high[1] : low[1]) * lut.size +
            (x ? high[0] : low[0])) *
          3;
        const weight =
          (x ? f[0] : 1 - f[0]) * (y ? f[1] : 1 - f[1]) * (z ? f[2] : 1 - f[2]);
        for (let k = 0; k < 3; k++)
          out[k] += lut.values[index + k] * weight * 255;
      }
  return out as [number, number, number];
}
export function tone(
  r: number,
  g: number,
  b: number,
  p: Record<string, number | string>,
): [number, number, number] {
  const n = (k: string) => Number(p[k] || 0);
  const lum = luminance(r, g, b) / 255;
  const bright = n("brightness") * 0.65 + n("exposure") * 0.9;
  const shadow = n("shadows") * Math.pow(1 - lum, 2) * 0.85;
  const highlight = n("highlights") * Math.pow(lum, 2) * 0.85;
  const ambiance = n("ambiance") * (0.5 - lum) * 0.9;
  const contrast = 1 + n("contrast") / 125;
  const temp = (n("warmth") + n("temperature")) * 0.35,
    tint = n("tint") * 0.25;
  const sat = 1 + n("saturation") / 100;
  let rr =
    (r - 128) * contrast +
    128 +
    bright +
    shadow +
    highlight +
    ambiance +
    temp +
    tint;
  let gg =
    (g - 128) * contrast + 128 + bright + shadow + highlight + ambiance - tint;
  let bb =
    (b - 128) * contrast +
    128 +
    bright +
    shadow +
    highlight +
    ambiance -
    temp +
    tint;
  const l = luminance(rr, gg, bb);
  rr = mix(l, rr, sat);
  gg = mix(l, gg, sat);
  bb = mix(l, bb, sat);
  return [clamp(rr), clamp(gg), clamp(bb)];
}
