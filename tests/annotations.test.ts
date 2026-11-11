import { describe, expect, it } from "vitest";
import { floodFill } from "../src/lib/fill";
import { createMark, validateMarks, markBounds } from "../src/lib/annotations";
import { defaults } from "../src/lib/catalog";
import { validateRecipe } from "../src/lib/files";
function divided() {
  const data = new Uint8ClampedArray(7 * 5 * 4);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 7; x++)
      data.set(
        x === 3 ? [0, 0, 0, 255] : [255, 255, 255, 255],
        (y * 7 + x) * 4,
      );
  return data;
}
describe("bucket fill", () => {
  it("fills only the connected side of a closed boundary", () => {
    const data = floodFill(divided(), 7, 5, 1, 2, [255, 0, 0, 255], 0);
    expect([...data.slice((2 * 7 + 1) * 4, (2 * 7 + 1) * 4 + 4)]).toEqual([
      255, 0, 0, 255,
    ]);
    expect([...data.slice((2 * 7 + 5) * 4, (2 * 7 + 5) * 4 + 4)]).toEqual([
      255, 255, 255, 255,
    ]);
    expect(data[(2 * 7 + 3) * 4]).toBe(0);
    const broad = floodFill(divided(), 7, 5, 1, 2, [20, 50, 90, 255], 100);
    for (let i = 0; i < broad.length; i += 4)
      expect([...broad.slice(i, i + 4)]).toEqual([20, 50, 90, 255]);
  });
  it("fills disconnected matching colors and respects opacity", () => {
    const data = floodFill(
      divided(),
      7,
      5,
      1,
      2,
      [0, 0, 255, 128],
      0,
      "matching",
    );
    expect([...data.slice(0, 4)]).toEqual([127, 127, 255, 255]);
    expect([...data.slice(6 * 4, 7 * 4)]).toEqual([127, 127, 255, 255]);
    expect(data[3 * 4]).toBe(0);
  });
  it("clears to transparency and can fill a complete canvas", () => {
    const clear = floodFill(
      divided(),
      7,
      5,
      0,
      0,
      [0, 0, 0, 255],
      0,
      "connected",
      true,
    );
    expect(clear[3]).toBe(0);
    expect(clear[6 * 4 + 3]).toBe(255);
    floodFill(clear, 7, 5, 0, 0, [10, 20, 30, 255], 0, "canvas");
    for (let i = 0; i < clear.length; i += 4)
      expect([...clear.slice(i, i + 4)]).toEqual([10, 20, 30, 255]);
  });
  it("uses premultiplied colors to fill a transparent region", () => {
    const data = new Uint8ClampedArray([240, 10, 200, 0, 0, 0, 0, 0]);
    floodFill(data, 2, 1, 0, 0, [20, 50, 90, 255], 0);
    expect([...data]).toEqual([20, 50, 90, 255, 20, 50, 90, 255]);
  });
});
describe("drawing persistence and limits", () => {
  it("erases both pen and highlighter without changing a selected shape", () => {
    const edit = {
      id: "a",
      tool: "draw",
      params: { ...defaults("draw"), brush: "eraser" },
    };
    for (const drawMode of ["pen", "highlighter", "arrow"]) {
      edit.params.drawMode = drawMode;
      expect(createMark(edit, { x: 0.5, y: 0.5 }).kind).toBe(
        drawMode === "arrow" ? "arrow" : "eraser",
      );
    }
  });
  it("keeps the captured style when the next brush color changes", () => {
    const edit = { id: "a", tool: "draw", params: defaults("draw") },
      first = createMark(edit, { x: 0.1, y: 0.2 });
    edit.params.color = "#579be7";
    const second = createMark(edit, { x: 0.2, y: 0.3 });
    expect(first.color).toBe("#ef6351");
    expect(second.color).toBe("#579be7");
    const restored = validateRecipe({
      version: 1,
      name: "Ink",
      edits: [{ ...edit, marks: [first, second] }],
    });
    expect(restored.edits[0].marks).toEqual([first, second]);
  });
  it("rejects unknown shapes, non-finite points, CSS injection and oversized layers", () => {
    const mark = createMark(
      { id: "a", tool: "draw", params: defaults("draw") },
      { x: 0.1, y: 0.2 },
    );
    for (const bad of [
      { ...mark, kind: "script" },
      { ...mark, color: "url(https://tracker.invalid)" },
      { ...mark, points: [{ x: NaN, y: 0.2 }] },
      { ...mark, width: Infinity },
    ])
      expect(() => validateMarks([bad])).toThrow();
    expect(() => validateMarks(Array(1001).fill(mark))).toThrow(/1000/);
  });
  it("includes curve control geometry in selection bounds", () => {
    const mark = createMark(
      {
        id: "a",
        tool: "draw",
        params: { ...defaults("draw"), drawMode: "curve", bend: 100 },
      },
      { x: 0.2, y: 0.5 },
    );
    mark.points.push({ x: 0.8, y: 0.5 });
    expect(markBounds(mark, 100, 100).height).toBeGreaterThan(0.5);
  });
});
