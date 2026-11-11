import { expect, type Page } from "@playwright/test";
import path from "node:path";
import { tool } from "./annotation-helpers";

export async function ocrPhoto(page: Page, name = "english") {
  await page
    .getByTestId("open-file")
    .setInputFiles(path.resolve(`tests/fixtures/ocr-${name}.png`));
  await expect(page.locator("h1")).toHaveText(`ocr-${name}`);
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
export async function openOcr(page: Page, language = "eng") {
  await tool(page, "Extract text (OCR)");
  await expect(
    page.getByRole("button", { name: "Recognize text", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Recognition language", { exact: true })
    .selectOption(language);
}
export async function scan(page: Page, expected: string) {
  await page
    .getByRole("button", { name: "Recognize text", exact: true })
    .click();
  await expect(page.getByLabel("Recognized text", { exact: true })).toHaveValue(
    new RegExp(expected),
    { timeout: 60_000 },
  );
  await expect(page.locator(".ocr-status")).toContainText(
    "Recognition complete",
  );
}
