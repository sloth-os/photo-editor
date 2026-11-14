import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ready, signature } from "./output-helpers";
import { tool, stroke } from "./annotation-helpers";
import {
  scanner,
  addScanFiles,
  scanView,
  scanSignature,
  scanDownload,
  documentPhoto,
  englishPhoto,
  chinesePhoto,
  fakeScanCamera,
} from "./scanner-helpers";

test("scanner finds page edges, edits real corners, straightens and cleans the page", async ({
  page,
}) => {
  await ready(page);
  const editor = await signature(page);
  await scanner(page);
  await addScanFiles(page, documentPhoto);
  await expect(page.locator(".scan-page-bar")).toContainText("Edges found");
  const box = (await page
      .getByRole("group", { name: "Document corner editor" })
      .boundingBox())!,
    corner = page.getByRole("button", {
      name: "Document top left corner",
      exact: true,
    }),
    position = (await corner.boundingBox())!;
  expect(position.x + position.width / 2).toBeGreaterThan(
    box.x + box.width * 0.12,
  );
  expect(position.x + position.width / 2).toBeLessThan(
    box.x + box.width * 0.22,
  );
  await scanView(page);
  const clean = await scanSignature(page);
  await page
    .getByRole("group", { name: "Document filter" })
    .getByRole("button", { name: "Original", exact: true })
    .click();
  await expect.poll(() => scanSignature(page)).not.toBe(clean);
  const original = await scanSignature(page);
  await page
    .getByRole("group", { name: "Scanner preview" })
    .getByRole("button", { name: "Corners", exact: true })
    .click();
  await corner.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await scanView(page);
  await expect.poll(() => scanSignature(page)).not.toBe(original);
  await page
    .getByRole("group", { name: "Document filter" })
    .getByRole("button", { name: "Black & white", exact: true })
    .click();
  await expect
    .poll(() =>
      page.getByTestId("scan-preview").evaluate((c: HTMLCanvasElement) => {
        const d = c
          .getContext("2d")!
          .getImageData(0, 0, c.width, c.height).data;
        let ink = 0,
          paper = 0,
          other = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] === 0) ink++;
          else if (d[i] === 255) paper++;
          else other++;
        }
        return { ink: ink > 1000, paper: paper > 10000, other };
      }),
    )
    .toEqual({ ink: true, paper: true, other: 0 });
  const size = await page
    .getByTestId("scan-preview")
    .evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  await page
    .getByRole("button", { name: "Rotate scanned page right", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .getByTestId("scan-preview")
        .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
    )
    .toEqual([size[1], size[0]]);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(await signature(page)).toBe(editor);
});

test("multipage order, delete/undo, recovery and numbered PNG ZIP exports stay consistent", async ({
  page,
}) => {
  await ready(page);
  await scanner(page);
  await addScanFiles(page, [documentPhoto, englishPhoto, chinesePhoto]);
  await page.getByLabel("Document name", { exact: true }).fill("My scan.pdf");
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Move page earlier", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Select scan page 2: ocr-chinese",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Delete scanned page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Undo page deletion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(3);
  await expect(page.locator(".scan-save-state")).toHaveText(
    "Saved on this device",
  );
  await page.reload();
  await scanner(page);
  await expect(page.getByLabel("Document name", { exact: true })).toHaveValue(
    "My scan.pdf",
  );
  await expect(
    page.getByRole("button", {
      name: "Select scan page 2: ocr-chinese",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page
    .getByLabel("PDF paper size", { exact: true })
    .selectOption("letter");
  const pdf = await scanDownload(page, "Download PDF"),
    decoded = await PDFDocument.load(pdf.bytes);
  expect(pdf.file.suggestedFilename()).toBe("My scan.pdf");
  expect(decoded.getPageCount()).toBe(3);
  expect(decoded.getPage(0).getWidth()).toBe(792);
  await page.getByLabel("File format", { exact: true }).selectOption("png");
  const downloaded = await scanDownload(page, "Download PNG ZIP"),
    zip = await JSZip.loadAsync(downloaded.bytes);
  expect(Object.keys(zip.files)).toEqual([
    "My scan-01.png",
    "My scan-02.png",
    "My scan-03.png",
  ]);
  expect(
    Buffer.from(await zip.file("My scan-02.png")!.async("uint8array"))
      .subarray(1, 4)
      .toString(),
  ).toBe("PNG");
});

test("saved scans, real OCR and searchable PDF work after a completely offline reload", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await scanner(page);
  await addScanFiles(page, [documentPhoto, chinesePhoto]);
  await expect(page.locator(".scan-save-state")).toHaveText(
    "Saved on this device",
  );
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
  await scanner(page);
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByLabel("Searchable PDF with OCR", { exact: true }).check();
  await page
    .getByLabel("Language for unrecognized pages", { exact: true })
    .selectOption("mixed");
  const exported = await scanDownload(page, "Download PDF");
  await exported.file.saveAs("test-results/scanner-searchable.pdf");
  const loading = getDocument({
      data: new Uint8Array(exported.bytes),
      useSystemFonts: false,
      disableFontFace: true,
    }),
    pdf = await loading.promise;
  expect(pdf.numPages).toBe(2);
  const texts: string[] = [];
  for (let i = 1; i <= 2; i++)
    texts.push(
      (await (await pdf.getPage(i)).getTextContent()).items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  expect(texts[0]).toContain("STILL");
  expect(texts[0]).toContain("128.50");
  expect(texts[1].replace(/\s/g, "")).toContain("中文识别测试");
  await loading.destroy();
  await page.getByRole("tab", { name: "OCR", exact: true }).click();
  await expect(
    page.getByLabel("Recognized page text", { exact: true }),
  ).toHaveValue(/你好世界/);
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save document TXT", exact: true })
    .click();
  const text = await waiting;
  expect(await readFile((await text.path())!, "utf8")).toContain("STILL");
  expect(errors).toEqual([]);
});

test("using the current photo scans its visible edits and opens a corrected copy in the editor", async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId("open-file").setInputFiles(documentPhoto);
  await expect(page.locator("h1")).toHaveText("document-perspective");
  await scanner(page);
  await page
    .getByRole("button", { name: "Use current photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Edit a copy", exact: true }),
  ).toBeEnabled();
  await scanView(page);
  const originalScan = await scanSignature(page);
  await page.getByRole("button", { name: "Edit a copy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Document scanner.", exact: true }),
  ).toBeHidden();
  await expect(page.locator("h1")).toHaveText("Edited photo");
  await expect.poll(() => signature(page)).not.toMatch(/^1200x1100:/);
  await tool(page, "Privacy & emphasis");
  await page.getByLabel("Effect", { exact: true }).selectOption("redact");
  await stroke(page, [0.15, 0.18], [0.85, 0.36]);
  await scanner(page);
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(1);
  await scanView(page);
  await page.locator(".scan-more-settings summary").click();
  await page
    .getByRole("button", {
      name: "Replace page with current photo",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => scanSignature(page)).not.toBe(originalScan);
  await expect
    .poll(() =>
      page
        .getByTestId("scan-preview")
        .evaluate((c: HTMLCanvasElement) => [
          ...c
            .getContext("2d")!
            .getImageData(
              Math.floor(c.width * 0.5),
              Math.floor(c.height * 0.26),
              1,
              1,
            ).data,
        ]),
    )
    .toEqual([17, 17, 17, 255]);
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByLabel("File format", { exact: true }).selectOption("png");
  const exported = await scanDownload(page, "Download PNG"),
    pixel = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return [
        ...ctx.getImageData(
          Math.floor(c.width * 0.5),
          Math.floor(c.height * 0.26),
          1,
          1,
        ).data,
      ];
    }, exported.bytes.toString("base64"));
  expect(pixel).toEqual([17, 17, 17, 255]);
  await page
    .getByRole("button", { name: "Undo page replacement", exact: true })
    .click();
  await expect.poll(() => scanSignature(page)).toBe(originalScan);
});

test("phone crop view stays large, handles move by finger, and narrow screens do not overflow", async ({
  browser,
}) => {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    }),
    page = await context.newPage();
  try {
    await ready(page);
    await scanner(page);
    await addScanFiles(page, documentPhoto);
    const photo = (await page
      .getByRole("group", { name: "Document corner editor" })
      .boundingBox())!;
    expect(photo.width).toBeGreaterThan(330);
    const handle = (await page
        .getByRole("button", { name: "Document top left corner", exact: true })
        .boundingBox())!,
      x = handle.x + handle.width / 2,
      y = handle.y + handle.height / 2,
      session = await context.newCDPSession(page);
    expect(handle.width).toBeGreaterThanOrEqual(44);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x, y }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: x + 18, y: y + 15 }],
    });
    await expect(
      page.getByLabel("Magnified document corner", { exact: true }),
    ).toBeVisible();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
    const changed = (await page
      .getByRole("button", { name: "Document top left corner", exact: true })
      .boundingBox())!;
    expect(changed.x).toBeGreaterThan(handle.x + 12);
    await scanView(page);
    await page
      .getByRole("group", { name: "Document filter" })
      .getByRole("button", { name: "Whiteboard", exact: true })
      .click();
    await expect(page.getByTestId("scan-preview")).toHaveAttribute(
      "data-ready",
      "true",
    );
    await page.setViewportSize({ width: 320, height: 700 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
    await page.getByRole("tab", { name: "Export", exact: true }).click();
    await page.getByLabel("File format", { exact: true }).selectOption("jpeg");
    expect(
      (await scanDownload(page, "Download JPG")).bytes.subarray(0, 2),
    ).toEqual(Buffer.from([255, 216]));
    await page.setViewportSize({ width: 844, height: 390 });
    await page
      .getByRole("group", { name: "Scanner preview" })
      .getByRole("button", { name: "Corners", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Expand scanner preview", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await page
            .getByRole("group", { name: "Document corner editor" })
            .boundingBox())!.height,
      )
      .toBeGreaterThan(250);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Document scanner.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download JPG", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("scanner camera detects real edges, captures, switches lenses and releases tracks", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await fakeScanCamera(page);
  await ready(page);
  await scanner(page);
  await page
    .getByRole("button", { name: "Scan with camera", exact: true })
    .click();
  await expect(
    page.getByLabel("Live detected page edges", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Camera light", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Camera light", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Capture document page", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Done · 1 page$/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Front camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture document page", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => (window as any).scanCameraStats.stopped))
    .toBeGreaterThanOrEqual(1);
  await page
    .getByLabel("Scanner camera lens", { exact: true })
    .selectOption("back");
  await expect(
    page.getByRole("button", { name: "Capture document page", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /^Done · 1 page$/ }).click();
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(1);
  const stats = await page.evaluate(() => (window as any).scanCameraStats);
  expect(stats.stopped).toBe(stats.streams);
  expect(stats.torch).toEqual([true]);
  expect(stats.requested[0].video.facingMode.exact).toBe("environment");
  expect(
    stats.requested.some((c: any) => c.video.facingMode?.exact === "user"),
  ).toBe(true);
});

test("steady auto capture adds one page and does not repeatedly capture an unmoved document", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await fakeScanCamera(page);
  await ready(page);
  await scanner(page);
  await page
    .getByRole("button", { name: "Scan with camera", exact: true })
    .click();
  await page.getByLabel("Auto capture when steady", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: /^Done · 1 page$/ }),
  ).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator(".scan-camera-guidance")).toContainText(
    "Move the page",
  );
  const frames = await page.evaluate(
    () => (window as any).scanCameraStats.frames,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).scanCameraStats.frames), {
      timeout: 10_000,
    })
    .toBeGreaterThan(frames + 35);
  await expect(
    page.getByRole("button", { name: /^Done · 1 page$/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /^Done · 1 page$/ }).click();
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(1);
});

test("cancelled PDF export produces no download, OCR can restart, and changing a scan clears stale text", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const downloads: string[] = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  await ready(page);
  await scanner(page);
  await addScanFiles(page, [documentPhoto, englishPhoto]);
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  await page.getByLabel("Searchable PDF with OCR", { exact: true }).check();
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel operation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".scan-messages")).toContainText("Cancelled");
  expect(downloads).toEqual([]);
  await page.getByRole("tab", { name: "OCR", exact: true }).click();
  await page
    .getByRole("button", { name: "Recognize page", exact: true })
    .click();
  await expect(
    page.getByLabel("Recognized page text", { exact: true }),
  ).toHaveValue(/HELLO WORLD/, { timeout: 60_000 });
  await page.getByRole("tab", { name: "Adjust", exact: true }).click();
  await page
    .getByRole("button", { name: "Rotate scanned page right", exact: true })
    .click();
  await page.getByRole("tab", { name: "OCR", exact: true }).click();
  await expect(
    page.getByLabel("Recognized page text", { exact: true }),
  ).toHaveValue("");
});

test("camera denial retains device-camera and photo-import fallbacks; bad files keep existing pages", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    }),
  );
  await ready(page);
  await scanner(page);
  await page
    .getByRole("button", { name: "Scan with camera", exact: true })
    .click();
  await expect(page.locator(".scan-camera-error")).toContainText(
    "Camera access was blocked",
  );
  await expect(
    page.getByRole("button", { name: "Use device camera", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Capture document with device camera", { exact: true })
    .setInputFiles(documentPhoto);
  await expect(
    page.getByRole("button", { name: /^Done · 1 page$/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /^Done · 1 page$/ }).click();
  await page.getByTestId("scan-files").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("no image"),
  });
  await expect(page.locator(".scan-messages [role=alert]")).toContainText(
    "bad.txt",
  );
  await expect(
    page.getByRole("button", { name: /^Select scan page/ }),
  ).toHaveCount(1);
});
