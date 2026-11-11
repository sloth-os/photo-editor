export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgba: [number, number, number, number],
  tolerance = 15,
  scope: "connected" | "matching" | "canvas" = "connected",
  clear = false,
) {
  const sx = Math.max(0, Math.min(width - 1, Math.floor(x))),
    sy = Math.max(0, Math.min(height - 1, Math.floor(y))),
    seed = (sy * width + sx) * 4,
    sample = [...data.subarray(seed, seed + 4)],
    limit = (tolerance / 100) * 255,
    visited = new Uint8Array(width * height);
  const matches = (p: number) => {
    const i = p * 4,
      a = data[i + 3] / 255,
      sa = sample[3] / 255;
    return (
      Math.max(
        Math.abs(data[i] * a - sample[0] * sa),
        Math.abs(data[i + 1] * a - sample[1] * sa),
        Math.abs(data[i + 2] * a - sample[2] * sa),
        Math.abs(data[i + 3] - sample[3]),
      ) <= limit
    );
  };
  const paint = (p: number) => {
    const i = p * 4;
    visited[p] = 1;
    if (clear) {
      data.fill(0, i, i + 4);
      return;
    }
    const a = rgba[3] / 255,
      old = data[i + 3] / 255,
      alpha = a + old * (1 - a);
    for (let k = 0; k < 3; k++)
      data[i + k] = alpha
        ? (rgba[k] * a + data[i + k] * old * (1 - a)) / alpha
        : 0;
    data[i + 3] = alpha * 255;
  };
  if (scope !== "connected") {
    for (let p = 0; p < width * height; p++)
      if (scope === "canvas" || matches(p)) paint(p);
    return data;
  }
  const stack = [sy * width + sx];
  while (stack.length) {
    const start = stack.pop()!;
    if (visited[start] || !matches(start)) continue;
    const row = Math.floor(start / width);
    let left = start % width,
      right = left;
    while (
      left > 0 &&
      !visited[row * width + left - 1] &&
      matches(row * width + left - 1)
    )
      left--;
    while (
      right + 1 < width &&
      !visited[row * width + right + 1] &&
      matches(row * width + right + 1)
    )
      right++;
    for (let xx = left; xx <= right; xx++) paint(row * width + xx);
    for (const yy of [row - 1, row + 1])
      if (yy >= 0 && yy < height) {
        let run = false;
        for (let xx = left; xx <= right; xx++) {
          const p = yy * width + xx,
            good = !visited[p] && matches(p);
          if (good && !run) stack.push(p);
          run = good;
        }
      }
  }
  return data;
}
