import { type Edit, type Params, looks } from "./catalog";
import {
  clamp,
  mix,
  luminance,
  rgbToHsl,
  hslToRgb,
  parseCube,
  sampleLut,
} from "./color";
import { tone } from "./color";
import { contentAware } from "./content-aware";
import { warpFace, faceRegion } from "./face-mesh";
import { recoverHaze } from "./dehaze";
import { developRaw } from "./raw";
import {
  collageLayout,
  cutoutAlpha,
  skinWeight,
  stickers,
} from "./composition";

type Canvas = HTMLCanvasElement;
export function canvas(w: number, h: number): Canvas {
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w * h > 48_000_000 ||
    w > 16384 ||
    h > 16384
  )
    throw new Error(
      "This edit exceeds the canvas memory limit. Try a smaller export size or border.",
    );
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function context(c: Canvas) {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create an image canvas.");
  return ctx;
}
function copy(src: Canvas): Canvas {
  const c = canvas(src.width, src.height);
  context(c).drawImage(src, 0, 0);
  return c;
}
function pixels(
  c: Canvas,
  fn: (
    r: number,
    g: number,
    b: number,
    x: number,
    y: number,
    i: number,
  ) => number[],
) {
  const ctx = context(c),
    im = ctx.getImageData(0, 0, c.width, c.height),
    d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const pixel = i / 4,
      res = fn(
        d[i],
        d[i + 1],
        d[i + 2],
        pixel % c.width,
        Math.floor(pixel / c.width),
        i,
      );
    d[i] = res[0];
    d[i + 1] = res[1];
    d[i + 2] = res[2];
  }
  ctx.putImageData(im, 0, 0);
  return c;
}
function blurred(src: Canvas, r: number): Canvas {
  const out = copy(src),
    ctx = context(out);
  ctx.filter = `blur(${r}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  return out;
}
function detail(
  src: Canvas,
  amount: number,
  radius: number,
  weight?: (l: number) => number,
): Canvas {
  if (!amount) return src;
  const small = blurred(src, radius),
    b = context(small).getImageData(0, 0, src.width, src.height).data;
  return pixels(src, (r, g, bb, _x, _y, i) => {
    const a = amount * (weight ? weight(luminance(r, g, bb) / 255) : 1);
    return [
      r + (r - b[i]) * a,
      g + (g - b[i + 1]) * a,
      bb + (bb - b[i + 2]) * a,
    ];
  });
}
function vignette(src: Canvas, p: Params) {
  const x = (Number(p.x ?? 50) / 100) * src.width,
    y = (Number(p.y ?? 50) / 100) * src.height,
    size = Number(p.size ?? 50) / 100;
  return pixels(src, (r, g, b, px, py) => {
    const dist = Math.hypot(
      (px - x) / (src.width * 0.72),
      (py - y) / (src.height * 0.72),
    );
    const t = clamp((dist - size * 0.7) / Math.max(0.1, 1 - size * 0.7), 0, 1);
    const change = mix(
      Number(p.inner || 0) * 0.7,
      Number(p.outer ?? -40) * 1.4,
      t * t,
    );
    return [r + change, g + change, b + change];
  });
}
function noise(x: number, y: number, seed = 0) {
  let n = Math.imul(x + seed * 374761393, 668265263) ^ Math.imul(y, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const imageCache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(
  url: string,
  cache = true,
): Promise<HTMLImageElement> {
  if (cache && imageCache.has(url)) return imageCache.get(url)!;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(url);
      reject(
        new Error(
          "This image could not be decoded. Try JPG, PNG, WebP, or a supported camera RAW.",
        ),
      );
    };
    image.src = url;
  });
  if (cache) imageCache.set(url, promise);
  // Bound decoded overlay retention. Object URLs for primary images are not cached.
  if (imageCache.size > 4) imageCache.delete(imageCache.keys().next().value!);
  return promise;
}

export function fitDimensions(
  width: number,
  height: number,
  maxDimension: number,
) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function resizeOutput(source: Canvas, maxDimension: number): Canvas {
  if (Math.max(source.width, source.height) <= maxDimension) return source;
  const dim = fitDimensions(source.width, source.height, maxDimension),
    out = canvas(dim.width, dim.height);
  context(out).drawImage(source, 0, 0, dim.width, dim.height);
  return out;
}

export async function renderImage(
  source: HTMLImageElement | HTMLCanvasElement,
  edits: Edit[],
  maxDimension = 1400,
  rawSource?: Blob,
): Promise<Canvas> {
  if (rawSource) {
    const rawEdits = edits.filter((e) => e.tool === "raw");
    if (rawEdits.length) {
      source = await developRaw(
        rawSource,
        Object.assign({}, ...rawEdits.map((e) => e.params)),
      );
      edits = edits.filter((e) => e.tool !== "raw");
    }
  }
  const { width, height } = fitDimensions(
    "naturalWidth" in source ? source.naturalWidth : source.width,
    "naturalHeight" in source ? source.naturalHeight : source.height,
    maxDimension,
  );
  let output = canvas(width, height);
  context(output).drawImage(source, 0, 0, width, height);
  for (const edit of edits) output = await applyEdit(output, edit);
  return output;
}

async function applyEdit(src: Canvas, edit: Edit): Promise<Canvas> {
  const { tool, params: originalParams } = edit,
    p = { ...originalParams },
    n = (k: string, d = 0) => Number(p[k] ?? d),
    w = src.width,
    h = src.height;
  let subject: Uint8ClampedArray | undefined;
  if (
    edit.mask &&
    ["selective", "brush", "lens-blur", "motion", "background"].includes(tool)
  ) {
    const image = await loadImage(edit.mask),
      mask = canvas(w, h);
    context(mask).drawImage(image, 0, 0, w, h);
    subject = context(mask).getImageData(0, 0, w, h).data;
  }
  if (tool === "look") {
    const look = looks.find((l) => l.id === p.look);
    if (!look || look.id === "original") return src;
    const out = canvas(w, h),
      ctx = context(out);
    ctx.filter = look.filter;
    ctx.drawImage(src, 0, 0);
    return out;
  }
  if (["tune", "white-balance", "raw"].includes(tool))
    return pixels(src, (r, g, b) => tone(r, g, b, p));
  if (tool === "details") {
    src = detail(src, n("structure") / 45, Math.max(1, w / 170));
    return detail(src, n("sharpening") / 35, Math.max(0.6, w / 1500));
  }
  if (tool === "curves") {
    const keys = ["blacks", "shadows", "midtones", "highlights", "whites"];
    const values = keys.map((k, i) => clamp(i / 4 + n(k) / 300, 0, 1));
    const lut = Array.from({ length: 256 }, (_, i) => {
      const t = (i / 255) * 4,
        lo = Math.min(3, Math.floor(t));
      return mix(values[lo], values[lo + 1], t - lo) * 255;
    });
    const tables = new Map<string, Float32Array>();
    for (const key of [
      "curveRGB",
      "curveRed",
      "curveGreen",
      "curveBlue",
      "curveLuma",
    ])
      if (p[key]) {
        const points = JSON.parse(String(p[key])) as number[][];
        tables.set(
          key,
          Float32Array.from({ length: 256 }, (_, value) => {
            const x = value / 255;
            let low = 0;
            while (low < points.length - 2 && points[low + 1][0] < x) low++;
            const a = points[low],
              b = points[low + 1];
            return (
              mix(
                a[1],
                b[1],
                clamp((x - a[0]) / Math.max(0.00001, b[0] - a[0]), 0, 1),
              ) * 255
            );
          }),
        );
      }
    const curve = (value: number, key: string) => {
      const table = tables.get(key);
      if (!table) return value;
      const v = clamp(value),
        lo = Math.floor(v),
        hi = Math.min(255, lo + 1);
      return mix(table[lo], table[hi], v - lo);
    };
    const adjust = (v: number, channel: string) => {
      v = curve(curve(v, "curveRGB"), channel);
      if (
        p.channel === "rgb" ||
        p.channel === channel.replace("curve", "").toLowerCase()
      ) {
        const pos = (clamp(v, 0, 255) / 255) * 255,
          lo = Math.floor(pos),
          hi = Math.min(255, lo + 1);
        v = mix(lut[lo], lut[hi], pos - lo);
      }
      return v;
    };
    return pixels(src, (r, g, b) => {
      let color = [
        adjust(r, "curveRed"),
        adjust(g, "curveGreen"),
        adjust(b, "curveBlue"),
      ];
      if (p.curveLuma || p.channel === "luma") {
        const l = luminance(color[0], color[1], color[2]),
          target = curve(l, "curveLuma"),
          mapped =
            p.channel === "luma"
              ? mix(
                  lut[Math.floor(clamp(target))],
                  lut[Math.min(255, Math.ceil(clamp(target)))],
                  target % 1,
                )
              : target,
          gain = l > 0.001 ? mapped / l : 1;
        color = color.map((v) => v * gain);
      }
      return color;
    });
  }
  if (tool === "crop") {
    const left = (n("left") / 100) * w,
      top = (n("top") / 100) * h,
      ww = w * (1 - (n("left") + n("right")) / 100),
      hh = h * (1 - (n("top") + n("bottom")) / 100);
    const out = canvas(ww, hh);
    context(out).drawImage(src, left, top, ww, hh, 0, 0, out.width, out.height);
    return out;
  }
  if (tool === "rotate" || tool === "flip") {
    const quarter = ((n("turns") % 4) + 4) % 4,
      rad = ((quarter * 90 + n("angle")) * Math.PI) / 180,
      cs = Math.cos(rad),
      sn = Math.sin(rad);
    const out = canvas(
        Math.abs(w * cs) + Math.abs(h * sn),
        Math.abs(w * sn) + Math.abs(h * cs),
      ),
      ctx = context(out);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(rad);
    ctx.scale(n("flipX") ? -1 : 1, n("flipY") ? -1 : 1);
    ctx.drawImage(src, -w / 2, -h / 2);
    return out;
  }
  if (tool === "collage" && edit.images?.length) {
    const sources = [
        src,
        ...(await Promise.all(
          edit.images.slice(0, 8).map((url) => loadImage(url)),
        )),
      ],
      sizes = sources.map((image) => ({
        width: "naturalWidth" in image ? image.naturalWidth : image.width,
        height: "naturalHeight" in image ? image.naturalHeight : image.height,
      })),
      layout = collageLayout(sizes, p, Math.max(w, h)),
      out = canvas(layout.width, layout.height),
      ctx = context(out);
    ctx.fillStyle = String(p.color || "#f3f0e8");
    ctx.fillRect(0, 0, out.width, out.height);
    for (const cell of layout.cells) {
      const image = sources[cell.index],
        size = sizes[cell.index],
        scale = (
          p.fit === "contain" || p.layout !== "grid" ? Math.min : Math.max
        )(cell.width / size.width, cell.height / size.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cell.x, cell.y, cell.width, cell.height);
      ctx.clip();
      ctx.drawImage(
        image,
        cell.x + (cell.width - size.width * scale) / 2,
        cell.y + (cell.height - size.height * scale) / 2,
        size.width * scale,
        size.height * scale,
      );
      ctx.restore();
    }
    return out;
  }
  if (tool === "background" && subject) {
    const cutout = copy(src),
      cx = context(cutout),
      im = cx.getImageData(0, 0, w, h);
    for (let i = 0; i < im.data.length; i += 4)
      im.data[i + 3] = Math.round(
        im.data[i + 3] *
          cutoutAlpha(subject[i + 3] / 255, n("edge"), n("feather", 15)),
      );
    cx.putImageData(im, 0, 0);
    if (p.fill === "transparent" || !p.fill) return cutout;
    const out = canvas(w, h),
      ctx = context(out);
    if (p.fill === "image" && edit.image) {
      const image = await loadImage(edit.image),
        scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      ctx.drawImage(
        image,
        (w - image.naturalWidth * scale) / 2,
        (h - image.naturalHeight * scale) / 2,
        image.naturalWidth * scale,
        image.naturalHeight * scale,
      );
    } else {
      ctx.fillStyle = String(p.color || "#f3f0e8");
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(cutout, 0, 0);
    return out;
  }
  if (tool === "perspective") {
    const original = context(src).getImageData(0, 0, w, h),
      out = context(src).createImageData(w, h),
      d = out.data,
      s = original.data,
      tx = n("horizontal") / 300,
      ty = n("vertical") / 300,
      scale = 1 + n("scale") / 100;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const nx = (x / w - 0.5) / scale,
          ny = (y / h - 0.5) / scale,
          den = 1 + nx * tx * 2 + ny * ty * 2;
        const sx = clamp(Math.round((nx / den + 0.5) * w), 0, w - 1),
          sy = clamp(Math.round((ny / den + 0.5) * h), 0, h - 1),
          i = (y * w + x) * 4,
          j = (sy * w + sx) * 4;
        d[i] = s[j];
        d[i + 1] = s[j + 1];
        d[i + 2] = s[j + 2];
        d[i + 3] = s[j + 3];
      }
    context(src).putImageData(out, 0, 0);
    return src;
  }
  if (tool === "expand") {
    const pad = Math.round((Math.min(w, h) * n("amount")) / 100),
      out = canvas(w + pad * 2, h + pad * 2),
      ctx = context(out);
    if (p.fill === "mirror") {
      for (let yy = -1; yy <= 1; yy++)
        for (let xx = -1; xx <= 1; xx++) {
          ctx.save();
          ctx.translate(
            pad + xx * w + (xx ? w : 0),
            pad + yy * h + (yy ? h : 0),
          );
          ctx.scale(xx ? -1 : 1, yy ? -1 : 1);
          ctx.drawImage(src, 0, 0);
          ctx.restore();
        }
    } else {
      ctx.fillStyle = p.fill === "black" ? "#000" : "#fff";
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(src, pad, pad);
    if (p.fill === "smart") {
      const mask = canvas(out.width, out.height),
        mx = context(mask);
      mx.fillStyle = "#fff";
      mx.fillRect(0, 0, out.width, out.height);
      mx.clearRect(pad, pad, w, h);
      return contentAware(out, mask);
    }
    return out;
  }
  if (tool === "selective") {
    const cx = (n("x", 50) / 100) * w,
      cy = (n("y", 50) / 100) * h,
      radius = (n("radius", 25) / 100) * Math.min(w, h),
      sample = context(src).getImageData(
        clamp(Math.floor(cx), 0, w - 1),
        clamp(Math.floor(cy), 0, h - 1),
        1,
        1,
      ).data;
    return pixels(src, (r, g, b, x, y, i) => {
      let a = clamp(1 - Math.hypot(x - cx, y - cy) / radius, 0, 1);
      a = a * a * (3 - 2 * a);
      if (subject && (p.mask === "subject" || p.mask === "background"))
        a =
          p.mask === "background"
            ? 1 - subject[i + 3] / 255
            : subject[i + 3] / 255;
      if (p.mask === "color")
        a *= clamp(
          1 - Math.hypot(r - sample[0], g - sample[1], b - sample[2]) / 140,
          0,
          1,
        );
      const t = tone(r, g, b, p);
      return [mix(r, t[0], a), mix(g, t[1], a), mix(b, t[2], a)];
    });
  }
  if (tool === "brush") {
    const mask = new Float32Array(w * h);
    for (const point of edit.points || []) {
      const r = point.radius * Math.min(w, h),
        cx = point.x * w,
        cy = point.y * h;
      for (
        let y = Math.max(0, Math.floor(cy - r));
        y < Math.min(h, cy + r);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(cx - r));
          x < Math.min(w, cx + r);
          x++
        ) {
          const a = clamp(1 - Math.hypot(x - cx, y - cy) / r, 0, 1);
          mask[y * w + x] = Math.max(mask[y * w + x], a);
        }
    }
    const param =
      p.mode === "temperature"
        ? "warmth"
        : p.mode === "saturation"
          ? "saturation"
          : p.mode === "dodge"
            ? "brightness"
            : "exposure";
    return pixels(src, (r, g, b, _x, _y, i) =>
      tone(r, g, b, {
        [param]:
          n("amount") *
          mask[i / 4] *
          (subject
            ? p.target === "background"
              ? 1 - subject[i + 3] / 255
              : subject[i + 3] / 255
            : 1),
      }),
    );
  }
  if (tool === "healing") {
    if (p.method === "smart" && edit.points?.length) {
      const mask = canvas(w, h),
        ctx = context(mask);
      ctx.fillStyle = "#fff";
      for (const point of edit.points) {
        ctx.beginPath();
        ctx.arc(
          point.x * w,
          point.y * h,
          point.radius * Math.min(w, h),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      return contentAware(src, mask);
    }
    const original = context(src).getImageData(0, 0, w, h),
      out = context(src).getImageData(0, 0, w, h),
      d = out.data;
    for (const point of edit.points || []) {
      const radius = point.radius * Math.min(w, h),
        cx = point.x * w,
        cy = point.y * h;
      for (
        let y = Math.max(0, Math.floor(cy - radius));
        y < Math.min(h, cy + radius);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(cx - radius));
          x < Math.min(w, cx + radius);
          x++
        ) {
          const distance = Math.hypot(x - cx, y - cy) / radius;
          if (distance > 1) continue;
          const a = clamp((1 - distance) * 4, 0, 1),
            sx = clamp(Math.round(x + (n("offsetX", 12) / 100) * w), 0, w - 1),
            sy = clamp(Math.round(y + (n("offsetY") / 100) * h), 0, h - 1),
            i = (y * w + x) * 4,
            j = (sy * w + sx) * 4;
          for (let k = 0; k < 3; k++)
            d[i + k] = mix(d[i + k], original.data[j + k], a);
        }
    }
    context(src).putImageData(out, 0, 0);
    return src;
  }
  if (
    tool === "hdr" ||
    tool === "tonal" ||
    tool === "drama" ||
    tool === "dehaze"
  ) {
    if (tool === "hdr") {
      src = detail(src, n("strength") / 35, Math.max(3, w / 60));
      return pixels(src, (r, g, b) =>
        tone(r, g, b, {
          brightness: n("brightness"),
          saturation: n("saturation"),
          shadows: n("strength") * 0.35,
          highlights: -n("strength") * 0.25,
        }),
      );
    }
    if (tool === "tonal")
      return detail(
        src,
        1,
        Math.max(2, w / 100),
        (l) => n(l > 0.67 ? "high" : l > 0.33 ? "mid" : "low") / 35,
      );
    if (tool === "drama") {
      src = detail(src, n("strength") / 20, Math.max(4, w / 50));
      return pixels(src, (r, g, b) =>
        tone(r, g, b, {
          contrast: n("strength") * 0.4,
          saturation: n("saturation"),
        }),
      );
    }
    const ctx = context(src),
      image = ctx.getImageData(0, 0, w, h);
    ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray(recoverHaze(image.data, w, h, n("amount"))),
        w,
        h,
      ),
      0,
      0,
    );
    return pixels(src, (r, g, b) =>
      tone(r, g, b, { saturation: n("saturation") }),
    );
  }
  if (["glamour", "bloom", "halation"].includes(tool)) {
    const glow = blurred(
        src,
        Math.max(
          1,
          (w / 1000) * (tool === "glamour" ? 12 : n("radius", 30) / 2),
        ),
      ),
      gd = context(glow).getImageData(0, 0, w, h).data;
    return pixels(src, (r, g, b, _x, _y, i) => {
      const l = luminance(gd[i], gd[i + 1], gd[i + 2]) / 255;
      if (tool === "glamour") {
        const a = n("glow") / 160;
        return tone(
          mix(r, gd[i], a) + a * 15,
          mix(g, gd[i + 1], a) + a * 15,
          mix(b, gd[i + 2], a) + a * 15,
          { warmth: n("warmth"), saturation: n("saturation") },
        );
      }
      const a =
        (clamp((l - n("threshold", 65) / 100) * 3, 0, 1) * n("strength")) / 100;
      return tool === "halation"
        ? [
            r + gd[i] * a * 0.6,
            g + gd[i + 1] * a * 0.12,
            b + gd[i + 2] * a * 0.04,
          ]
        : [
            255 - (255 - r) * (1 - (gd[i] / 255) * a),
            255 - (255 - g) * (1 - (gd[i + 1] / 255) * a),
            255 - (255 - b) * (1 - (gd[i + 2] / 255) * a),
          ];
    });
  }
  if (["vintage", "grain", "retrolux", "grunge", "bw", "noir"].includes(tool)) {
    const strength = n("strength", 50) / 100;
    src = pixels(src, (r, g, b, x, y) => {
      if (tool === "bw" || tool === "noir") {
        const grey = luminance(r, g, b);
        const t = tone(grey, grey, grey, {
          contrast: n("contrast"),
          brightness: n("brightness"),
        });
        const grain = (noise(x, y) - 0.5) * n("grain") * 0.7,
          wash = tool === "noir" ? n("wash") * 0.4 : 0;
        return [
          t[0] + grain + wash,
          t[1] + grain + wash * 0.85,
          t[2] + grain + wash * 0.6,
        ];
      }
      let t = tone(r, g, b, {
        saturation: tool === "grain" ? -strength * 25 : n("saturation"),
        brightness: n("brightness"),
        contrast: tool === "grunge" ? strength * 35 : -strength * 15,
        warmth: strength * 35,
      });
      if (tool === "grain" && p.stock && p.stock !== "neutral") {
        const stock: Record<string, Record<string, number>> = {
          portrait: { contrast: -8, saturation: -12, warmth: 20, shadows: 8 },
          cinema: { contrast: 25, saturation: -10, warmth: -5, blacks: 6 },
          tungsten: { contrast: 12, saturation: 8, warmth: -20, highlights: 8 },
          mono: { saturation: -100, contrast: 20, shadows: 5 },
        };
        const film = tone(r, g, b, stock[String(p.stock)] || {});
        t = t.map((value, k) => mix(value, film[k], strength)) as [
          number,
          number,
          number,
        ];
      }
      if (tool === "grain" || tool === "grunge") {
        const grain =
          (noise(x, y) - 0.5) *
          n(tool === "grain" ? "grain" : "texture") *
          0.85;
        t = t.map((v) => v + grain) as [number, number, number];
      }
      if (tool === "retrolux") {
        const leak =
            Math.max(0, 1 - Math.hypot(x / w - 0.08, y / h - 0.25)) *
            n("leaks") *
            1.2,
          scratch =
            noise(Math.floor(x / 2), 0, 5) > 0.996 ? n("scratches") * 1.5 : 0;
        t = [
          t[0] + leak + scratch,
          t[1] + leak * 0.3 + scratch,
          t[2] + scratch,
        ];
      }
      return t;
    });
    return tool === "vintage" || tool === "grunge" || tool === "noir"
      ? vignette(src, {
          outer: tool === "vintage" ? -n("vignette") : -25,
          size: 55,
        })
      : src;
  }
  if (tool === "portrait" || tool === "skin") {
    const face = edit.faces?.[n("faceIndex")];
    if (face) Object.assign(p, faceRegion(face, w, h));
    const soft = blurred(src, Math.max(1, (w / 700) * 3)),
      sd = context(soft).getImageData(0, 0, w, h).data,
      cx = (n("centerX", 50) / 100) * w,
      cy = (n("centerY", 40) / 100) * h,
      rx = (n("radius", 25) / 100) * Math.min(w, h),
      ry = rx * 1.35;
    return pixels(src, (r, g, b, x, y, i) => {
      let a = clamp(1 - Math.hypot((x - cx) / rx, (y - cy) / ry), 0, 1);
      if (tool === "skin") {
        a = Math.min(1, a * 3) * skinWeight(r, g, b);
        // Exclude the eye and mouth regions when facial landmarks are available.
        if (face)
          for (const [index, sx, sy] of [
            [33, 0.25, 0.12],
            [263, 0.25, 0.12],
            [13, 0.32, 0.15],
          ]) {
            const point = face[index];
            if (point)
              a *=
                1 -
                Math.exp(
                  -(
                    ((x - point.x * w) / (rx * sx)) ** 2 +
                    ((y - point.y * h) / (ry * sy)) ** 2
                  ) * 2,
                );
          }
        const difference = Math.abs(
            luminance(r, g, b) - luminance(sd[i], sd[i + 1], sd[i + 2]),
          ),
          smoothing =
            ((a * n("smooth")) / 100) *
            0.85 *
            Math.exp((-difference * difference) / 350),
          whitening = ((a * n("whiten")) / 100) * 0.3;
        return [r, g, b].map((v, channel) => {
          const softened = mix(v, sd[i + channel], smoothing);
          return softened + (255 - softened) * whitening;
        });
      }
      const smooth = (a * n("smooth")) / 130,
        eyes = face
          ? Math.max(
              ...[468, 473].map((index) => {
                const point = face[index] || face[index === 468 ? 33 : 263];
                return (
                  Math.exp(
                    -(
                      ((x - point.x * w) / (rx * 0.2)) ** 2 +
                      ((y - point.y * h) / (ry * 0.09)) ** 2
                    ),
                  ) *
                  n("eyes") *
                  0.35
                );
              }),
            )
          : Math.exp(
              -(
                ((x - cx) / rx) ** 2 +
                ((y - (cy - ry * 0.15)) / (ry * 0.15)) ** 2
              ) * 4,
            ) *
            n("eyes") *
            0.2,
        light = a * n("spotlight") * 0.5 + eyes;
      return [
        mix(r, sd[i], smooth) + light,
        mix(g, sd[i + 1], smooth) + light,
        mix(b, sd[i + 2], smooth) + light,
      ];
    });
  }
  if (tool === "head-pose") {
    if (edit.faces?.length && edit.mesh?.length) return warpFace(src, edit);
    const ctx = context(src),
      original = ctx.getImageData(0, 0, w, h),
      out = ctx.getImageData(0, 0, w, h),
      cx = (n("centerX", 50) / 100) * w,
      cy = (n("centerY", 40) / 100) * h,
      r = (n("radius", 25) / 100) * Math.min(w, h),
      s = original.data,
      d = out.data;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / r,
          ny = (y - cy) / (r * 1.35),
          dist = Math.hypot(nx, ny);
        if (dist >= 1) continue;
        const a = (1 - dist * dist) ** 2;
        const eyeMask = Math.exp(
          -((Math.abs(nx) - 0.32) ** 2 / 0.025 + (ny + 0.15) ** 2 / 0.018),
        );
        const sx = clamp(
          Math.round(
            x -
              (n("yaw") / 100) * r * 0.25 * a -
              ((x - cx) * eyeMask * n("pupils")) / 350,
          ),
          0,
          w - 1,
        );
        const smile =
          ((Math.exp(-((ny - 0.3) ** 2) / 0.03) * nx * nx * n("smile")) / 100) *
          r *
          0.2;
        const sy = clamp(
            Math.round(
              y -
                (n("pitch") / 100) * r * 0.2 * a +
                smile -
                ((y - (cy - r * 0.2)) * eyeMask * n("pupils")) / 350,
            ),
            0,
            h - 1,
          ),
          i = (y * w + x) * 4,
          j = (sy * w + sx) * 4;
        d[i] = s[j];
        d[i + 1] = s[j + 1];
        d[i + 2] = s[j + 2];
      }
    ctx.putImageData(out, 0, 0);
    return src;
  }
  if (tool === "lens-blur") {
    if (p.shape === "depth" && edit.depth) {
      const image = await loadImage(edit.depth),
        map = canvas(w, h);
      context(map).drawImage(image, 0, 0, w, h);
      const depth = context(map).getImageData(0, 0, w, h).data,
        focusIndex =
          (clamp(Math.round((n("y", 50) / 100) * h), 0, h - 1) * w +
            clamp(Math.round((n("x", 50) / 100) * w), 0, w - 1)) *
          4,
        focus = depth[focusIndex] / 255,
        levels = [
          src,
          ...[1, 2, 3, 4].map((level) =>
            blurred(src, ((((n("strength") / 100) * w) / 50) * level) / 4),
          ),
        ].map((c) => context(c).getImageData(0, 0, w, h).data);
      return pixels(src, (_r, _g, _b, _x, _y, i) => {
        const distance = Math.abs(depth[i] / 255 - focus),
          f = Math.min(
            4,
            (distance / Math.max(0.05, n("transition", 35) / 100)) * 4,
          ),
          lo = Math.floor(f),
          hi = Math.min(4, lo + 1),
          t = f - lo;
        return [0, 1, 2].map((k) =>
          mix(levels[lo][i + k], levels[hi][i + k], t),
        );
      });
    }
    const blurredImage = blurred(
        src,
        (n("strength") / 100) * Math.max(2, w / 55),
      ),
      bd = context(blurredImage).getImageData(0, 0, w, h).data,
      cx = (n("x", 50) / 100) * w,
      cy = (n("y", 50) / 100) * h,
      size = (n("size", 30) / 100) * Math.min(w, h),
      transition = Math.max(1, (n("transition", 35) / 100) * Math.min(w, h));
    src = pixels(src, (r, g, b, x, y, i) => {
      const distance =
        p.shape === "linear"
          ? Math.abs(
              (x - cx) * Math.sin((n("angle") * Math.PI) / 180) +
                (y - cy) * Math.cos((n("angle") * Math.PI) / 180),
            )
          : Math.hypot(x - cx, y - cy);
      const a =
        p.shape === "subject" && subject
          ? p.mask === "background"
            ? subject[i + 3] / 255
            : 1 - subject[i + 3] / 255
          : clamp((distance - size * 0.5) / transition, 0, 1);
      return [mix(r, bd[i], a), mix(g, bd[i + 1], a), mix(b, bd[i + 2], a)];
    });
    return vignette(src, {
      outer: -n("vignette"),
      size: 60,
      x: n("x", 50),
      y: n("y", 50),
    });
  }
  if (tool === "vignette") return vignette(src, p);
  if (tool === "double" && edit.image) {
    const image = await loadImage(edit.image),
      out = copy(src),
      ctx = context(out),
      scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    ctx.globalAlpha = n("opacity", 50) / 100;
    const modes: Record<string, GlobalCompositeOperation> = {
      screen: "screen",
      multiply: "multiply",
      overlay: "overlay",
      lighten: "lighten",
      darken: "darken",
      normal: "source-over",
    };
    ctx.globalCompositeOperation = modes[String(p.blend)] || "screen";
    ctx.drawImage(
      image,
      (w - image.naturalWidth * scale) / 2,
      (h - image.naturalHeight * scale) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    return out;
  }
  if (tool === "text") {
    const ctx = context(src),
      size = (Math.min(w, h) * n("size", 10)) / 100;
    ctx.save();
    ctx.translate(
      (w * n("positionX", 50)) / 100,
      (h * n("positionY", 50)) / 100,
    );
    ctx.rotate((n("rotation") * Math.PI) / 180);
    ctx.globalAlpha = n("opacity", 100) / 100;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${p.style === "bold" ? "700" : "400"} ${size}px ${p.font === "sans" ? '"DM Sans", sans-serif' : p.font === "mono" ? "monospace" : "Georgia, serif"}`;
    ctx.fillStyle = String(p.color || "#fff");
    const lines = String(p.text || "")
      .split("\n")
      .slice(0, 8);
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        0,
        (i - (lines.length - 1) / 2) * size * 1.25,
        w * 0.9,
      ),
    );
    ctx.restore();
    return src;
  }
  if (tool === "sticker") {
    const ctx = context(src),
      size = (Math.min(w, h) * n("size", 25)) / 100;
    ctx.save();
    ctx.translate(
      (w * n("positionX", 50)) / 100,
      (h * n("positionY", 50)) / 100,
    );
    ctx.rotate((n("rotation") * Math.PI) / 180);
    ctx.scale(n("flipX") ? -1 : 1, n("flipY") ? -1 : 1);
    ctx.globalAlpha = n("opacity", 100) / 100;
    const modes: Record<string, GlobalCompositeOperation> = {
      normal: "source-over",
      screen: "screen",
      multiply: "multiply",
      overlay: "overlay",
    };
    ctx.globalCompositeOperation = modes[String(p.blend)] || "source-over";
    if (edit.image) {
      const image = await loadImage(edit.image),
        height = (size * image.naturalHeight) / image.naturalWidth;
      ctx.drawImage(image, -size / 2, -height / 2, size, height);
    } else {
      const sticker = stickers.find((s) => s.id === p.sticker) || stickers[0];
      ctx.scale(size / 100, size / 100);
      ctx.translate(-50, -50);
      ctx.fillStyle = String(p.color || "#e6aca4");
      ctx.fill(new Path2D(sticker.path));
    }
    ctx.restore();
    return src;
  }
  if (tool === "frames") {
    const pad = (Math.min(w, h) * n("width", 5)) / 100,
      out = canvas(w + pad * 2, h + pad * 2),
      ctx = context(out);
    ctx.fillStyle = String(p.color || "#fff");
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    return out;
  }
  if (tool === "hsl") {
    const hues: Record<string, number> = {
      red: 0,
      orange: 30,
      yellow: 60,
      green: 120,
      aqua: 180,
      blue: 240,
      purple: 280,
      magenta: 320,
    };
    return pixels(src, (r, g, b) => {
      let [hh, s, l] = rgbToHsl(r, g, b);
      const delta = Math.abs(hh - (hues[String(p.range)] || 0)),
        a =
          p.range === "all"
            ? 1
            : clamp(1 - Math.min(delta, 360 - delta) / 45, 0, 1);
      hh += n("hue") * a * 0.7;
      s *= 1 + (n("saturation") / 100) * a;
      l += (n("luminance") / 200) * a;
      return hslToRgb(hh, s, l);
    });
  }
  if (tool === "color-grade") {
    const sh = hslToRgb(n("shadowHue"), 1, 0.5),
      mid = hslToRgb(n("midHue"), 1, 0.5),
      hi = hslToRgb(n("highHue"), 1, 0.5);
    return pixels(src, (r, g, b) => {
      const l = clamp(luminance(r, g, b) / 255 + n("balance") / 200, 0, 1),
        sa = ((1 - l) ** 2 * n("shadowSat")) / 200,
        ma = ((1 - Math.abs(l - 0.5) * 2) * n("midSat")) / 200,
        ha = (l * l * n("highSat")) / 200;
      return [
        r + (sh[0] - 128) * sa + (mid[0] - 128) * ma + (hi[0] - 128) * ha,
        g + (sh[1] - 128) * sa + (mid[1] - 128) * ma + (hi[1] - 128) * ha,
        b + (sh[2] - 128) * sa + (mid[2] - 128) * ma + (hi[2] - 128) * ha,
      ];
    });
  }
  if (tool === "motion") {
    const out = canvas(w, h),
      ctx = context(out),
      distance = (n("strength") / 100) * w * 0.08,
      rad = (n("angle") * Math.PI) / 180,
      steps = Math.max(1, Math.ceil(distance / 2));
    for (let i = -steps; i <= steps; i++) {
      ctx.globalAlpha = 1 / (i + steps + 1);
      const t = i / steps;
      ctx.drawImage(
        src,
        Math.cos(rad) * distance * t,
        Math.sin(rad) * distance * t,
      );
    }
    if (subject && p.area !== "all") {
      const original = context(src).getImageData(0, 0, w, h).data;
      return pixels(out, (r, g, b, _x, _y, i) => {
        const a =
          p.area === "background"
            ? 1 - subject![i + 3] / 255
            : subject![i + 3] / 255;
        return [
          mix(original[i], r, a),
          mix(original[i + 1], g, a),
          mix(original[i + 2], b, a),
        ];
      });
    }
    return out;
  }
  if (tool === "lut" && p.cube) {
    let lut = parseCube(String(p.cube));
    if (p.lutPng && p.lutLayout === "tiled") {
      const image = await loadImage(String(p.lutPng)),
        size = lut.size,
        tiles = Math.sqrt(size),
        c = canvas(image.naturalWidth, image.naturalHeight);
      if (
        !Number.isInteger(tiles) ||
        image.naturalWidth !== size * tiles ||
        image.naturalHeight !== size * tiles
      )
        throw new Error("This PNG does not use a square tiled LUT layout.");
      context(c).drawImage(image, 0, 0);
      const data = context(c).getImageData(0, 0, c.width, c.height).data,
        values: number[] = [];
      for (let b = 0; b < size; b++)
        for (let g = 0; g < size; g++)
          for (let r = 0; r < size; r++) {
            const x = r + (b % tiles) * size,
              y = g + Math.floor(b / tiles) * size,
              i = (y * c.width + x) * 4;
            values.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
          }
      lut = { ...lut, values };
    }
    const a = n("strength", 100) / 100;
    return pixels(src, (r, g, b) => {
      const color = sampleLut(lut, r, g, b);
      return [mix(r, color[0], a), mix(g, color[1], a), mix(b, color[2], a)];
    });
  }
  return src;
}

export function histogram(c: Canvas): number[] {
  const small = canvas(180, 110);
  context(small).drawImage(c, 0, 0, 180, 110);
  const { data } = context(small).getImageData(0, 0, 180, 110),
    bins = new Array(64).fill(0);
  for (let i = 0; i < data.length; i += 4)
    bins[
      Math.min(63, Math.floor(luminance(data[i], data[i + 1], data[i + 2]) / 4))
    ]++;
  const max = Math.max(...bins);
  return bins.map((v) => v / max);
}

export function toBlob(
  c: Canvas,
  type = "image/jpeg",
  quality = 0.95,
): Promise<Blob> {
  if (type === "image/jpeg") {
    const ctx = context(c);
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  }
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Export failed. Try a smaller image size.")),
      type,
      quality,
    ),
  );
}
