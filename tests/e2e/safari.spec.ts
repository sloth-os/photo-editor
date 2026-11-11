import { expect, test } from "@playwright/test";
import {
  ready,
  source,
  choose,
  signature,
  openExport,
  download,
  decodedSize,
} from "./output-helpers";

test("iPhone WebKit renders every Look and its thumbnail without Canvas.filter", async ({
  page,
}) => {
  await ready(page);
  await source(page);
  const original = await signature(page);
  for (const name of [
    "Portrait",
    "Smooth",
    "Pop",
    "Accentuate",
    "Faded glow",
    "Morning",
    "Bright",
    "Fine art",
    "Silhouette",
  ]) {
    await page
      .getByRole("navigation", { name: "Mobile editing" })
      .getByRole("button", { name: "Looks", exact: true })
      .click();
    const tile = page
      .locator(".looks-gallery button")
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect
      .poll(() => tile.locator("img").getAttribute("src"))
      .not.toBe(
        await page
          .locator(".looks-gallery button")
          .filter({ has: page.getByText("Original", { exact: true }) })
          .locator("img")
          .getAttribute("src"),
      );
    await tile.click();
    await expect.poll(() => signature(page)).not.toBe(original);
  }
  await openExport(page, "PNG");
  const file = await download(page);
  expect(await decodedSize(page, file.bytes, "image/png")).toEqual({
    width: 600,
    height: 400,
  });
  await source(page, { width: 512, height: 512, noise: true });
  await expect.poll(() => signature(page)).toMatch(/^512x512:/);
  const beforeSkin = await signature(page);
  await choose(page, "Skin retouch");
  await expect.poll(() => signature(page)).not.toBe(beforeSkin);
});

test("iPhone WebKit converts JPG to PNG and reduces dimensions", async ({
  page,
}) => {
  await ready(page);
  await source(page);
  await openExport(page, "PNG");
  await page.getByRole("textbox", { name: "File name" }).fill("safari.jpg");
  await page.getByLabel("Image size", { exact: true }).selectOption("percent");
  await page.getByRole("button", { name: "50%", exact: true }).click();
  const file = await download(page);
  expect(file.name).toBe("safari.png");
  expect(file.bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(await decodedSize(page, file.bytes, "image/png")).toEqual({
    width: 300,
    height: 200,
  });
});

test("iPhone WebKit saves the selected ID photo size and PNG print density", async ({
  page,
}) => {
  await ready(page);
  await source(page);
  await choose(page, "ID photo");
  await page
    .getByRole("button", { name: "More controls", exact: true })
    .click();
  await page
    .getByLabel("ID photo size", { exact: true })
    .selectOption("us-2x2");
  await expect.poll(() => signature(page)).toMatch(/^600x600:/);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await openExport(page, "PNG");
  const file = await download(page);
  expect(await decodedSize(page, file.bytes, "image/png")).toEqual({
    width: 600,
    height: 600,
  });
  const offset = file.bytes.indexOf(Buffer.from("pHYs"));
  expect(file.bytes.readUInt32BE(offset + 4)).toBe(11811);
});

test("iPhone WebKit rotates text with the on-image handle and preserves it in export", async ({
  page,
}) => {
  await ready(page);
  await source(page, { black: true });
  await choose(page, "Text");
  const box = (await page
      .getByRole("group", { name: "Text placement and rotation" })
      .boundingBox())!,
    handle = (await page
      .getByRole("button", { name: "Rotate text by dragging" })
      .boundingBox())!,
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2,
    radius = Math.hypot(
      handle.x + handle.width / 2 - cx,
      handle.y + handle.height / 2 - cy,
    );
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(cx + radius, cy, { steps: 6 });
  await page.mouse.up();
  await page
    .getByRole("combobox", { name: "Choose adjustment" })
    .selectOption("rotation");
  await expect(
    page.getByRole("slider", { name: "Text rotation", exact: true }),
  ).toHaveValue("90");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await openExport(page, "PNG");
  expect((await download(page)).bytes.length).toBeGreaterThan(1000);
});
