import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.resolve("tests/fixtures/color-field.png");
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
async function signature(page: Page) {
  return page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 64)
      s = (Math.imul(s, 31) + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    return `${c.width}x${c.height}:${s}`;
  });
}
async function slider(page: Page, name: string, value: number) {
  const input = page.getByRole("slider", { name, exact: true });
  await input.evaluate((el: HTMLInputElement, v) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
async function tool(page: Page, name: string) {
  await page.getByRole("button", { name: /All tools/ }).click();
  await page.getByRole("textbox", { name: "Search tools" }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.locator(".tool-title h2")).toHaveText(name);
}

test("loads a local photo and does not send requests to external services", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith("http://127.0.0.1"))
      external.push(r.url());
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Alpine escape",
  );
  expect(await signature(page)).toMatch(/^1400x933:/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("edits real pixels, applies, compares, undoes and redoes", async ({
  page,
}) => {
  await ready(page);
  const original = await signature(page);
  await slider(page, "Brightness", 50);
  await expect.poll(() => signature(page)).not.toBe(original);
  const edited = await signature(page);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(
    page.getByRole("button", { name: "Apply changes" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect.poll(() => signature(page)).toBe(original);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect.poll(() => signature(page)).toBe(edited);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(original);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Shift+Z)", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(edited);
});
test("crop and rotation change image dimensions and can be undone", async ({
  page,
}) => {
  await ready(page);
  await tool(page, "Crop");
  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect.poll(() => signature(page)).toMatch(/^933x933:/);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await tool(page, "Rotate");
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect.poll(() => signature(page)).toMatch(/^933x1400:/);
});
test("cancel discards a pending change without losing committed work", async ({
  page,
}) => {
  await ready(page);
  await slider(page, "Contrast", 30);
  await page.getByRole("button", { name: "Apply changes" }).click();
  const applied = await signature(page);
  await slider(page, "Brightness", 80);
  await expect.poll(() => signature(page)).not.toBe(applied);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(() => signature(page)).toBe(applied);
});
test("local brush and healing alter pixels only after a stroke", async ({
  page,
}) => {
  await ready(page);
  const original = await signature(page);
  await tool(page, "Brush");
  await expect.poll(() => signature(page)).toBe(original);
  const box = (await page.locator(".photo-wrap").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(() => signature(page)).not.toBe(original);
  await page.getByRole("button", { name: "Apply changes" }).click();
  const brushed = await signature(page);
  await tool(page, "Healing");
  await page
    .locator(".photo-wrap")
    .click({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
  await expect.poll(() => signature(page)).not.toBe(brushed);
});
test("text is rendered and PNG export retains working resolution", async ({
  page,
}) => {
  await ready(page);
  const original = await signature(page);
  await tool(page, "Text");
  await page
    .getByRole("textbox", { name: "Your words" })
    .fill("A quiet morning");
  await expect.poll(() => signature(page)).not.toBe(original);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /^PNG/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download photo", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(1800);
  expect(bytes.readUInt32BE(20)).toBe(1200);
});
test("opens local images and rejects a non-image without losing the photo", async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId("open-file").setInputFiles(fixture);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "color-field",
  );
  await expect.poll(() => signature(page)).toMatch(/^96x64:/);
  const before = await signature(page);
  await page.getByTestId("open-file").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("status")).toContainText("Choose a JPG");
  expect(await signature(page)).toBe(before);
});
test("recovers a photo and its edits after reload", async ({ page }) => {
  await ready(page);
  await page.getByTestId("open-file").setInputFiles(fixture);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "color-field",
  );
  await slider(page, "Saturation", -100);
  await page.getByRole("button", { name: "Apply changes" }).click();
  const edited = await signature(page);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect.poll(() => signature(page)).toBe(edited);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "color-field",
  );
});
test("saved looks export and import as QR codes", async ({ page }) => {
  await ready(page);
  await slider(page, "Contrast", 23);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page.getByRole("button", { name: "Explore looks" }).click();
  await page.getByRole("button", { name: "Save look", exact: true }).click();
  await page.getByRole("textbox", { name: "Look name" }).fill("Quiet light");
  await page.getByRole("button", { name: "Save my look", exact: true }).click();
  await expect(page.locator(".saved-looks")).toContainText("Quiet light");
  await page
    .getByRole("button", { name: "Share Quiet light as QR", exact: true })
    .click();
  await expect(page.getByAltText("QR code for your Still look")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save QR look", exact: true }).click();
  const file = await downloadPromise;
  await page.getByTestId("import-look").setInputFiles({
    name: "look.png",
    mimeType: "image/png",
    buffer: await readFile((await file.path())!),
  });
  await expect(page.locator(".saved-looks>div")).toHaveCount(2);
});
test("edits, reloads and exports while completely offline", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect(page.locator(".offline-status")).toContainText("offline");
  const before = await signature(page);
  await slider(page, "Brightness", 40);
  await expect.poll(() => signature(page)).not.toBe(before);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download photo", exact: true })
    .click();
  expect((await dl).suggestedFilename()).toMatch(/\.jpg$/);
});
test("PWA launchQueue opens an OS-provided file without a startup race", async ({
  page,
}) => {
  const bytes = [...(await readFile(fixture))];
  await page.addInitScript(
    ({ bytes }) => {
      let delivered = false;
      Object.defineProperty(window, "launchQueue", {
        configurable: true,
        value: {
          setConsumer: (consumer: (p: unknown) => void) => {
            if (delivered) return;
            delivered = true;
            consumer({
              files: [
                {
                  getFile: async () =>
                    new File([new Uint8Array(bytes)], "from-desktop.png", {
                      type: "image/png",
                    }),
                },
              ],
            });
          },
        },
      });
    },
    { bytes },
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "from-desktop",
  );
  await expect.poll(() => signature(page)).toMatch(/^96x64:/);
  await page.waitForTimeout(600);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "from-desktop",
  );
});
test("mobile UI keeps the photo visible above adjustments without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole("button", { name: "Adjust", exact: true }).click();
  await expect(page.locator(".tool-panel")).toHaveClass(/mobile-open/);
  await page.waitForTimeout(300);
  const image = (await page.locator(".photo-wrap").boundingBox())!,
    panel = (await page.locator(".tool-panel").boundingBox())!;
  expect(image.y + image.height).toBeLessThanOrEqual(panel.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "Collapse adjustments", exact: true })
    .click();
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "Search tools" }).fill("HSL");
  await page.getByRole("button", { name: "Color HSL", exact: true }).click();
  await expect(page.locator(".tool-title h2")).toHaveText("Color HSL");
});
test("manifest resolves image file handlers and start URL inside the app scope", async ({
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.file_handlers[0].accept["image/jpeg"]).toContain(".jpg");
  expect(manifest.file_handlers[0].accept["image/x-adobe-dng"]).toContain(
    ".dng",
  );
  expect(manifest.file_handlers[0].action).toBe("./");
  expect(manifest.scope).toBe("./");
  expect(
    manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable"),
  ).toBe(true);
});

test("the full tool catalog produces image edits and remains undoable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ready(page);
  await page.getByTestId("open-file").setInputFiles(fixture);
  await expect.poll(() => signature(page)).toMatch(/^96x64:/);
  const original = await signature(page);
  const cases: [string, string, number][] = [
    ["Tune image", "Brightness", 40],
    ["Details", "Structure", 80],
    ["Curves", "Midtones", 50],
    ["White balance", "Temperature", 60],
    ["Crop", "Left", 20],
    ["Rotate", "Straighten", 20],
    ["Perspective", "Horizontal", 70],
    ["Expand", "Border size", 25],
    ["Selective", "Brightness", 60],
    ["HDR scape", "Filter strength", 80],
    ["Glamour glow", "Glow", 80],
    ["Tonal contrast", "Mid tones", 80],
    ["Drama", "Filter strength", 80],
    ["Vintage", "Style strength", 80],
    ["Grainy film", "Grain", 80],
    ["Retrolux", "Light leaks", 80],
    ["Grunge", "Texture", 80],
    ["Black & white", "Contrast", 50],
    ["Noir", "Contrast", 60],
    ["Portrait", "Face spotlight", 80],
    ["Head pose", "Turn", 80],
    ["Lens blur", "Blur strength", 80],
    ["Vignette", "Outer brightness", -80],
    ["Text", "Size", 20],
    ["Frames", "Frame width", 10],
    ["RAW develop", "Exposure", 50],
    ["Color HSL", "Hue", 60],
    ["Color grade", "Shadow color", 80],
    ["Dehaze", "Amount", 70],
    ["Motion blur", "Distance", 80],
    ["Bloom", "Strength", 80],
    ["Halation", "Strength", 80],
  ];
  for (const [name, control, value] of cases) {
    await tool(page, name);
    await slider(page, control, value);
    await page.getByRole("button", { name: "Apply changes" }).click();
    await expect
      .poll(() => signature(page), {
        message: `${name} must alter pixels or geometry`,
      })
      .not.toBe(original);
    await page
      .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
      .click();
    await expect
      .poll(() => signature(page), { message: `${name} must be undoable` })
      .toBe(original);
  }
});

test("LUT, double exposure, history re-editing and batch export work end to end", async ({
  page,
}) => {
  const { default: JSZip } = await import("jszip");
  await ready(page);
  await page.getByTestId("open-file").setInputFiles(fixture);
  await expect.poll(() => signature(page)).toMatch(/^96x64:/);
  const before = await signature(page);
  await tool(page, "LUT");
  const cube =
    "LUT_3D_SIZE 2\n0 0 0\n0 0 1\n0 1 0\n0 1 1\n1 0 0\n1 0 1\n1 1 0\n1 1 1";
  await page.locator(".panel-scroll input[type=file]").setInputFiles({
    name: "swap.cube",
    mimeType: "text/plain",
    buffer: Buffer.from(cube),
  });
  await expect.poll(() => signature(page)).not.toBe(before);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await tool(page, "Double exposure");
  await page.locator(".panel-scroll input[type=file]").setInputFiles(fixture);
  await expect(
    page.getByRole("button", { name: "Replace second photo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page
    .getByRole("button", { name: "Edits", exact: true })
    .first()
    .click();
  await expect(page.locator(".edit-stack .stack-item")).toHaveCount(2);
  await page
    .locator(".stack-item")
    .filter({ hasText: "Double exposure" })
    .getByRole("button", { name: /^Double exposure/ })
    .click();
  await slider(page, "Opacity", 20);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /^PNG/ }).click();
  const dl = page.waitForEvent("download");
  await page.getByTestId("batch-files").setInputFiles([fixture, fixture]);
  const zip = await dl;
  expect(zip.suggestedFilename()).toBe("still-edited-photos.zip");
  const archive = await JSZip.loadAsync(await readFile((await zip.path())!));
  expect(Object.keys(archive.files)).toHaveLength(2);
  for (const file of Object.values(archive.files)) {
    const buf = await file.async("nodebuffer");
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
  }
});

test("look packs, basic XMP tones and Hald PNG LUTs import locally", async ({
  page,
}) => {
  const { default: JSZip } = await import("jszip");
  await ready(page);
  const zip = new JSZip();
  zip.file(
    "soft.json",
    JSON.stringify({
      version: 1,
      name: "Soft light",
      edits: [{ id: "x", tool: "tune", params: { contrast: 15 } }],
    }),
  );
  zip.file(
    "warm.xmp",
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" crs:Exposure2012="0.5" crs:Contrast2012="10" /></rdf:RDF></x:xmpmeta>',
  );
  await page.getByTestId("import-look").setInputFiles({
    name: "my-looks.zip",
    mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.locator(".saved-looks>div")).toHaveCount(2);
  await expect(page.locator(".saved-looks")).toContainText("Imported XMP");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await tool(page, "LUT");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const ctx = c.getContext("2d")!,
      data = ctx.createImageData(8, 8);
    for (let i = 0; i < 64; i++) {
      data.data[i * 4] = ((i % 4) / 3) * 255;
      data.data[i * 4 + 1] = ((Math.floor(i / 4) % 4) / 3) * 255;
      data.data[i * 4 + 2] = (Math.floor(i / 16) / 3) * 255;
      data.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator(".panel-scroll input[type=file]").setInputFiles({
    name: "identity-hald.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "identity-hald.png", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply changes" }),
  ).toBeEnabled();
});
