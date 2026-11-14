import { describe, expect, it } from "vitest";
import {
  detectDocument,
  enhanceDocument,
  quadArea,
  renderDocument,
  scanDimensions,
  scanHomography,
  validScanQuad,
} from "../src/lib/scanner";
import {
  defaultScanSettings,
  fullPage,
  emptyScanDocument,
  scanSignature,
  validateScanDocument,
  type ScanPage,
  type ScanQuad,
} from "../src/lib/scanner-types";

function pageImage(q: ScanQuad, width = 400, height = 320) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = { x: x / (width - 1), y: y / (height - 1) },
        inside = q.every((a, i) => {
          const b = q[(i + 1) % 4];
          return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
        }),
        i = (y * width + x) * 4;
      const ink =
        inside && y > 85 && y < 240 && y % 24 < 4 && x > 125 && x < 280;
      data[i] = data[i + 1] = data[i + 2] = ink ? 20 : inside ? 242 : 35;
      data[i + 3] = 255;
    }
  return data;
}
describe("document geometry", () => {
  it("accepts convex corners and rejects crossed, collapsed or out-of-image crops", () => {
    expect(validScanQuad(fullPage())).toBe(true);
    const q = fullPage();
    [q[1], q[2]] = [q[2], q[1]];
    expect(validScanQuad(q)).toBe(false);
    expect(validScanQuad([{ x: -0.01, y: 0 }, ...fullPage().slice(1)])).toBe(
      false,
    );
    expect(validScanQuad(Array(4).fill({ x: 0.5, y: 0.5 }))).toBe(false);
  });
  it("maps each rectangle corner to the photographed perspective corner", () => {
    const q: ScanQuad = [
        { x: 0.2, y: 0.1 },
        { x: 0.8, y: 0.2 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.8 },
      ],
      m = scanHomography(q);
    for (const [i, p] of fullPage().entries()) {
      const d = m[6] * p.x + m[7] * p.y + 1;
      expect((m[0] * p.x + m[1] * p.y + m[2]) / d).toBeCloseTo(q[i].x, 9);
      expect((m[3] * p.x + m[4] * p.y + m[5]) / d).toBeCloseTo(q[i].y, 9);
    }
    expect(m[6] !== 0 || m[7] !== 0).toBe(true);
  });
  it("preserves an uncropped original and rotates its actual corner pixels", () => {
    const data = new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 0, 255,
      ]),
      settings = { ...defaultScanSettings(), filter: "original" as const };
    const original = renderDocument(data, 2, 2, fullPage(), settings);
    expect(original.data).toEqual(data);
    const rotated = renderDocument(data, 2, 2, fullPage(), {
      ...settings,
      turns: 1,
    });
    expect([...rotated.data.slice(0, 4)]).toEqual([0, 255, 0, 255]);
    expect([...rotated.data.slice(4, 8)]).toEqual([255, 0, 0, 255]);
  });
  it("bounds output allocation and honors A4 and card proportions", () => {
    const size = scanDimensions(10000, 10000, fullPage(), "a4");
    expect(size.width * size.height).toBeLessThanOrEqual(8005000);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(3200);
    expect(size.width / size.height).toBeCloseTo(210 / 297, 3);
    const card = scanDimensions(1000, 700, fullPage(), "card");
    expect(card.width / card.height).toBeCloseTo(85.6 / 53.98, 2);
  });
  it("flattens transparent source pixels onto white document paper", () => {
    const result = renderDocument(
      new Uint8ClampedArray([0, 0, 0, 0]),
      1,
      1,
      fullPage(),
      { ...defaultScanSettings(), filter: "original" },
    );
    expect([...result.data]).toEqual([255, 255, 255, 255]);
  });
});
describe("page edge detection", () => {
  it("finds an actual skewed page boundary without selecting its internal text", () => {
    const q: ScanQuad = [
        { x: 0.22, y: 0.1 },
        { x: 0.82, y: 0.15 },
        { x: 0.88, y: 0.86 },
        { x: 0.14, y: 0.8 },
      ],
      detected = detectDocument(pageImage(q), 400, 320);
    expect(detected).not.toBeNull();
    expect(detected!.confidence).toBeGreaterThan(0.7);
    expect(quadArea(detected!.corners)).toBeGreaterThan(0.4);
    for (let i = 0; i < 4; i++)
      expect(
        Math.hypot(
          detected!.corners[i].x - q[i].x,
          detected!.corners[i].y - q[i].y,
        ),
      ).toBeLessThan(0.05);
  });
  it("returns no confident boundary for a blank surface", () => {
    expect(
      detectDocument(new Uint8ClampedArray(120 * 100 * 4).fill(255), 120, 100),
    ).toBeNull();
  });
  it("does not crop an already flat document down to the edges of its printed text", () => {
    expect(detectDocument(pageImage(fullPage()), 400, 320)).toBeNull();
  });
});
describe("scanner draft recovery", () => {
  const page = (): ScanPage => ({
    id: "test",
    name: "Paper",
    source: new Blob(["local source"], { type: "image/jpeg" }),
    width: 600,
    height: 800,
    thumbnail: "data:image/jpeg;base64,YQ==",
    corners: fullPage(),
    settings: defaultScanSettings(),
    detected: false,
  });
  it("preserves page sources and Unicode OCR while repairing a missing selection", () => {
    const p = page();
    p.ocr = {
      text: "中文",
      confidence: 95,
      language: "chi_sim",
      width: 600,
      height: 800,
      words: [],
      signature: scanSignature(p),
    };
    const doc = validateScanDocument({
      ...emptyScanDocument(),
      pages: [p],
      selectedId: "missing",
    });
    expect(doc.selectedId).toBe("test");
    expect(doc.pages[0].ocr!.text).toBe("中文");
    expect(doc.pages[0].source).toBe(p.source);
  });
  it("rejects duplicate pages, bad geometry, stale OCR and excess page counts", () => {
    const p = page(),
      document = { ...emptyScanDocument(), pages: [p], selectedId: p.id };
    expect(() =>
      validateScanDocument({ ...document, pages: [p, p] }),
    ).toThrow();
    expect(() =>
      validateScanDocument({ ...document, pages: Array(21).fill(p) }),
    ).toThrow();
    expect(() =>
      validateScanDocument({ ...document, pages: [{ ...p, corners: [] }] }),
    ).toThrow();
    expect(() =>
      validateScanDocument({
        ...document,
        pages: [{ ...p, ocr: { signature: "old", text: "Stale" } }],
      }),
    ).toThrow();
  });
});

describe("document cleanup", () => {
  it("levels uneven illumination while retaining ink", () => {
    const w = 180,
      h = 120,
      data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4,
          value = y === 60 && x > 30 && x < 150 ? 20 : 100 + (x / w) * 135;
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
      }
    enhanceDocument(data, w, h, { ...defaultScanSettings(), strength: 100 });
    expect(data[(30 * w + 20) * 4]).toBeGreaterThan(235);
    expect(data[(60 * w + 90) * 4]).toBeLessThan(35);
    expect(
      Math.abs(data[(30 * w + 20) * 4] - data[(30 * w + 160) * 4]),
    ).toBeLessThan(18);
  });
  it("produces real monochrome output and keeps whiteboard marker colors", () => {
    const source = pageImage(fullPage(), 100, 80),
      bw = enhanceDocument(source.slice(), 100, 80, {
        ...defaultScanSettings(),
        filter: "bw",
      });
    expect(
      [...bw].every((v, i) => (i % 4 === 3 ? v === 255 : v === 0 || v === 255)),
    ).toBe(true);
    const board = new Uint8ClampedArray(100 * 80 * 4).fill(245);
    for (let i = 3; i < board.length; i += 4) board[i] = 255;
    board.set([230, 30, 30, 255], (40 * 100 + 50) * 4);
    enhanceDocument(board, 100, 80, {
      ...defaultScanSettings(),
      filter: "whiteboard",
    });
    expect(board[(40 * 100 + 50) * 4]).toBeGreaterThan(
      board[(40 * 100 + 50) * 4 + 1] * 4,
    );
  });
});
