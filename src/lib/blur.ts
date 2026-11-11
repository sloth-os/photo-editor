/** Three separable box passes approximate a Gaussian when Canvas.filter is unavailable. */
export function blurPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number,
) {
  const ideal = Math.sqrt(4 * sigma * sigma + 1),
    lower = Math.max(
      1,
      Math.floor(ideal) - (Math.floor(ideal) % 2 === 0 ? 1 : 0),
    ),
    lowCount = Math.max(
      0,
      Math.min(
        3,
        Math.round(
          (12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) /
            (-4 * lower - 4),
        ),
      ),
    ),
    buffer = new Uint8ClampedArray(pixels.length);
  function box(
    source: Uint8ClampedArray,
    out: Uint8ClampedArray,
    radius: number,
    horizontal: boolean,
  ) {
    const length = horizontal ? width : height,
      lines = horizontal ? height : width,
      count = 2 * radius + 1;
    for (let line = 0; line < lines; line++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      const index = (position: number) => {
        const p = Math.max(0, Math.min(length - 1, position));
        return (horizontal ? line * width + p : p * width + line) * 4;
      };
      const add = (position: number, sign: number) => {
        const i = index(position),
          alpha = source[i + 3] * sign;
        r += source[i] * alpha;
        g += source[i + 1] * alpha;
        b += source[i + 2] * alpha;
        a += alpha;
      };
      for (let k = -radius; k <= radius; k++) add(k, 1);
      for (let p = 0; p < length; p++) {
        const i = index(p);
        out[i] = a ? r / a : 0;
        out[i + 1] = a ? g / a : 0;
        out[i + 2] = a ? b / a : 0;
        out[i + 3] = a / count;
        add(p - radius, -1);
        add(p + radius + 1, 1);
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const radius = ((pass < lowCount ? lower : lower + 2) - 1) / 2;
    if (radius) {
      box(pixels, buffer, radius, true);
      box(buffer, pixels, radius, false);
    }
  }
  return pixels;
}
