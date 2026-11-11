import { describe, expect, it } from "vitest";
import {
  collageLayout,
  compositionOrder,
  cutoutAlpha,
  skinWeight,
} from "../src/lib/composition";
import { validateRecipe } from "../src/lib/files";
const sizes = [
  { width: 600, height: 400 },
  { width: 300, height: 600 },
  { width: 400, height: 400 },
];
describe("collage layout", () => {
  it("preserves all sources when an imported order is incomplete or malformed", () => {
    expect(compositionOrder(3, "[2,2,-1,40,0]")).toEqual([2, 0, 1]);
    expect(compositionOrder(3, "not JSON")).toEqual([0, 1, 2]);
  });
  it("keeps every cell inside a portrait grid even at maximum spacing", () => {
    const layout = collageLayout(
      Array.from({ length: 9 }, () => sizes[0]),
      { layout: "grid", columns: 4, ratio: "4:5", gap: 10 },
      1400,
    );
    expect([layout.width, layout.height]).toEqual([1120, 1400]);
    expect(layout.cells).toHaveLength(9);
    for (const cell of layout.cells) {
      expect(Math.min(cell.x, cell.y, cell.width, cell.height)).toBeGreaterThan(
        0,
      );
      expect(cell.x + cell.width).toBeLessThanOrEqual(layout.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(layout.height);
    }
  });
  it("stitches unequal source ratios without cropping or gaps", () => {
    for (const mode of ["horizontal", "vertical"]) {
      const layout = collageLayout(
        sizes,
        { layout: mode, gap: 0, order: "[2,0,1]" },
        1400,
      );
      expect(Math.max(layout.width, layout.height)).toBe(1400);
      expect(layout.cells.map((c) => c.index)).toEqual([2, 0, 1]);
      for (const cell of layout.cells)
        expect(cell.width / cell.height).toBeCloseTo(
          sizes[cell.index].width / sizes[cell.index].height,
          8,
        );
      const last = layout.cells.at(-1)!;
      expect(
        mode === "horizontal" ? last.x + last.width : last.y + last.height,
      ).toBeCloseTo(1400);
    }
  });
});
describe("cutout and skin masks", () => {
  it("retains fully confident subject pixels and removes background with soft edges", () => {
    expect(cutoutAlpha(0, 0, 50)).toBe(0);
    expect(cutoutAlpha(1, 0, 50)).toBe(1);
    expect(cutoutAlpha(0.5, 0, 50)).toBeCloseTo(0.5);
    expect(cutoutAlpha(0.5, 20, 50)).toBeGreaterThan(cutoutAlpha(0.5, -20, 50));
  });
  it("includes dark and light skin tones while rejecting green and blue scenery", () => {
    for (const tone of [
      [96, 62, 45],
      [170, 116, 88],
      [236, 186, 158],
    ])
      expect(skinWeight(...(tone as [number, number, number]))).toBeGreaterThan(
        0.2,
      );
    expect(skinWeight(10, 200, 40)).toBeLessThan(0.01);
    expect(skinWeight(20, 60, 230)).toBeLessThan(0.01);
  });
});
describe("composition interchange", () => {
  it("preserves embedded sources and rotation but rejects external or oversized source collections", () => {
    const edit = {
      id: "collage",
      tool: "collage",
      params: { layout: "vertical" },
      images: ["data:image/png;base64,AAAA"],
    };
    const recipe = {
      version: 1,
      name: "Together",
      edits: [
        edit,
        { id: "text", tool: "text", params: { text: "Hello", rotation: 90 } },
      ],
    };
    expect(validateRecipe(recipe).edits[0].images).toEqual(edit.images);
    expect(validateRecipe(recipe).edits[1].params.rotation).toBe(90);
    expect(() =>
      validateRecipe({
        ...recipe,
        edits: [{ ...edit, images: ["https://example.com/photo.png"] }],
      }),
    ).toThrow(/embedded/);
    expect(() =>
      validateRecipe({
        ...recipe,
        edits: [{ ...edit, images: Array(9).fill(edit.images[0]) }],
      }),
    ).toThrow(/eight/);
  });
});
