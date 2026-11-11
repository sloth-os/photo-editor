/** Portable sRGB filter math: iPhone Safari does not consistently expose Canvas.filter. */
export function applyLook(data: Uint8ClampedArray, filter: string) {
  const steps = [
    ...filter.matchAll(
      /(brightness|contrast|saturate|sepia|grayscale)\(([-.\d]+)\)/g,
    ),
  ].map((match) => ({ kind: match[1], amount: Number(match[2]) }));
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    for (const { kind, amount: a } of steps) {
      if (kind === "brightness") {
        r *= a;
        g *= a;
        b *= a;
      } else if (kind === "contrast") {
        r = (r - 127.5) * a + 127.5;
        g = (g - 127.5) * a + 127.5;
        b = (b - 127.5) * a + 127.5;
      } else if (kind === "saturate" || kind === "grayscale") {
        const saturation = kind === "grayscale" ? 1 - a : a,
          l = r * 0.2126 + g * 0.7152 + b * 0.0722;
        r = l + (r - l) * saturation;
        g = l + (g - l) * saturation;
        b = l + (b - l) * saturation;
      } else if (kind === "sepia") {
        const sr = r * 0.393 + g * 0.769 + b * 0.189,
          sg = r * 0.349 + g * 0.686 + b * 0.168,
          sb = r * 0.272 + g * 0.534 + b * 0.131;
        r += (sr - r) * a;
        g += (sg - g) * a;
        b += (sb - b) * a;
      }
      r = clamp(r);
      g = clamp(g);
      b = clamp(b);
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return data;
}
