import { expect, type Page } from "@playwright/test";

export async function tool(page: Page, name: string) {
  const mobile = page.getByRole("navigation", { name: "Mobile editing" });
  if (await mobile.isVisible())
    await mobile.getByRole("button", { name: "Tools", exact: true }).click();
  else await page.getByRole("button", { name: /All tools/ }).click();
  await page.getByRole("textbox", { name: "Search tools" }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}
export async function diagram(page: Page, kind = "white") {
  const url = await page.evaluate((kind) => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#000000";
    if (kind === "divided") ctx.fillRect(195, 0, 10, 300);
    if (kind === "text") ctx.fillRect(100, 143, 200, 14);
    return c.toDataURL();
  }, kind);
  await page.getByTestId("open-file").setInputFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  });
  await expect(page.locator("h1")).toHaveText("diagram");
  await expect.poll(() => pixel(page, 20, 20)).toEqual([255, 255, 255, 255]);
}
export async function pixel(page: Page, x: number, y: number) {
  return page
    .getByTestId("photo-canvas")
    .evaluate(
      (c: HTMLCanvasElement, p) => [
        ...c.getContext("2d")!.getImageData(p.x, p.y, 1, 1).data,
      ],
      { x, y },
    );
}
export async function stroke(page: Page, a: [number, number], b = a) {
  const box = (await page.locator(".photo-wrap").boundingBox())!;
  await page.mouse.move(box.x + a[0] * box.width, box.y + a[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + b[0] * box.width, box.y + b[1] * box.height, {
    steps: 12,
  });
  await page.mouse.up();
}
export async function mode(page: Page, name: string) {
  await page
    .getByRole("group", { name: "Drawing tool", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}
export async function undo(page: Page) {
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
}
export async function redo(page: Page) {
  await page
    .getByRole("button", { name: "Redo (Ctrl+Shift+Z)", exact: true })
    .click();
}
