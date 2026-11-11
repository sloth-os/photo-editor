import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import piexif from "piexifjs";
const astronaut = path.resolve("tests/fixtures/astronaut.png");
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
async function signature(page: Page) {
  return page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 64)
      sum =
        (Math.imul(sum, 31) + data[i] + data[i + 1] * 3 + data[i + 2] * 7) | 0;
    return `${c.width}x${c.height}:${sum}`;
  });
}
async function slider(page: Page, name: string, value: number) {
  await page
    .getByRole("slider", { name, exact: true })
    .evaluate((el: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(el, String(value));
      el.dispatchEvent(new Event("input", { bubbles: true }));
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
async function photo(page: Page, file: string) {
  await page.getByTestId("open-file").setInputFiles(file);
  await expect(page.locator("h1")).toHaveText(
    path.basename(file).replace(/\.[^.]+$/, ""),
  );
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
async function localProject(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = indexedDB.open("still-studio");
        request.onsuccess = () => {
          const db = request.result,
            get = db
              .transaction("studio", "readonly")
              .objectStore("studio")
              .get("project");
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test("face mesh, subject masks and learned depth work after a fully offline reload", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await ready(page);
  await photo(page, astronaut);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("astronaut");
  await tool(page, "Portrait");
  await page
    .getByRole("button", { name: "Detect faces automatically", exact: true })
    .click();
  await expect(page.locator(".analysis-note")).toContainText(
    "Face detected on this device",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "Apply changes" }).click();
  await tool(page, "Head pose");
  await page
    .getByRole("button", { name: "Detect faces automatically", exact: true })
    .click();
  await expect(page.locator(".analysis-note")).toContainText(
    "Face detected on this device",
    {
      timeout: 60_000,
    },
  );
  const before = await signature(page);
  await slider(page, "Turn", 45);
  await expect.poll(() => signature(page)).not.toBe(before);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await tool(page, "Selective");
  await page.getByRole("button", { name: "Background", exact: true }).click();
  await expect(page.getByLabel("Background selection preview")).toBeVisible({
    timeout: 60_000,
  });
  expect(["exclude", "xor"]).toContain(
    await page
      .locator(".selection-overlay")
      .evaluate((e: HTMLElement) => e.style.maskComposite),
  );
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".selection-overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "Subject", exact: true }).click();
  await expect(page.getByLabel("Subject selection preview")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Apply changes" }).click();
  await tool(page, "Lens blur");
  await page
    .getByRole("button", { name: "Estimate scene depth", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Depth", exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  const saved = await localProject(page),
    edits = saved.edits as {
      faces?: unknown[];
      mesh?: unknown[];
      mask?: string;
      depth?: string;
    }[];
  expect(
    edits.some((edit) => edit.faces?.length && edit.mesh?.length),
  ).toBeTruthy();
  expect(
    edits.some((edit) => edit.mask?.startsWith("data:image/png")),
  ).toBeTruthy();
  expect(
    edits.some((edit) => edit.depth?.startsWith("data:image/png")),
  ).toBeTruthy();
  const result = await signature(page);
  await page.reload();
  await expect.poll(() => signature(page)).toBe(result);
});

test("content-aware expansion creates pixels and can be undone", async ({
  page,
}) => {
  await ready(page);
  await photo(page, path.resolve("tests/fixtures/color-field.png"));
  const original = await signature(page);
  await tool(page, "Expand");
  await page.getByRole("button", { name: "Smart", exact: true }).click();
  await slider(page, "Border size", 15);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect.poll(() => signature(page)).not.toBe(original);
  expect(
    await page
      .getByTestId("photo-canvas")
      .evaluate((c: HTMLCanvasElement) => [
        ...c.getContext("2d")!.getImageData(1, 1, 1, 1).data,
      ]),
  ).not.toEqual([0, 0, 0, 0]);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(original);
});

test("16-bit RAW development changes exposure and preserves its source across reloads", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ready(page);
  await photo(page, path.resolve("tests/fixtures/sensor.dng"));
  await expect(page.locator(".tool-title h2")).toHaveText("RAW develop");
  const initial = await signature(page);
  await slider(page, "Exposure", 60);
  await expect
    .poll(() => signature(page), { timeout: 30_000 })
    .not.toBe(initial);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  const modified = await signature(page);
  expect((await localProject(page)).rawSource).toBeTruthy();
  await page.reload();
  await expect.poll(() => signature(page), { timeout: 30_000 }).toBe(modified);
});

test("camera previews Looks and captures a source with an editable look", async ({
  browser,
}) => {
  const context = await browser.newContext({ permissions: ["camera"] }),
    page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#609f85";
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = "#f0cc8c";
        ctx.fillRect(150, 80, 300, 250);
        return c.captureStream(12);
      },
    });
  });
  try {
    await ready(page);
    await page
      .getByRole("button", { name: "Take a photo", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Capture photo", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Pop", exact: true })
      .click();
    await expect(
      page.getByLabel("Live camera with selected look"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Capture photo", exact: true })
      .click();
    await expect(page.locator("h1")).toHaveText("Still camera");
    await page
      .getByRole("button", { name: "Edits", exact: true })
      .first()
      .click();
    await expect(page.locator(".edit-stack")).toContainText("Pop look");
    await page
      .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
      .click();
    await expect(page.locator(".edit-stack .stack-item")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("metadata export retains camera tags with correct orientation in JPG, PNG and WebP", async ({
  page,
}) => {
  await ready(page);
  const jpeg = await page
      .getByTestId("photo-canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL("image/jpeg", 0.9)),
    source = piexif.insert(
      piexif.dump({
        "0th": {
          [piexif.ImageIFD.Make]: "Still integration camera",
          [piexif.ImageIFD.Orientation]: 6,
        },
        GPS: {
          [piexif.GPSIFD.GPSLatitudeRef]: "N",
          [piexif.GPSIFD.GPSLatitude]: [
            [37, 1],
            [0, 1],
            [0, 1],
          ],
        },
      }),
      jpeg,
    );
  await page.getByTestId("open-file").setInputFiles({
    name: "camera-exif.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(source.split(",")[1], "base64"),
  });
  await expect(page.locator("h1")).toHaveText("camera-exif");
  for (const format of ["JPG", "PNG", "WebP"]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByRole("button", { name: new RegExp("^" + format) }).click();
    await page
      .getByRole("checkbox", { name: /Preserve camera metadata/ })
      .check();
    const dl = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download photo", exact: true })
      .click();
    const file = await dl,
      bytes = await readFile((await file.path())!);
    let encoded: string;
    if (format === "JPG") encoded = bytes.toString("binary");
    else if (format === "PNG") {
      const offset = bytes.indexOf(Buffer.from("eXIf")),
        length = bytes.readUInt32BE(offset - 4);
      encoded =
        "Exif\0\0" +
        bytes.subarray(offset + 4, offset + 4 + length).toString("binary");
    } else {
      const offset = bytes.indexOf(Buffer.from("EXIF")),
        length = bytes.readUInt32LE(offset + 4);
      encoded = bytes
        .subarray(offset + 8, offset + 8 + length)
        .toString("binary");
      expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
    }
    const tags = piexif.load(encoded);
    expect(tags["0th"]![piexif.ImageIFD.Make]).toBe("Still integration camera");
    expect(tags["0th"]![piexif.ImageIFD.Orientation]).toBe(1);
    expect(tags.GPS![piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
    expect(tags.Exif![piexif.ExifIFD.PixelXDimension]).toBeGreaterThan(0);
  }
});

test("Discover supports accounts, offline publishing, likes and comments", async ({
  page,
  context,
}) => {
  await ready(page);
  await slider(page, "Contrast", 25);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await page.getByRole("button", { name: "Explore looks" }).click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.locator(".community-look")).toHaveCount(6);
  await page.getByText("Connect a community service", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Community address" })
    .fill("http://127.0.0.1:4878");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("test-" + Date.now());
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-test-password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator(".community-form")).toHaveCount(0);
  await page.getByRole("button", { name: "Share look", exact: true }).click();
  const title = "Offline morning " + Date.now();
  await page
    .getByRole("textbox", { name: "Look name", exact: true })
    .fill(title);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Publish this look", exact: true })
    .click();
  await expect(page.locator(".community-outbox")).toContainText(
    "1 look waiting to share",
  );
  await context.setOffline(false);
  const card = page.locator(".community-look").filter({ hasText: title });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card
    .getByRole("button", { name: `Like ${title}`, exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: `Like ${title}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card
    .getByRole("button", { name: `Comments on ${title}`, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your comment", exact: true })
    .fill("A lovely light <b>kept as text</b>.");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.locator(".community-comments")).toContainText(
    "A lovely light <b>kept as text</b>.",
  );
  expect(await page.locator(".community-comments b").count()).toBe(0);
});

test("XMP and native QR files round-trip supported recipes", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByTestId("import-look")
    .setInputFiles(path.resolve("tests/fixtures/native-snapseed.txt"));
  await expect(page.locator(".saved-looks")).toContainText(
    "Imported Snapseed look",
  );
  await expect(page.locator(".recipe-warning")).toContainText("not rendered");
  await page
    .getByRole("button", {
      name: "Download Imported Snapseed look as XMP",
      exact: true,
    })
    .click({ trial: true });
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Download Imported Snapseed look as XMP",
      exact: true,
    })
    .click();
  const xmp = await dl;
  await page.getByTestId("import-look").setInputFiles({
    name: "roundtrip.xmp",
    mimeType: "application/rdf+xml",
    buffer: await readFile((await xmp.path())!),
  });
  await expect(page.locator(".saved-looks>div")).toHaveCount(2);
});

test("arbitrary curves, tiled PNG LUTs and film responses edit real pixels", async ({
  page,
}) => {
  await ready(page);
  await photo(page, path.resolve("tests/fixtures/color-field.png"));
  const original = await signature(page);
  await tool(page, "Curves");
  const graph = page.locator(".curve-graph"),
    box = (await graph.boundingBox())!;
  await graph.click({
    position: {
      x: (box.width * (20 + 0.37 * 220)) / 260,
      y: (box.height * (180 - 0.24 * 160)) / 200,
    },
  });
  await expect(graph.locator("circle")).toHaveCount(6);
  await expect.poll(() => signature(page)).not.toBe(original);
  await page.getByRole("button", { name: "Remove point", exact: true }).click();
  await expect(graph.locator("circle")).toHaveCount(5);
  await expect.poll(() => signature(page)).toBe(original);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await tool(page, "LUT");
  const tiled = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const ctx = c.getContext("2d")!,
      image = ctx.createImageData(8, 8);
    for (let b = 0; b < 4; b++)
      for (let g = 0; g < 4; g++)
        for (let r = 0; r < 4; r++) {
          const x = r + (b % 2) * 4,
            y = g + Math.floor(b / 2) * 4,
            i = (y * 8 + x) * 4;
          image.data.set([r * 85, g * 85, b * 85, 255], i);
        }
    ctx.putImageData(image, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator(".panel-scroll input[type=file]").setInputFiles({
    name: "tiled.png",
    mimeType: "image/png",
    buffer: Buffer.from(tiled, "base64"),
  });
  await page
    .getByRole("button", { name: "Tiled / Unreal", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(original);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await tool(page, "Grainy film");
  await slider(page, "Style strength", 100);
  await page
    .getByRole("combobox", { name: "Film stock" })
    .selectOption("portrait");
  const portrait = await signature(page);
  await page
    .getByRole("combobox", { name: "Film stock" })
    .selectOption("tungsten");
  await expect.poll(() => signature(page)).not.toBe(portrait);
});

test("AI selections are regenerated for batch photos and saved Looks", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const observed: { kind: string }[] = [];
    (window as unknown as { analyses: unknown }).analyses = observed;
    window.Worker = class extends OriginalWorker {
      postMessage(message: unknown, transfer: Transferable[] = []) {
        if (message && typeof message === "object" && "kind" in message)
          observed.push({ kind: String(message.kind) });
        super.postMessage(message, transfer);
      }
    };
  });
  await ready(page);
  await photo(page, astronaut);
  const padded = await page
    .getByTestId("photo-canvas")
    .evaluate((source: HTMLCanvasElement) => {
      const c = document.createElement("canvas");
      c.width = 768;
      c.height = 512;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#888b7c";
      ctx.fillRect(0, 0, 768, 512);
      ctx.drawImage(source, 0, 0);
      return c.toDataURL("image/png").split(",")[1];
    });
  await tool(page, "Portrait");
  await page
    .getByRole("button", { name: "Detect faces automatically", exact: true })
    .click();
  await expect(page.locator(".analysis-note")).toContainText(
    "Face detected on this device",
    {
      timeout: 60000,
    },
  );
  await slider(page, "Face spotlight", 65);
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  const initial = (await localProject(page)).edits as {
    faces: { x: number }[][];
  }[];
  const originalNose = initial[0].faces[0][1].x;
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByTestId("batch-files").setInputFiles([
    {
      name: "astronaut.png",
      mimeType: "image/png",
      buffer: await readFile(astronaut),
    },
    {
      name: "wide.png",
      mimeType: "image/png",
      buffer: Buffer.from(padded, "base64"),
    },
  ]);
  await dl;
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { analyses: { kind: string }[] }).analyses.filter(
          (item) => item.kind === "face",
        ).length,
    ),
  ).toBe(3);
  await page.getByRole("button", { name: "Explore looks" }).click();
  await page.getByRole("button", { name: "Save look", exact: true }).click();
  await page.getByRole("textbox", { name: "Look name" }).fill("Face light");
  await page.getByRole("button", { name: "Save my look", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByTestId("open-file").setInputFiles({
    name: "wide.png",
    mimeType: "image/png",
    buffer: Buffer.from(padded, "base64"),
  });
  await expect(page.locator("h1")).toHaveText("wide");
  await page.getByRole("button", { name: "Explore looks" }).click();
  await page
    .getByRole("button", { name: /^Face light 1 adjustments$/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  const current = (await localProject(page)).edits as {
    faces: { x: number }[][];
  }[];
  expect(current[0].faces[0][1].x).toBeLessThan(originalNose * 0.85);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { analyses: { kind: string }[] }).analyses.filter(
          (item) => item.kind === "face",
        ).length,
    ),
  ).toBe(4);
});
