import { expect, test } from "@playwright/test";
import piexif from "piexifjs";
import {
  ready,
  source,
  choose,
  signature,
  slider,
  openExport,
  download,
  decodedSize,
} from "./output-helpers";
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("a finger rotates text on the image and the exported pixels contain no editing handles", async ({
  page,
}) => {
  await ready(page);
  await source(page, { black: true });
  const original = await signature(page);
  await choose(page, "Text");
  await page
    .getByRole("button", { name: "More controls", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Your words" }).fill("ROTATE");
  await page.getByRole("button", { name: "More photo", exact: true }).click();
  const box = (await page
      .getByRole("group", { name: "Text placement and rotation" })
      .boundingBox())!,
    handle = (await page
      .getByRole("button", { name: "Rotate text by dragging" })
      .boundingBox())!,
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2,
    hx = handle.x + handle.width / 2,
    hy = handle.y + handle.height / 2,
    radius = Math.hypot(hx - cx, hy - cy);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: hx, y: hy }],
    });
    for (let step = 1; step <= 5; step++) {
      const angle = -Math.PI / 2 + ((Math.PI / 2) * step) / 5;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            id: 1,
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
          },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
  await page
    .getByRole("combobox", { name: "Choose adjustment" })
    .selectOption("rotation");
  await expect(
    page.getByRole("slider", { name: "Text rotation", exact: true }),
  ).toHaveValue("90");
  await expect.poll(() => signature(page)).not.toBe(original);
  const edited = await signature(page);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await openExport(page, "PNG");
  const file = await download(page);
  expect(await decodedSize(page, file.bytes, "image/png")).toEqual({
    width: 600,
    height: 400,
  });
  await expect(
    page.getByRole("group", { name: "Text placement and rotation" }),
  ).toHaveCount(0);
  await expect.poll(() => signature(page)).toBe(edited);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(original);
});

test("JPG converts to a real PNG with a matching extension", async ({
  page,
}) => {
  await ready(page);
  await source(page);
  await openExport(page, "PNG");
  await page.getByRole("textbox", { name: "File name" }).fill("holiday.jpg");
  await expect(page.locator(".export-output")).toContainText("holiday.png");
  const file = await download(page);
  expect(file.name).toBe("holiday.png");
  expect([...file.bytes.subarray(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(await decodedSize(page, file.bytes, "image/png")).toEqual({
    width: 600,
    height: 400,
  });
});

test("custom dimensions and percentage reduction create smaller images with locked proportions", async ({
  page,
}) => {
  await ready(page);
  await source(page);
  await openExport(page, "PNG");
  await page.getByLabel("Image size", { exact: true }).selectOption("custom");
  await page.getByRole("spinbutton", { name: "Export width" }).fill("300");
  await expect(
    page.getByRole("spinbutton", { name: "Export height" }),
  ).toHaveValue("200");
  expect(
    await decodedSize(page, (await download(page)).bytes, "image/png"),
  ).toEqual({ width: 300, height: 200 });
  await openExport(page, "PNG");
  await page.getByLabel("Image size", { exact: true }).selectOption("percent");
  await page.getByRole("button", { name: "25%", exact: true }).click();
  expect(
    await decodedSize(page, (await download(page)).bytes, "image/png"),
  ).toEqual({ width: 150, height: 100 });
});

test("file-size limits constrain actual JPG and PNG downloads", async ({
  page,
}) => {
  await ready(page);
  await source(page, { width: 512, height: 512, noise: true });
  await openExport(page, "JPG");
  await page.getByRole("checkbox", { name: "Limit file size" }).check();
  await page
    .getByRole("spinbutton", { name: "Maximum file size (KB)" })
    .fill("60");
  const jpeg = await download(page);
  expect(jpeg.bytes.length).toBeLessThanOrEqual(60 * 1024);
  expect(await decodedSize(page, jpeg.bytes, "image/jpeg")).toEqual({
    width: 512,
    height: 512,
  });
  await openExport(page, "PNG");
  await page
    .getByRole("spinbutton", { name: "Maximum file size (KB)" })
    .fill("30");
  const png = await download(page);
  expect(png.bytes.length).toBeLessThanOrEqual(30 * 1024);
  const dimensions = await decodedSize(page, png.bytes, "image/png");
  expect(dimensions.width).toBeGreaterThan(16);
  expect(dimensions.width).toBeLessThan(512);
  expect(dimensions.height).toBe(dimensions.width);
});

test("common ID photo presets frame the source and save exact pixels with print resolution", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByTestId("open-file")
    .setInputFiles("tests/fixtures/astronaut.png");
  await expect(page.locator("h1")).toHaveText("astronaut");
  await choose(page, "ID photo");
  await page
    .getByRole("button", { name: "More controls", exact: true })
    .click();
  for (const [preset, expected] of [
    ["35x45", "413x531"],
    ["us-2x2", "600x600"],
    ["50x70", "591x827"],
    ["33x48", "390x567"],
    ["26x32", "307x378"],
    ["25x35", "295x413"],
    ["35x49", "413x579"],
    ["30x40", "354x472"],
  ]) {
    await page
      .getByLabel("ID photo size", { exact: true })
      .selectOption(preset);
    await expect
      .poll(() => signature(page))
      .toMatch(new RegExp("^" + expected + ":"));
  }
  await page.getByLabel("ID photo size", { exact: true }).selectOption("35x45");
  await page
    .getByLabel("Print resolution", { exact: true })
    .selectOption("600");
  await expect.poll(() => signature(page)).toMatch(/^827x1063:/);
  await page
    .getByLabel("Print resolution", { exact: true })
    .selectOption("300");
  await slider(page, "Subject size", 150);
  const before = await signature(page);
  const photo = (await page.locator(".photo-wrap").boundingBox())!;
  await page.mouse.move(photo.x + photo.width / 2, photo.y + photo.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    photo.x + photo.width * 0.65,
    photo.y + photo.height * 0.55,
  );
  await page.mouse.up();
  await expect.poll(() => signature(page)).not.toBe(before);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await openExport(page, "PNG");
  const png = await download(page);
  expect(await decodedSize(page, png.bytes, "image/png")).toEqual({
    width: 413,
    height: 531,
  });
  const density = png.bytes.indexOf(Buffer.from("pHYs"));
  expect(density).toBeGreaterThan(0);
  expect(png.bytes.readUInt32BE(density + 4)).toBe(11811);
  expect(png.bytes[density + 12]).toBe(1);
  await openExport(page, "JPG");
  const jpeg = await download(page),
    tags = piexif.load(jpeg.bytes.toString("binary"));
  expect(tags["0th"]![piexif.ImageIFD.XResolution]).toEqual([300000, 1000]);
  expect(tags["0th"]![piexif.ImageIFD.Make]).toBeUndefined();
});

test("resizing after crop uses the final composition dimensions", async ({
  page,
}) => {
  await ready(page);
  await source(page);
  await choose(page, "Crop");
  await page
    .getByRole("button", { name: "More controls", exact: true })
    .click();
  await slider(page, "Left", 25);
  await slider(page, "Right", 25);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect.poll(() => signature(page)).toMatch(/^300x400:/);
  await openExport(page, "PNG");
  await page.getByLabel("Image size", { exact: true }).selectOption("custom");
  await page.getByRole("spinbutton", { name: "Export width" }).fill("150");
  await expect(
    page.getByRole("spinbutton", { name: "Export height" }),
  ).toHaveValue("200");
  expect(
    await decodedSize(page, (await download(page)).bytes, "image/png"),
  ).toEqual({ width: 150, height: 200 });
});
