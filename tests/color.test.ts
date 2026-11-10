import { describe, expect, it } from "vitest";
import {
  tone,
  clamp,
  parseCube,
  sampleLut,
  rgbToHsl,
  hslToRgb,
} from "../src/lib/color";
import { validateRecipe } from "../src/lib/files";

const identity = `TITLE "Identity"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1`;
describe("image color math", () => {
  it("leaves pixels unchanged at neutral settings", () =>
    expect(tone(12, 118, 230, {})).toEqual([12, 118, 230]));
  it("raises brightness and clips at white", () => {
    const p = tone(240, 60, 110, { brightness: 100 });
    expect(p[0]).toBe(255);
    expect(p[1]).toBeGreaterThan(60);
    expect(p[2]).toBeGreaterThan(110);
  });
  it("desaturates to luminance rather than channel average", () => {
    const p = tone(255, 0, 0, { saturation: -100 });
    expect(p[0]).toBeCloseTo(54.213);
    expect(p[0]).toEqual(p[1]);
    expect(p[1]).toEqual(p[2]);
  });
  it("warms red and cools blue in opposite directions", () => {
    const p = tone(128, 128, 128, { temperature: 40 });
    expect(p[0]).toBeGreaterThan(p[2]);
  });
  it("lifts shadows more than highlights", () => {
    expect(tone(20, 20, 20, { shadows: 50 })[0] - 20).toBeGreaterThan(
      tone(200, 200, 200, { shadows: 50 })[0] - 200,
    );
  });
  it("roundtrips primary and arbitrary RGB colors through HSL", () => {
    for (const color of [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [113, 27, 160],
      [0, 0, 0],
      [255, 255, 255],
    ]) {
      const hsl = rgbToHsl(...(color as [number, number, number]));
      const rgb = hslToRgb(...hsl);
      rgb.forEach((v, i) => expect(v).toBeCloseTo(color[i], 4));
    }
  });
  it("bounds image values", () => {
    expect(clamp(-4)).toBe(0);
    expect(clamp(500)).toBe(255);
  });
});
describe("3D LUT parsing and sampling", () => {
  it("performs trilinear interpolation on an identity cube", () => {
    const lut = parseCube(identity);
    const color = sampleLut(lut, 33, 137, 222);
    expect(color[0]).toBeCloseTo(33);
    expect(color[1]).toBeCloseTo(137);
    expect(color[2]).toBeCloseTo(222);
  });
  it("preserves red-fastest cube ordering", () => {
    const lut = parseCube(identity);
    expect(sampleLut(lut, 255, 0, 0)).toEqual([255, 0, 0]);
    expect(sampleLut(lut, 0, 0, 255)).toEqual([0, 0, 255]);
  });
  it("respects custom input domains", () => {
    const lut = parseCube(
      "DOMAIN_MIN 0.2 0.2 0.2\nDOMAIN_MAX 0.8 0.8 0.8\n" + identity,
    );
    expect(sampleLut(lut, 127.5, 127.5, 127.5)[0]).toBeCloseTo(127.5);
  });
  it("rejects missing entries, invalid size, 1D data, and degenerate domains", () => {
    for (const text of [
      "LUT_3D_SIZE 64\n0 0 0",
      identity.replace("SIZE 2", "SIZE 1"),
      "LUT_1D_SIZE 2",
      "DOMAIN_MAX 0 0 0\n" + identity,
    ])
      expect(() => parseCube(text)).toThrow();
  });
});
describe("untrusted preset imports", () => {
  it("rejects unknown tools and unsupported recipe versions", () => {
    expect(() =>
      validateRecipe({ version: 2, name: "x", edits: [] }),
    ).toThrow();
    expect(() =>
      validateRecipe({
        version: 1,
        name: "x",
        edits: [{ tool: "inject", params: {} }],
      }),
    ).toThrow();
  });
  it("rejects remote image overlays and invalid brush points", () => {
    expect(() =>
      validateRecipe({
        version: 1,
        name: "x",
        edits: [
          {
            tool: "double",
            params: {},
            image: "https://tracker.example/pixel.png",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateRecipe({
        version: 1,
        name: "x",
        edits: [
          {
            tool: "brush",
            params: {},
            points: [{ x: Infinity, y: 0, radius: 1, amount: 1 }],
          },
        ],
      }),
    ).toThrow();
  });
  it("clamps imported controls to the supported range", () => {
    const recipe = validateRecipe({
      version: 1,
      name: "x",
      edits: [{ tool: "tune", params: { brightness: 9999 } }],
    });
    expect(recipe.edits[0].params.brightness).toBe(100);
  });
});
