import { expect, test, type Page } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
  await expect(page.locator(".app-shell")).toHaveClass(/touch-layout/);
}
async function image(page: Page, width = 400, height = 400) {
  const url = await page.evaluate(
    ({ width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!,
        gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#3f7367");
      gradient.addColorStop(1, "#e7b680");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return c.toDataURL();
    },
    { width, height },
  );
  await page.getByTestId("open-file").setInputFiles({
    name: "touch-photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  });
  await expect(page.locator("h1")).toHaveText("touch-photo");
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
async function signature(page: Page) {
  return page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 16)
      sum = (Math.imul(sum, 31) + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    return `${c.width}x${c.height}:${sum}`;
  });
}
async function choose(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Mobile editing" })
    .getByRole("button", { name: "Tools", exact: true })
    .tap();
  await page.getByRole("textbox", { name: "Search tools" }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .tap();
}
async function touchSequence(
  page: Page,
  frames: { x: number; y: number; id: number }[][],
) {
  const session = await page.context().newCDPSession(page);
  try {
    let previous = 0;
    for (const points of frames) {
      const type = !points.length
        ? "touchEnd"
        : points.length > previous
          ? "touchStart"
          : "touchMove";
      await session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points,
      });
      previous = points.length;
    }
  } finally {
    await session.detach();
  }
}

test("compact touch controls keep a square photo almost screen-wide and a real touch drag changes pixels", async ({
  page,
}) => {
  await ready(page);
  await image(page);
  await page.getByRole("button", { name: "Adjust", exact: true }).tap();
  await expect(
    page.getByRole("combobox", { name: "Choose adjustment" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.width)
    .toBeGreaterThan(370);
  const photo = (await page.locator(".photo-wrap").boundingBox())!,
    dock = (await page.locator(".tool-panel").boundingBox())!;
  expect(photo.height).toBeGreaterThan(370);
  expect(photo.y + photo.height).toBeLessThanOrEqual(dock.y + 1);
  expect(dock.height).toBeLessThan(200);
  const before = await signature(page);
  await page
    .getByRole("combobox", { name: "Choose adjustment" })
    .selectOption("contrast");
  const slider = page.getByRole("slider", { name: "Contrast", exact: true }),
    box = (await slider.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await touchSequence(page, [
    [{ id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    [{ id: 1, x: box.x + box.width * 0.9, y: box.y + box.height / 2 }],
    [],
  ]);
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeGreaterThan(50);
  await expect.poll(() => signature(page)).not.toBe(before);
  for (const name of [
    "Zoom in",
    "Zoom out",
    "Pan photo",
    "Expand photo preview",
  ]) {
    const hit = (await page
      .getByRole("button", { name, exact: true })
      .boundingBox())!;
    expect(Math.min(hit.width, hit.height)).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("more controls can expand and return to the large preview without losing the composition", async ({
  page,
}) => {
  await ready(page);
  await image(page);
  await choose(page, "Collage & stitch");
  await page
    .getByTestId("touch-asset-files")
    .setInputFiles("tests/fixtures/color-field.png");
  await expect(
    page.getByRole("combobox", { name: "Choose adjustment" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "More controls", exact: true }).tap();
  await expect(page.getByLabel("Collage photos")).toBeVisible();
  await expect(page.getByLabel("Collage photos").locator("li")).toHaveCount(2);
  await page.getByLabel("Layout", { exact: true }).selectOption("horizontal");
  await expect.poll(() => signature(page)).toMatch(/^400x163:/);
  const composed = await signature(page);
  await page.getByRole("button", { name: "More photo", exact: true }).tap();
  await expect(
    page.getByRole("combobox", { name: "Choose adjustment" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.width)
    .toBeGreaterThan(370);
  await expect.poll(() => signature(page)).toBe(composed);
  await page.getByRole("button", { name: "Apply changes", exact: true }).tap();
  await expect(page.locator(".save-status")).toContainText("All changes saved");
});

test("expanded preview uses the viewport and both return paths retain pending edits", async ({
  page,
}) => {
  await ready(page);
  await image(page, 300, 600);
  await page.getByRole("button", { name: "Adjust", exact: true }).tap();
  const original = await signature(page);
  await page
    .getByRole("slider", { name: "Brightness", exact: true })
    .evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "35");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await expect.poll(() => signature(page)).not.toBe(original);
  const edited = await signature(page);
  await page
    .getByRole("button", { name: "Expand photo preview", exact: true })
    .tap();
  await expect(page.locator(".app-shell")).toHaveClass(/preview-focus/);
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.height)
    .toBeGreaterThan(740);
  expect(
    (await page
      .getByRole("region", { name: "Photo editing canvas" })
      .boundingBox())!.height,
  ).toBe(844);
  await page.getByRole("button", { name: "Back to editor", exact: true }).tap();
  await expect(
    page.getByRole("slider", { name: "Brightness", exact: true }),
  ).toHaveValue("35");
  await expect.poll(() => signature(page)).toBe(edited);
  await page
    .getByRole("button", { name: "Expand photo preview", exact: true })
    .tap();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("slider", { name: "Brightness", exact: true }),
  ).toHaveValue("35");
  await expect(
    page.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeEnabled();
});

test("two-finger zoom and pan never paint, while one-finger brush strokes remain available", async ({
  page,
}) => {
  await ready(page);
  await choose(page, "Brush");
  const before = await signature(page),
    box = (await page.locator(".photo-wrap").boundingBox())!,
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ id: 1, x: cx - 50, y: cy }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 1, x: cx - 42, y: cy }],
    });
    await expect.poll(() => signature(page)).not.toBe(before);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { id: 1, x: cx - 42, y: cy },
        { id: 2, x: cx + 50, y: cy },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { id: 1, x: cx - 90, y: cy },
        { id: 2, x: cx + 98, y: cy },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
  await expect
    .poll(() =>
      page.getByRole("button", { name: "Fit photo to screen" }).textContent(),
    )
    .not.toBe("Fit");
  await expect.poll(() => signature(page)).toBe(before);
  await expect(
    page.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeDisabled();
  const transform = await page.locator(".photo-wrap").getAttribute("style");
  await touchSequence(page, [
    [
      { id: 1, x: cx - 50, y: cy },
      { id: 2, x: cx + 50, y: cy },
    ],
    [
      { id: 1, x: cx - 20, y: cy },
      { id: 2, x: cx + 80, y: cy },
    ],
    [],
  ]);
  await expect
    .poll(() => page.locator(".photo-wrap").getAttribute("style"))
    .not.toBe(transform);
  await expect.poll(() => signature(page)).toBe(before);
  await page
    .getByRole("button", { name: "Fit photo to screen", exact: true })
    .tap();
  await page.touchscreen.tap(cx, cy);
  await expect.poll(() => signature(page)).not.toBe(before);
});

test("touch numbering cancels a tentative mark on pinch and one finger draws in color", async ({
  page,
}) => {
  await ready(page);
  await image(page);
  await choose(page, "Draw & annotate");
  await page.getByRole("button", { name: "More controls", exact: true }).tap();
  await page
    .getByRole("group", { name: "Drawing tool", exact: true })
    .getByRole("button", { name: "Number", exact: true })
    .tap();
  await page.getByRole("button", { name: "More photo", exact: true }).tap();
  const before = await signature(page),
    box = (await page.locator(".photo-wrap").boundingBox())!,
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await touchSequence(page, [
    [{ id: 1, x: cx - 30, y: cy }],
    [
      { id: 1, x: cx - 30, y: cy },
      { id: 2, x: cx + 30, y: cy },
    ],
    [
      { id: 1, x: cx - 60, y: cy },
      { id: 2, x: cx + 60, y: cy },
    ],
    [],
  ]);
  await expect.poll(() => signature(page)).toBe(before);
  await expect(
    page.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Fit photo to screen", exact: true })
    .tap();
  await page.getByRole("button", { name: "More controls", exact: true }).tap();
  await expect(page.getByLabel("Next number", { exact: true })).toHaveValue(
    "1",
  );
  await page
    .getByRole("group", { name: "Drawing tool", exact: true })
    .getByRole("button", { name: "Pen", exact: true })
    .tap();
  await page.getByRole("button", { name: "Blue paint", exact: true }).tap();
  await page.getByRole("button", { name: "More photo", exact: true }).tap();
  await touchSequence(page, [
    [{ id: 1, x: cx - 60, y: cy }],
    [{ id: 1, x: cx, y: cy }],
    [{ id: 1, x: cx + 60, y: cy }],
    [],
  ]);
  await expect.poll(() => signature(page)).not.toBe(before);
  await expect
    .poll(() =>
      page
        .getByTestId("photo-canvas")
        .evaluate((c: HTMLCanvasElement) => [
          ...c.getContext("2d")!.getImageData(200, 200, 1, 1).data,
        ]),
    )
    .toEqual([87, 155, 231, 255]);
  const painted = await signature(page);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(before);
  await touchSequence(page, [
    [{ id: 1, x: cx - 30, y: cy }],
    [
      { id: 1, x: cx - 30, y: cy },
      { id: 2, x: cx + 30, y: cy },
    ],
    [
      { id: 1, x: cx - 60, y: cy },
      { id: 2, x: cx + 60, y: cy },
    ],
    [],
  ]);
  await expect.poll(() => signature(page)).toBe(before);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Shift+Z)", exact: true })
    .click();
  await expect.poll(() => signature(page)).toBe(painted);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("coarse-pointer tablets have large controls and adapt between side and bottom panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await ready(page);
  await page.getByRole("button", { name: "Adjust", exact: true }).tap();
  await expect(page.locator(".rail")).toBeHidden();
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.width)
    .toBeGreaterThan(700);
  const photo = (await page.locator(".photo-wrap").boundingBox())!,
    side = (await page.locator(".tool-panel").boundingBox())!;
  expect(photo.x + photo.width).toBeLessThanOrEqual(side.x);
  expect(side.width).toBe(300);
  expect(
    (await page
      .getByRole("slider", { name: "Brightness", exact: true })
      .boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(
    page.getByRole("combobox", { name: "Choose adjustment" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.width)
    .toBeGreaterThan(740);
  const portrait = (await page.locator(".photo-wrap").boundingBox())!,
    bottom = (await page.locator(".tool-panel").boundingBox())!;
  expect(portrait.y + portrait.height).toBeLessThanOrEqual(bottom.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    768,
  );
});

test("landscape phones and narrow screens keep the editor usable without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page);
  await page.getByRole("button", { name: "Adjust", exact: true }).tap();
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.height)
    .toBeGreaterThan(220);
  const photo = (await page.locator(".photo-wrap").boundingBox())!,
    panel = (await page.locator(".tool-panel").boundingBox())!;
  expect(photo.x + photo.width).toBeLessThanOrEqual(panel.x);
  await page
    .getByRole("button", { name: "Expand photo preview", exact: true })
    .tap();
  await expect
    .poll(async () => (await page.locator(".photo-wrap").boundingBox())!.height)
    .toBeGreaterThan(315);
  await page.getByRole("button", { name: "Back to editor", exact: true }).tap();
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(
    page.getByRole("button", { name: "Open photo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});
