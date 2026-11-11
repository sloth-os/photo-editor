import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
export async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
export async function source(
  page: Page,
  options: {
    width?: number;
    height?: number;
    noise?: boolean;
    black?: boolean;
  } = {},
) {
  const data = await page.evaluate(
    ({ width = 600, height = 400, noise = false, black = false }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      if (noise) {
        const image = ctx.createImageData(width, height);
        let seed = 123456;
        for (let i = 0; i < image.data.length; i += 4) {
          for (let k = 0; k < 3; k++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            image.data[i + k] = seed >>> 24;
          }
          image.data[i + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
      } else if (black) {
        ctx.fillStyle = "#101810";
        ctx.fillRect(0, 0, width, height);
      } else {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#2080bd");
        gradient.addColorStop(0.5, "#d8a078");
        gradient.addColorStop(1, "#3a8660");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
      return c.toDataURL("image/jpeg", 0.98);
    },
    options,
  );
  await page.getByTestId("open-file").setInputFiles({
    name: "source.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(data.split(",")[1], "base64"),
  });
  await expect(page.locator("h1")).toHaveText("source");
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
export async function choose(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Mobile editing" })
    .getByRole("button", { name: "Tools", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search tools" }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}
export async function signature(page: Page) {
  return page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 16)
      s = (Math.imul(s, 31) + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    return `${c.width}x${c.height}:${s}`;
  });
}
export async function slider(page: Page, name: string, value: number) {
  await page
    .getByRole("slider", { name, exact: true })
    .evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
}
export async function openExport(page: Page, format: string) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp("^" + format + "\\b") })
    .click();
}
export async function download(page: Page) {
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download photo", exact: true })
    .click();
  const file = await waiting,
    bytes = await readFile((await file.path())!);
  return { name: file.suggestedFilename(), bytes };
}
export async function decodedSize(page: Page, bytes: Buffer, mimeType: string) {
  return page.evaluate(
    async ({ data, type }) => {
      const image = new Image();
      image.src = `data:${type};base64,${data}`;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    { data: bytes.toString("base64"), type: mimeType },
  );
}
