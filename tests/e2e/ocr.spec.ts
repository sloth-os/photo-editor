import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ready } from "./output-helpers";
import { openOcr, ocrPhoto, scan } from "./ocr-helpers";
import { stroke, tool } from "./annotation-helpers";

test("English OCR runs after an offline reload, saves TXT, and creates an editable text layer", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await ocrPhoto(page);
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
  await expect(page.locator("h1")).toHaveText("ocr-english");
  await openOcr(page);
  await scan(page, "HELLO WORLD");
  await expect(page.getByLabel("Recognized text", { exact: true })).toHaveValue(
    /Order 2026/,
  );
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save TXT", exact: true }).click();
  const file = await waiting;
  expect(file.suggestedFilename()).toBe("still-recognized-text.txt");
  expect(await readFile((await file.path())!, "utf8")).toContain("HELLO WORLD");
  await page
    .getByRole("button", { name: "Add text layer", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your words", exact: true }),
  ).toHaveValue(/HELLO WORLD/);
  expect(errors).toEqual([]);
});

for (const sample of [
  {
    fixture: "chinese",
    language: "chi_sim",
    text: "中文识别测试",
    second: "你好世界",
  },
  {
    fixture: "japanese",
    language: "jpn",
    text: "日本語の文字認識",
    second: "こんにちは世界",
  },
])
  test(`local OCR reads actual ${sample.fixture} text`, async ({ page }) => {
    test.setTimeout(90_000);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await ready(page);
    await ocrPhoto(page, sample.fixture);
    await openOcr(page, sample.language);
    await scan(page, sample.text);
    await expect(
      page.getByLabel("Recognized text", { exact: true }),
    ).toHaveValue(new RegExp(sample.second));
    expect(
      requests.filter(
        (url) =>
          /^https?:/.test(url) && !url.startsWith("http://127.0.0.1:4173/"),
      ),
    ).toEqual([]);
  });

test("OCR can cancel, restart, crop a line, and show recognized word locations", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await ocrPhoto(page);
  await openOcr(page);
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel recognition", exact: true })
    .click();
  await expect(page.locator(".ocr-status")).toContainText(
    "Recognition cancelled",
  );
  await page
    .getByRole("button", { name: "Select region", exact: true })
    .click();
  const box = (await page.locator(".ocr-preview").boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + 1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height * 0.49, {
    steps: 8,
  });
  await page.mouse.up();
  await scan(page, "HELLO WORLD");
  await expect(
    page.getByLabel("Recognized text", { exact: true }),
  ).not.toHaveValue(/Order/);
  await page.getByLabel("Show word locations", { exact: true }).check();
  await expect(
    page
      .getByLabel("Recognized word locations", { exact: true })
      .locator("rect"),
  ).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("OCR reads the visible redacted image rather than the hidden source", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ready(page);
  await ocrPhoto(page);
  await tool(page, "Privacy & emphasis");
  await page.getByLabel("Effect", { exact: true }).selectOption("redact");
  await stroke(page, [0.001, 0.001], [0.999, 0.49]);
  await expect(page.locator(".drawing-controls")).toContainText("1 mark");
  await openOcr(page);
  await scan(page, "Order 2026");
  await expect(
    page.getByLabel("Recognized text", { exact: true }),
  ).not.toHaveValue(/HELLO/);
});
