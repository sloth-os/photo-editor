/** Dark-channel prior transmission recovery, with a separable minimum filter. */
export function minFilter(
  input: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const horizontal = new Float32Array(input.length),
    out = new Float32Array(input.length),
    deque = new Int32Array(Math.max(width, height) * 2 + 2);
  const line = (
    length: number,
    count: number,
    read: (line: number, index: number) => number,
    write: (line: number, index: number, value: number) => void,
  ) => {
    for (let row = 0; row < count; row++) {
      let head = 0,
        tail = 0,
        next = 0;
      for (let x = 0; x < length; x++) {
        const right = Math.min(length - 1, x + radius);
        while (next <= right) {
          const value = read(row, next);
          while (tail > head && read(row, deque[tail - 1]) >= value) tail--;
          deque[tail++] = next++;
        }
        while (tail > head && deque[head] < x - radius) head++;
        write(row, x, read(row, deque[head]));
      }
    }
  };
  line(
    width,
    height,
    (y, x) => input[y * width + x],
    (y, x, v) => {
      horizontal[y * width + x] = v;
    },
  );
  line(
    height,
    width,
    (x, y) => horizontal[y * width + x],
    (x, y, v) => {
      out[y * width + x] = v;
    },
  );
  return out;
}
export function recoverHaze(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray {
  const dark = new Float32Array(width * height);
  for (let i = 0; i < dark.length; i++)
    dark[i] = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const radius = Math.max(1, Math.round(Math.min(width, height) / 60)),
    local = minFilter(dark, width, height, radius);
  let candidate = 0,
    best = -1;
  for (let i = 0; i < local.length; i++) {
    const score =
      local[i] * 3 + (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    if (score > best) {
      best = score;
      candidate = i;
    }
  }
  const air = [0, 1, 2].map((k) => Math.max(100, data[candidate * 4 + k]));
  for (let i = 0; i < dark.length; i++)
    dark[i] = Math.min(...air.map((a, k) => data[i * 4 + k] / a));
  const transmission = minFilter(dark, width, height, radius),
    out = new Uint8ClampedArray(data);
  for (let i = 0; i < dark.length; i++)
    for (let k = 0; k < 3; k++) {
      const strength = Math.min(1, Math.abs(amount) / 100);
      out[i * 4 + k] =
        amount >= 0
          ? (data[i * 4 + k] - air[k]) /
              Math.max(0.15, 1 - 0.95 * strength * transmission[i]) +
            air[k]
          : data[i * 4 + k] * (1 - strength * 0.7) + air[k] * strength * 0.7;
    }
  return out;
}
