import { expect, test } from "@playwright/test";
import {
  ready,
  signature,
  slider,
  source,
  openExport,
  download,
} from "./output-helpers";
import {
  diagram,
  mode,
  pixel,
  redo,
  stroke,
  tool,
  undo,
} from "./annotation-helpers";

test("colored strokes keep their own style, undo/redo per mark, and erase back to the source", async ({
  page,
}) => {
  await ready(page);
  await diagram(page);
  await tool(page, "Draw & annotate");
  await stroke(page, [0.2, 0.3], [0.8, 0.3]);
  await expect.poll(() => pixel(page, 200, 90)).toEqual([239, 99, 81, 255]);
  const red = await signature(page);
  await page.getByRole("button", { name: "Blue paint", exact: true }).click();
  await stroke(page, [0.2, 0.7], [0.8, 0.7]);
  await expect.poll(() => pixel(page, 200, 210)).toEqual([87, 155, 231, 255]);
  expect(await pixel(page, 200, 90)).toEqual([239, 99, 81, 255]);
  const both = await signature(page);
  await undo(page);
  await expect.poll(() => signature(page)).toBe(red);
  await redo(page);
  await expect.poll(() => signature(page)).toBe(both);
  await page.getByLabel("Brush type", { exact: true }).selectOption("eraser");
  await slider(page, "Stroke size", 5);
  await stroke(page, [0.15, 0.3], [0.85, 0.3]);
  await expect.poll(() => pixel(page, 200, 90)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 200, 210)).toEqual([87, 155, 231, 255]);
  await undo(page);
  await expect.poll(() => signature(page)).toBe(both);
  await tool(page, "Brush");
  await page.getByRole("button", { name: "Paint color", exact: true }).click();
  await page.getByRole("button", { name: "Purple paint", exact: true }).click();
  await stroke(page, [0.2, 0.5], [0.8, 0.5]);
  await expect.poll(() => pixel(page, 200, 150)).toEqual([177, 137, 223, 255]);
  expect(await pixel(page, 200, 90)).toEqual([239, 99, 81, 255]);
});

test("six brush tips render distinctly and crayon redo is deterministic", async ({
  page,
}) => {
  await ready(page);
  await diagram(page);
  await tool(page, "Draw & annotate");
  await slider(page, "Stroke size", 8);
  const blank = await signature(page),
    results = new Set<string>();
  for (const brush of [
    "round",
    "square",
    "marker",
    "airbrush",
    "calligraphy",
    "crayon",
  ]) {
    await page.getByLabel("Brush type", { exact: true }).selectOption(brush);
    await stroke(page, [0.2, 0.4], [0.8, 0.6]);
    await expect.poll(() => signature(page)).not.toBe(blank);
    const painted = await signature(page);
    results.add(painted);
    await undo(page);
    await expect.poll(() => signature(page)).toBe(blank);
    if (brush === "crayon") {
      await redo(page);
      await expect.poll(() => signature(page)).toBe(painted);
    }
  }
  expect(results.size).toBe(6);
});

test("arrows, curves and shapes render; a filled shape moves and is recovered", async ({
  page,
}) => {
  await ready(page);
  await diagram(page);
  await tool(page, "Draw & annotate");
  const blank = await signature(page),
    forms = new Set<string>();
  for (const name of [
    "Arrow",
    "Line",
    "Curve",
    "Rectangle",
    "Rounded box",
    "Ellipse",
    "Triangle",
    "Star",
  ]) {
    await mode(page, name);
    await stroke(page, [0.2, 0.2], [0.6, 0.6]);
    await expect.poll(() => signature(page)).not.toBe(blank);
    forms.add(await signature(page));
    await undo(page);
    await expect.poll(() => signature(page)).toBe(blank);
  }
  expect(forms.size).toBe(8);
  await mode(page, "Rectangle");
  await page.getByLabel("Fill shape", { exact: true }).check();
  await slider(page, "Fill opacity", 100);
  await stroke(page, [0.15, 0.15], [0.35, 0.35]);
  await expect.poll(() => pixel(page, 100, 75)).toEqual([255, 228, 138, 255]);
  const original = await signature(page);
  await mode(page, "Select / move");
  await stroke(page, [0.25, 0.25], [0.65, 0.65]);
  await expect.poll(() => pixel(page, 100, 75)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 260, 195)).toEqual([255, 228, 138, 255]);
  await expect(
    page.getByRole("button", { name: "Delete selected mark" }),
  ).toBeVisible();
  await undo(page);
  await expect.poll(() => signature(page)).toBe(original);
  await redo(page);
  await expect.poll(() => pixel(page, 260, 195)).toEqual([255, 228, 138, 255]);
  const moved = await signature(page);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect.poll(() => signature(page)).toBe(moved);
});

test("numbered steps advance, undo the counter, and survive project recovery", async ({
  page,
}) => {
  await ready(page);
  await diagram(page);
  await tool(page, "Draw & annotate");
  await mode(page, "Number");
  for (const x of [0.25, 0.5, 0.75]) await stroke(page, [x, 0.5]);
  await expect(page.getByLabel("Next number", { exact: true })).toHaveValue(
    "4",
  );
  await expect(page.locator(".drawing-controls")).toContainText("3 marks");
  await undo(page);
  await expect(page.getByLabel("Next number", { exact: true })).toHaveValue(
    "3",
  );
  await redo(page);
  await expect(page.getByLabel("Next number", { exact: true })).toHaveValue(
    "4",
  );
  await expect
    .poll(() => pixel(page, 100, 155))
    .not.toEqual([255, 255, 255, 255]);
  const numbered = await signature(page);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect.poll(() => signature(page)).toBe(numbered);
  await page
    .getByRole("button", { name: "Edits", exact: true })
    .first()
    .click();
  await page
    .locator(".stack-item")
    .getByRole("button", { name: /^Draw & annotate/ })
    .click();
  await expect(page.locator(".drawing-controls")).toContainText("3 marks");
});

test("highlighter preserves black lettering; spotlight unions clear regions", async ({
  page,
}) => {
  await ready(page);
  await diagram(page, "text");
  await tool(page, "Draw & annotate");
  await mode(page, "Highlighter");
  await slider(page, "Stroke size", 15);
  await stroke(page, [0.15, 0.5], [0.85, 0.5]);
  await expect
    .poll(() => pixel(page, 80, 150))
    .not.toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 200, 150)).toEqual([0, 0, 0, 255]);
  await page.getByLabel("Brush type", { exact: true }).selectOption("eraser");
  await slider(page, "Opacity", 100);
  await stroke(page, [0.1, 0.5], [0.9, 0.5]);
  await expect.poll(() => pixel(page, 80, 150)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 200, 150)).toEqual([0, 0, 0, 255]);
  await undo(page);
  await expect
    .poll(() => pixel(page, 80, 150))
    .not.toEqual([255, 255, 255, 255]);
  await undo(page);
  await tool(page, "Privacy & emphasis");
  await page.getByLabel("Effect", { exact: true }).selectOption("spotlight");
  await stroke(page, [0.05, 0.05], [0.3, 0.3]);
  await stroke(page, [0.65, 0.65], [0.95, 0.95]);
  await expect.poll(() => pixel(page, 200, 20)).toEqual([89, 89, 89, 255]);
  expect(await pixel(page, 60, 60)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 320, 240)).toEqual([255, 255, 255, 255]);
});

test("blur and pixelation change only the selected area, and redaction exports opaque pixels", async ({
  page,
}) => {
  await ready(page);
  await source(page, { width: 400, height: 300, noise: true });
  const original = await signature(page),
    outside = await pixel(page, 20, 20);
  const variance = () =>
    page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(100, 75, 200, 150).data;
      let sum = 0,
        sum2 = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += d[i];
        sum2 += d[i] ** 2;
      }
      return sum2 / (d.length / 4) - (sum / (d.length / 4)) ** 2;
    });
  const noisy = await variance();
  await tool(page, "Privacy & emphasis");
  await stroke(page, [0.2, 0.2], [0.8, 0.8]);
  await expect.poll(variance).toBeLessThan(noisy / 4);
  expect(await pixel(page, 20, 20)).toEqual(outside);
  await undo(page);
  await expect.poll(() => signature(page)).toBe(original);
  await page.getByLabel("Effect", { exact: true }).selectOption("pixelate");
  await slider(page, "Effect strength", 100);
  await stroke(page, [0.2, 0.2], [0.8, 0.8]);
  await expect.poll(variance).toBeLessThan(noisy / 2);
  const uniqueColors = await page
    .getByTestId("photo-canvas")
    .evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(100, 75, 200, 150).data;
      return new Set(new Uint32Array(d.buffer)).size;
    });
  expect(uniqueColors).toBeLessThan(1000);
  expect(await pixel(page, 20, 20)).toEqual(outside);
  await page.getByLabel("Effect", { exact: true }).selectOption("redact");
  await stroke(page, [0.3, 0.3], [0.7, 0.7]);
  await expect.poll(() => pixel(page, 200, 150)).toEqual([17, 17, 17, 255]);
  await openExport(page, "PNG");
  const file = await download(page);
  const exported = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(200, 150, 1, 1).data];
  }, file.bytes.toString("base64"));
  expect(exported).toEqual([17, 17, 17, 255]);
});

test("bucket fill respects boundaries, matching colors and transparency with undo/recovery", async ({
  page,
}) => {
  await ready(page);
  await diagram(page, "divided");
  await tool(page, "Color fill");
  await stroke(page, [0.25, 0.5]);
  await expect.poll(() => pixel(page, 50, 150)).toEqual([239, 99, 81, 255]);
  expect(await pixel(page, 300, 150)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 200, 150)).toEqual([0, 0, 0, 255]);
  await undo(page);
  await expect.poll(() => pixel(page, 50, 150)).toEqual([255, 255, 255, 255]);
  await page.getByLabel("Fill area", { exact: true }).selectOption("matching");
  await stroke(page, [0.25, 0.5]);
  await expect.poll(() => pixel(page, 300, 150)).toEqual([239, 99, 81, 255]);
  await undo(page);
  await expect.poll(() => pixel(page, 300, 150)).toEqual([255, 255, 255, 255]);
  await page.getByLabel("Fill area", { exact: true }).selectOption("connected");
  await page.getByLabel("Fill mode", { exact: true }).selectOption("clear");
  await stroke(page, [0.25, 0.5]);
  await expect.poll(() => pixel(page, 50, 150)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 300, 150)).toEqual([255, 255, 255, 255]);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect.poll(() => pixel(page, 50, 150)).toEqual([0, 0, 0, 0]);
  await openExport(page, "PNG");
  expect((await download(page)).bytes.subarray(1, 4).toString()).toBe("PNG");
});
