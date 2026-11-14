import type { ScanPoint, ScanQuad, ScanSettings } from "./scanner-types";

export const quadArea = (q: ScanQuad) =>
  Math.abs(
    q.reduce((s, p, i) => {
      const next = q[(i + 1) % 4];
      return s + p.x * next.y - p.y * next.x;
    }, 0),
  ) / 2;

export function validScanQuad(value: unknown): value is ScanQuad {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return false;
  const q = value as ScanQuad;
  if (quadArea(q) < 0.012) return false;
  return q.every((p, i) => {
    const a = q[(i + 1) % 4],
      b = q[(i + 2) % 4];
    return (a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x) > 0.001;
  });
}

function orderCorners(points: ScanPoint[]): ScanQuad {
  const center = points.reduce(
    (s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }),
    { x: 0, y: 0 },
  );
  const sorted = [...points].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x),
  );
  let start = 0;
  for (let i = 1; i < 4; i++)
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y)
      start = i;
  return [...sorted.slice(start), ...sorted.slice(0, start)] as ScanQuad;
}

/** Sobel edges + gradient-directed Hough voting; no remote model or OpenCV runtime. */
export function detectDocument(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const gray = new Float32Array(width * height),
    smooth = new Float32Array(gray.length),
    gradient = new Float32Array(gray.length),
    normal = new Float32Array(gray.length);
  let mean = 0,
    square = 0;
  for (let p = 0; p < gray.length; p++) {
    const i = p * 4,
      a = data[i + 3] / 255;
    gray[p] =
      (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) * a +
      255 * (1 - a);
    mean += gray[p];
    square += gray[p] ** 2;
  }
  if (square / gray.length - (mean / gray.length) ** 2 < 36) return null;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      smooth[p] =
        (gray[p] * 4 +
          (gray[p - 1] + gray[p + 1] + gray[p - width] + gray[p + width]) * 2 +
          gray[p - width - 1] +
          gray[p - width + 1] +
          gray[p + width - 1] +
          gray[p + width + 1]) /
        16;
    }
  const histogram = new Uint32Array(1024);
  let edgeEnergy = 0;
  for (let y = 3; y < height - 3; y++)
    for (let x = 3; x < width - 3; x++) {
      const p = y * width + x,
        gx =
          smooth[p - width + 1] +
          2 * smooth[p + 1] +
          smooth[p + width + 1] -
          smooth[p - width - 1] -
          2 * smooth[p - 1] -
          smooth[p + width - 1],
        gy =
          smooth[p + width - 1] +
          2 * smooth[p + width] +
          smooth[p + width + 1] -
          smooth[p - width - 1] -
          2 * smooth[p - width] -
          smooth[p - width + 1],
        mag = Math.hypot(gx, gy);
      gradient[p] = mag;
      normal[p] = Math.atan2(gy, gx);
      edgeEnergy += mag * mag;
      histogram[Math.min(1023, Math.round(mag))]++;
    }
  let count = 0,
    threshold = 65;
  for (let i = 1023; i >= 65; i--) {
    count += histogram[i];
    if (count > width * height * 0.12) {
      threshold = i;
      break;
    }
  }
  const angles = 90,
    diagonal = Math.ceil(Math.hypot(width, height)),
    bins = diagonal + 1,
    votes = new Uint16Array(angles * bins),
    cos = new Float32Array(angles),
    sin = new Float32Array(angles),
    edgePixels: number[] = [];
  for (let a = 0; a < angles; a++) {
    cos[a] = Math.cos((a * Math.PI) / angles);
    sin[a] = Math.sin((a * Math.PI) / angles);
  }
  for (let y = 3; y < height - 3; y++)
    for (let x = 3; x < width - 3; x++) {
      const p = y * width + x;
      if (gradient[p] < threshold) continue;
      edgePixels.push(p);
      const direction = Math.round((normal[p] * angles) / Math.PI);
      for (let offset = -3; offset <= 3; offset++) {
        const a = (((direction + offset) % angles) + angles) % angles,
          rho = Math.round((x * cos[a] + y * sin[a] + diagonal) / 2);
        votes[a * bins + rho] += gradient[p] > threshold * 2 ? 2 : 1;
      }
    }
  type Line = {
    a: number;
    rho: number;
    cos: number;
    sin: number;
    votes: number;
  };
  const peaks: { a: number; rho: number; votes: number }[] = [],
    minVotes = Math.max(22, Math.min(width, height) * 0.14);
  for (let a = 0; a < angles; a++)
    for (let rho = 0; rho < bins; rho++)
      if (votes[a * bins + rho] > minVotes)
        peaks.push({ a, rho, votes: votes[a * bins + rho] });
  peaks.sort((a, b) => b.votes - a.votes);
  const lines: Line[] = [];
  for (const peak of peaks) {
    if (
      lines.some((l) => {
        const diff = Math.abs(l.a - peak.a),
          flipped = diff > angles / 2;
        return (
          Math.min(diff, angles - diff) < 4 &&
          Math.abs(
            l.rho -
              (flipped ? -(peak.rho * 2 - diagonal) : peak.rho * 2 - diagonal),
          ) < 10
        );
      })
    )
      continue;
    lines.push({
      a: peak.a,
      rho: peak.rho * 2 - diagonal,
      cos: cos[peak.a],
      sin: sin[peak.a],
      votes: peak.votes,
    });
    if (lines.length >= 24) break;
  }
  // Hough bins locate edges quickly; weighted line fitting removes their angle quantization before rectification.
  for (const line of lines) {
    let weight = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0;
    const angle = Math.atan2(line.sin, line.cos);
    for (const p of edgePixels) {
      const x = p % width,
        y = Math.floor(p / width);
      if (
        Math.abs(x * line.cos + y * line.sin - line.rho) > 3 ||
        Math.abs(Math.cos(normal[p] - angle)) < 0.9
      )
        continue;
      const w = gradient[p];
      weight += w;
      sx += w * x;
      sy += w * y;
      sxx += w * x * x;
      syy += w * y * y;
      sxy += w * x * y;
    }
    if (weight < (minVotes * threshold) / 2) continue;
    const x = sx / weight,
      y = sy / weight,
      direction =
        0.5 *
        Math.atan2(
          2 * (sxy / weight - x * y),
          sxx / weight - x * x - (syy / weight - y * y),
        ),
      nx = -Math.sin(direction),
      ny = Math.cos(direction),
      dot = nx * line.cos + ny * line.sin;
    if (Math.abs(dot) < 0.995) continue;
    line.cos = nx * Math.sign(dot);
    line.sin = ny * Math.sign(dot);
    line.rho = line.cos * x + line.sin * y;
  }
  const pairs: [Line, Line][] = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j],
        dot = a.cos * b.cos + a.sin * b.sin;
      if (
        Math.abs(dot) > 0.9 &&
        Math.abs(a.rho - Math.sign(dot) * b.rho) >
          Math.min(width, height) * 0.22
      )
        pairs.push([a, b]);
    }
  const intersect = (a: Line, b: Line) => {
    const d = a.cos * b.sin - a.sin * b.cos;
    return {
      x: (a.rho * b.sin - a.sin * b.rho) / d / (width - 1),
      y: (a.cos * b.rho - a.rho * b.cos) / d / (height - 1),
    };
  };
  let best: {
      corners: ScanQuad;
      confidence: number;
      sharpness: number;
    } | null = null,
    bestScore = 0;
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i],
        [c, d] = pairs[j];
      if (
        [a, b].some((l) => l === c || l === d) ||
        Math.abs(a.cos * c.cos + a.sin * c.sin) > 0.6
      )
        continue;
      const points = [
        intersect(a, c),
        intersect(a, d),
        intersect(b, c),
        intersect(b, d),
      ];
      if (
        points.some(
          (p) =>
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            p.x < -0.02 ||
            p.y < -0.02 ||
            p.x > 1.02 ||
            p.y > 1.02,
        )
      )
        continue;
      const q = orderCorners(
        points.map((p) => ({
          x: Math.max(0, Math.min(1, p.x)),
          y: Math.max(0, Math.min(1, p.y)),
        })),
      );
      if (!validScanQuad(q)) continue;
      const area = quadArea(q);
      if (area < 0.1 || area > 0.985) continue;
      // Printed text and table cells are edges too. A page needs a distinct paper background on its outside.
      const paperSamples: number[] = [],
        outsideSamples: number[] = [];
      for (let yy = 1; yy <= 7; yy++)
        for (let xx = 1; xx <= 7; xx++) {
          const u = xx / 8,
            v = yy / 8,
            x =
              (q[0].x * (1 - u) * (1 - v) +
                q[1].x * u * (1 - v) +
                q[2].x * u * v +
                q[3].x * (1 - u) * v) *
              (width - 1),
            y =
              (q[0].y * (1 - u) * (1 - v) +
                q[1].y * u * (1 - v) +
                q[2].y * u * v +
                q[3].y * (1 - u) * v) *
              (height - 1);
          paperSamples.push(gray[Math.round(y) * width + Math.round(x)]);
        }
      for (let side = 0; side < 4; side++) {
        const a = q[side],
          b = q[(side + 1) % 4],
          dx = (b.x - a.x) * width,
          dy = (b.y - a.y) * height,
          length = Math.hypot(dx, dy);
        for (let step = 1; step <= 5; step++) {
          const t = step / 6,
            x = Math.round(
              (a.x + (b.x - a.x) * t) * (width - 1) + (dy / length) * 8,
            ),
            y = Math.round(
              (a.y + (b.y - a.y) * t) * (height - 1) - (dx / length) * 8,
            );
          if (x > 1 && y > 1 && x < width - 2 && y < height - 2)
            outsideSamples.push(gray[y * width + x]);
        }
      }
      paperSamples.sort((a, b) => a - b);
      outsideSamples.sort((a, b) => a - b);
      const paper = paperSamples[Math.floor(paperSamples.length * 0.85)],
        outside = outsideSamples[Math.floor(outsideSamples.length * 0.85)];
      if (outsideSamples.length < 6 || Math.abs(paper - outside) < 12) continue;
      let support = 0,
        weakest = 1;
      for (let side = 0; side < 4; side++) {
        const p = q[side],
          next = q[(side + 1) % 4],
          dx = (next.x - p.x) * width,
          dy = (next.y - p.y) * height,
          length = Math.hypot(dx, dy),
          steps = Math.max(8, Math.round(length / 3));
        let hits = 0;
        for (let s = 1; s < steps; s++) {
          const x = (p.x + ((next.x - p.x) * s) / steps) * (width - 1),
            y = (p.y + ((next.y - p.y) * s) / steps) * (height - 1);
          let strength = 0;
          for (let r = -3; r <= 3; r++) {
            const xx = Math.round(x - (dy / length) * r),
              yy = Math.round(y + (dx / length) * r);
            if (xx > 1 && yy > 1 && xx < width - 2 && yy < height - 2)
              strength = Math.max(strength, gradient[yy * width + xx]);
          }
          if (strength > threshold * 0.7) hits++;
        }
        const rate = hits / (steps - 1);
        support += rate / 4;
        weakest = Math.min(weakest, rate);
      }
      if (weakest < 0.3) continue;
      const score = Math.sqrt(area) * (0.35 + 0.65 * support);
      if (score > bestScore) {
        bestScore = score;
        best = {
          corners: q,
          confidence: Math.min(0.99, support * 0.75 + Math.sqrt(area) * 0.25),
          sharpness: Math.sqrt(edgeEnergy / (width * height)),
        };
      }
    }
  return best;
}

/** Homography from the unit square to a quadrilateral, including perspective. */
export function scanHomography(q: ScanQuad) {
  const [p0, p1, p2, p3] = q,
    dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x,
    dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y,
    determinant = dx1 * dy2 - dx2 * dy1;
  const g =
      Math.abs(dx3) + Math.abs(dy3) < 1e-10
        ? 0
        : (dx3 * dy2 - dx2 * dy3) / determinant,
    h =
      Math.abs(dx3) + Math.abs(dy3) < 1e-10
        ? 0
        : (dx1 * dy3 - dx3 * dy1) / determinant;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
  ];
}
export function scanDimensions(
  width: number,
  height: number,
  q: ScanQuad,
  aspect: ScanSettings["aspect"],
  max = 3200,
) {
  const distance = (a: ScanPoint, b: ScanPoint) =>
    Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  let w = Math.max(distance(q[0], q[1]), distance(q[3], q[2])),
    h = Math.max(distance(q[0], q[3]), distance(q[1], q[2]));
  const ratio = {
    auto: 0,
    a4: 210 / 297,
    letter: 8.5 / 11,
    card: 85.6 / 53.98,
  }[aspect];
  if (ratio) {
    const area = w * h;
    w = Math.sqrt(area * ratio);
    h = w / ratio;
  }
  const scale = Math.min(1, max / Math.max(w, h), Math.sqrt(8000000 / (w * h)));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function enhanceDocument(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: ScanSettings,
) {
  if (settings.filter === "original") return data;
  // Local paper-white estimation ignores most dark text, unlike a simple global contrast filter.
  const tile = Math.max(12, Math.round(Math.min(width, height) / 22)),
    cols = Math.ceil(width / tile),
    rows = Math.ceil(height / tile),
    backgrounds = new Float32Array(cols * rows),
    hist = new Uint32Array(256);
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      hist.fill(0);
      let count = 0;
      for (let y = ty * tile; y < Math.min(height, (ty + 1) * tile); y += 2)
        for (let x = tx * tile; x < Math.min(width, (tx + 1) * tile); x += 2) {
          const i = (y * width + x) * 4,
            lum = Math.round(
              data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722,
            );
          hist[lum]++;
          count++;
        }
      let cumulative = 0,
        background = 255;
      for (let l = 255; l >= 0; l--) {
        cumulative += hist[l];
        if (cumulative > count * 0.15) {
          background = l;
          break;
        }
      }
      backgrounds[ty * cols + tx] = Math.max(45, background);
    }
  const amount = settings.strength / 100,
    luminanceWeights = [0.2126, 0.7152, 0.0722];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(cols - 1, x / tile - 0.5)),
        fy = Math.max(0, Math.min(rows - 1, y / tile - 0.5)),
        x0 = Math.floor(fx),
        y0 = Math.floor(fy),
        x1 = Math.min(cols - 1, x0 + 1),
        y1 = Math.min(rows - 1, y0 + 1),
        ax = fx - x0,
        ay = fy - y0,
        bg =
          (backgrounds[y0 * cols + x0] * (1 - ax) +
            backgrounds[y0 * cols + x1] * ax) *
            (1 - ay) +
          (backgrounds[y1 * cols + x0] * (1 - ax) +
            backgrounds[y1 * cols + x1] * ax) *
            ay,
        i = (y * width + x) * 4;
      let lum = 0;
      for (let k = 0; k < 3; k++) {
        const normalized = Math.max(
          0,
          Math.min(255, ((data[i + k] / bg) * 255 - 128) * 1.12 + 128),
        );
        const color = data[i + k] * (1 - amount) + normalized * amount;
        data[i + k] = color;
        lum += color * luminanceWeights[k];
      }
      if (settings.filter === "gray") data[i] = data[i + 1] = data[i + 2] = lum;
      if (settings.filter === "bw")
        data[i] =
          data[i + 1] =
          data[i + 2] =
            lum < settings.threshold ? 0 : 255;
      if (settings.filter === "whiteboard") {
        const saturation =
          Math.max(data[i], data[i + 1], data[i + 2]) -
          Math.min(data[i], data[i + 1], data[i + 2]);
        if (lum > 175 && saturation < 50)
          for (let k = 0; k < 3; k++)
            data[i + k] += (255 - data[i + k]) * amount;
      }
    }
  return data;
}

export function renderDocument(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  q: ScanQuad,
  settings: ScanSettings,
  max = 3200,
) {
  if (!validScanQuad(q))
    throw new Error("Keep all four corners in a clockwise, uncrossed shape.");
  const size = scanDimensions(width, height, q, settings.aspect, max),
    output = new Uint8ClampedArray(size.width * size.height * 4),
    m = scanHomography(q);
  for (let y = 0; y < size.height; y++)
    for (let x = 0; x < size.width; x++) {
      const u = size.width > 1 ? x / (size.width - 1) : 0.5,
        v = size.height > 1 ? y / (size.height - 1) : 0.5,
        denominator = m[6] * u + m[7] * v + 1,
        xx = Math.max(
          0,
          Math.min(
            width - 1,
            ((m[0] * u + m[1] * v + m[2]) / denominator) * (width - 1),
          ),
        ),
        yy = Math.max(
          0,
          Math.min(
            height - 1,
            ((m[3] * u + m[4] * v + m[5]) / denominator) * (height - 1),
          ),
        ),
        x0 = Math.floor(xx),
        y0 = Math.floor(yy),
        ax = xx - x0,
        ay = yy - y0,
        target = (y * size.width + x) * 4;
      const indices = [
          (y0 * width + x0) * 4,
          (y0 * width + Math.min(width - 1, x0 + 1)) * 4,
          (Math.min(height - 1, y0 + 1) * width + x0) * 4,
          (Math.min(height - 1, y0 + 1) * width + Math.min(width - 1, x0 + 1)) *
            4,
        ],
        weights = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay];
      for (let k = 0; k < 3; k++) {
        let value = 0;
        for (let i = 0; i < 4; i++) {
          const p = indices[i],
            alpha = data[p + 3] / 255;
          value += (data[p + k] * alpha + 255 * (1 - alpha)) * weights[i];
        }
        output[target + k] = value;
      }
      output[target + 3] = 255;
    }
  enhanceDocument(output, size.width, size.height, settings);
  const turns = ((settings.turns % 4) + 4) % 4;
  if (!turns) return { ...size, data: output };
  const w = turns % 2 ? size.height : size.width,
    h = turns % 2 ? size.width : size.height,
    rotated = new Uint8ClampedArray(output.length);
  for (let y = 0; y < size.height; y++)
    for (let x = 0; x < size.width; x++) {
      const xx =
          turns === 1
            ? size.height - 1 - y
            : turns === 2
              ? size.width - 1 - x
              : y,
        yy =
          turns === 1
            ? x
            : turns === 2
              ? size.height - 1 - y
              : size.width - 1 - x,
        source = (y * size.width + x) * 4,
        target = (yy * w + xx) * 4;
      rotated.set(output.subarray(source, source + 4), target);
    }
  return { width: w, height: h, data: rotated };
}
