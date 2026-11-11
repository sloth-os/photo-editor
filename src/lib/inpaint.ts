/** Exemplar-guided front propagation. Known pixels are never changed. */
export function inpaintPixels(
  input: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (input.length !== width * height * 4 || mask.length !== width * height)
    throw new Error("Invalid inpainting dimensions.");
  const out = new Uint8ClampedArray(input),
    known = new Uint8Array(mask.length),
    donor = new Int32Array(mask.length).fill(-1),
    queued = new Uint8Array(mask.length),
    heap: number[] = [],
    priorities: number[] = [];
  let seed = 0x9e3779b9;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const neighbors = (p: number) => {
    const x = p % width,
      y = Math.floor(p / width),
      list: number[] = [];
    if (x) list.push(p - 1);
    if (x < width - 1) list.push(p + 1);
    if (y) list.push(p - width);
    if (y < height - 1) list.push(p + width);
    return list;
  };
  let count = 0;
  for (let i = 0; i < mask.length; i++)
    if (!mask[i]) {
      known[i] = 1;
      donor[i] = i;
      count++;
    }
  if (!count)
    throw new Error(
      "The selected area covers the entire photo. Leave some source pixels for healing.",
    );
  if (count === mask.length) return out;
  const push = (p: number) => {
    if (known[p] || queued[p]) return;
    queued[p] = 1;
    const priority =
      neighbors(p).reduce((s, j) => s + known[j], 0) + random() * 0.1;
    let i = heap.length;
    heap.push(p);
    priorities.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (priorities[parent] >= priority) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      [priorities[parent], priorities[i]] = [priorities[i], priorities[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!,
      priority = priorities.pop()!;
    if (heap.length) {
      heap[0] = last;
      priorities[0] = priority;
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (
          child + 1 < heap.length &&
          priorities[child + 1] > priorities[child]
        )
          child++;
        if (priorities[i] >= priorities[child]) break;
        [heap[child], heap[i]] = [heap[i], heap[child]];
        [priorities[child], priorities[i]] = [priorities[i], priorities[child]];
        i = child;
      }
    }
    return first;
  };
  for (let i = 0; i < mask.length; i++)
    if (mask[i] && neighbors(i).some((j) => known[j])) push(i);
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ];
  while (heap.length) {
    const p = pop(),
      x = p % width,
      y = Math.floor(p / width),
      samples: { dx: number; dy: number; index: number; weight: number }[] = [];
    let r = 0,
      g = 0,
      b = 0,
      total = 0;
    for (const [dx, dy] of offsets) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const q = yy * width + xx;
      if (!known[q]) continue;
      const weight = 1 / (dx * dx + dy * dy);
      samples.push({ dx, dy, index: q * 4, weight });
      r += out[q * 4] * weight;
      g += out[q * 4 + 1] * weight;
      b += out[q * 4 + 2] * weight;
      total += weight;
    }
    if (!total) continue;
    let best = -1,
      bestScore = Infinity;
    const candidates: number[] = [];
    for (const q of neighbors(p))
      if (known[q] && donor[q] >= 0) {
        const d = donor[q],
          dx = (p % width) - (q % width),
          dy = Math.floor(p / width) - Math.floor(q / width),
          cx = (d % width) + dx,
          cy = Math.floor(d / width) + dy;
        if (cx >= 0 && cx < width && cy >= 0 && cy < height)
          candidates.push(cy * width + cx);
        candidates.push(d);
      }
    for (let i = 0; i < 5; i++) {
      const distance =
          8 + Math.round(random() * Math.min(width, height) * 0.45),
        angle = random() * Math.PI * 2,
        cx = Math.max(
          1,
          Math.min(width - 2, Math.round(x + Math.cos(angle) * distance)),
        ),
        cy = Math.max(
          1,
          Math.min(height - 2, Math.round(y + Math.sin(angle) * distance)),
        );
      candidates.push(cy * width + cx);
    }
    for (const candidate of candidates) {
      if (mask[candidate]) continue;
      const cx = candidate % width,
        cy = Math.floor(candidate / width);
      let score = 0,
        weight = 0,
        valid = true;
      for (const sample of samples) {
        const sx = cx + sample.dx,
          sy = cy + sample.dy;
        if (
          sx < 0 ||
          sx >= width ||
          sy < 0 ||
          sy >= height ||
          mask[sy * width + sx]
        ) {
          valid = false;
          break;
        }
        const i = (sy * width + sx) * 4;
        score +=
          ((input[i] - out[sample.index]) ** 2 +
            (input[i + 1] - out[sample.index + 1]) ** 2 +
            (input[i + 2] - out[sample.index + 2]) ** 2) *
          sample.weight;
        weight += sample.weight;
      }
      if (valid && weight && score / weight < bestScore) {
        best = candidate;
        bestScore = score / weight;
      }
    }
    const i = p * 4,
      texture = best >= 0 ? 0.9 : 0;
    out[i] =
      (r / total) * (1 - texture) + (best >= 0 ? input[best * 4] * texture : 0);
    out[i + 1] =
      (g / total) * (1 - texture) +
      (best >= 0 ? input[best * 4 + 1] * texture : 0);
    out[i + 2] =
      (b / total) * (1 - texture) +
      (best >= 0 ? input[best * 4 + 2] * texture : 0);
    out[i + 3] = 255;
    known[p] = 1;
    donor[p] =
      best >= 0
        ? best
        : (neighbors(p)
            .map((q) => donor[q])
            .find((d) => d >= 0) ?? 0);
    for (const q of neighbors(p)) push(q);
  }
  return out;
}
