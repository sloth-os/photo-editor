import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await expect(page.locator(".canvas-top-right")).toContainText(
    "Private by nature",
  );
}
async function tool(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1440) < 700)
    await page
      .getByRole("navigation", { name: "Mobile editing" })
      .getByRole("button", { name: "Tools", exact: true })
      .click();
  else await page.getByRole("button", { name: /All tools/ }).click();
  await page.getByRole("textbox", { name: "Search tools" }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.locator(".tool-title h2")).toHaveText(name);
}
async function slider(page: Page, name: string, value: number) {
  await page
    .getByRole("slider", { name, exact: true })
    .evaluate((el: HTMLInputElement, v) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
}
async function signature(page: Page) {
  return page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 16)
      sum =
        (Math.imul(sum, 31) +
          d[i] +
          d[i + 1] * 3 +
          d[i + 2] * 7 +
          d[i + 3] * 11) |
        0;
    return `${c.width}x${c.height}:${sum}`;
  });
}
async function pixel(page: Page, x: number, y: number) {
  return page
    .getByTestId("photo-canvas")
    .evaluate(
      (c: HTMLCanvasElement, p) => [
        ...c.getContext("2d")!.getImageData(p.x, p.y, 1, 1).data,
      ],
      { x, y },
    );
}
async function solid(page: Page, color: string, width = 400, height = 300) {
  const url = await page.evaluate(
    ({ color, width, height }) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return c.toDataURL();
    },
    { color, width, height },
  );
  return {
    name: "color.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  };
}
async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply changes" }).click();
}
async function undo(page: Page) {
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
}
async function alphaStats(page: Page) {
  return page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let clear = 0,
      opaque = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] === 0) clear++;
      if (d[i] === 255) opaque++;
    }
    return { clear, opaque, total: c.width * c.height };
  });
}

test("text rotates around its selected position, stays editable and survives recovery", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByTestId("open-file")
    .setInputFiles(await solid(page, "#111111"));
  await expect.poll(() => signature(page)).toMatch(/^400x300:/);
  await tool(page, "Text");
  await page.getByRole("textbox", { name: "Your words" }).fill("ROTATE");
  const bounds = () =>
    page.getByTestId("photo-canvas").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let left = c.width,
        right = 0,
        top = c.height,
        bottom = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (d[(y * c.width + x) * 4] > 200) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      return { width: right - left, height: bottom - top };
    });
  await expect
    .poll(async () => {
      const b = await bounds();
      return b.width > b.height * 2;
    })
    .toBe(true);
  const horizontal = await signature(page);
  await page
    .getByRole("button", { name: "Rotate text right", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Text rotation", exact: true }),
  ).toHaveValue("90");
  await expect
    .poll(async () => {
      const b = await bounds();
      return b.height > b.width * 2;
    })
    .toBe(true);
  const vertical = await signature(page);
  await apply(page);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect.poll(() => signature(page)).toBe(vertical);
  await page
    .getByRole("button", { name: "Edits", exact: true })
    .first()
    .click();
  await page
    .locator(".stack-item")
    .getByRole("button", { name: /^Text/ })
    .click();
  await slider(page, "Text rotation", 0);
  await expect.poll(() => signature(page)).toBe(horizontal);
});

test("horizontal mirroring and vertical flipping move actual pixels and undo independently", async ({
  page,
}) => {
  await ready(page);
  const url = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 120;
    const ctx = c.getContext("2d")!;
    for (const [x, y, color] of [
      [0, 0, "#ff0000"],
      [100, 0, "#0000ff"],
      [0, 60, "#ffff00"],
      [100, 60, "#00ff00"],
    ] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 100, 60);
    }
    return c.toDataURL();
  });
  await page.getByTestId("open-file").setInputFiles({
    name: "quadrants.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  });
  await expect.poll(() => pixel(page, 5, 5)).toEqual([255, 0, 0, 255]);
  await tool(page, "Flip & mirror");
  await page
    .getByRole("button", { name: "Mirror horizontally", exact: true })
    .click();
  await expect.poll(() => pixel(page, 5, 5)).toEqual([0, 0, 255, 255]);
  await expect(
    page.getByRole("button", { name: "Mirror horizontally" }),
  ).toHaveAttribute("aria-pressed", "true");
  await apply(page);
  await page
    .getByRole("button", { name: "Flip vertically", exact: true })
    .click();
  await expect.poll(() => pixel(page, 5, 5)).toEqual([0, 255, 0, 255]);
  await apply(page);
  await undo(page);
  await expect.poll(() => pixel(page, 5, 5)).toEqual([0, 0, 255, 255]);
  await undo(page);
  await expect.poll(() => pixel(page, 5, 5)).toEqual([255, 0, 0, 255]);
});

test("collage grids and both stitch directions retain sources, order and recovery", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByTestId("open-file")
    .setInputFiles(await solid(page, "#ff0000", 600, 400));
  await expect.poll(() => signature(page)).toMatch(/^600x400:/);
  await tool(page, "Collage & stitch");
  await page
    .getByTestId("collage-files")
    .setInputFiles([
      await solid(page, "#0000ff", 200, 400),
      await solid(page, "#00ff00", 400, 400),
    ]);
  await expect.poll(() => signature(page)).toMatch(/^600x600:/);
  expect((await pixel(page, 150, 150))[0]).toBeGreaterThan(250);
  expect((await pixel(page, 450, 150))[2]).toBeGreaterThan(250);
  expect((await pixel(page, 150, 450))[1]).toBeGreaterThan(250);
  await slider(page, "Spacing", 0);
  await page.getByLabel("Layout", { exact: true }).selectOption("horizontal");
  await expect.poll(() => signature(page)).toMatch(/^600x200:/);
  await page
    .getByRole("button", { name: "Move photo 3 earlier", exact: true })
    .click();
  await expect
    .poll(async () => (await pixel(page, 350, 50))[1])
    .toBeGreaterThan(250);
  await page.getByLabel("Layout", { exact: true }).selectOption("vertical");
  await expect.poll(() => signature(page)).toMatch(/^164x600:/);
  const stitched = await signature(page);
  await apply(page);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect.poll(() => signature(page)).toBe(stitched);
  await page
    .getByRole("button", { name: "Edits", exact: true })
    .first()
    .click();
  await page
    .locator(".stack-item")
    .getByRole("button", { name: /^Collage & stitch/ })
    .click();
  await expect(page.getByLabel("Collage photos").locator("li")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Remove photo 2", exact: true })
    .click();
  await expect(page.getByLabel("Collage photos").locator("li")).toHaveCount(2);
  await expect.poll(() => signature(page)).not.toBe(stitched);
});

test("offline stickers and transparent image overlays compose as independent editable layers", async ({
  page,
  context,
}) => {
  await ready(page);
  await page
    .getByTestId("open-file")
    .setInputFiles(await solid(page, "#0000ff", 200, 200));
  await expect.poll(() => signature(page)).toMatch(/^200x200:/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  const base = await signature(page);
  await tool(page, "Stickers & overlay");
  await expect.poll(() => signature(page)).not.toBe(base);
  const url = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 100;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(40, 40, 20, 20);
    return c.toDataURL();
  });
  await page.getByTestId("overlay-file").setInputFiles({
    name: "transparent.png",
    mimeType: "image/png",
    buffer: Buffer.from(url.split(",")[1], "base64"),
  });
  await slider(page, "Size", 100);
  await expect.poll(() => pixel(page, 100, 100)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 10, 10)).toEqual([0, 0, 255, 255]);
  await apply(page);
  const first = await signature(page);
  await page.getByRole("button", { name: "Star", exact: true }).click();
  await slider(page, "Rotation", 45);
  await slider(page, "Horizontal", 20);
  await expect.poll(() => signature(page)).not.toBe(first);
  await apply(page);
  await undo(page);
  await expect.poll(() => signature(page)).toBe(first);
});

test("background removal runs offline, refines a real alpha cutout and exports transparency", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await ready(page);
  await page
    .getByTestId("open-file")
    .setInputFiles(path.resolve("tests/fixtures/astronaut.png"));
  await expect(page.locator("h1")).toHaveText("astronaut");
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
  await tool(page, "Remove background");
  await page
    .locator(".composition-controls")
    .getByRole("button", { name: "Remove background", exact: true })
    .click();
  await expect(page.locator(".analysis-note")).toContainText(
    "Background removed",
    { timeout: 60_000 },
  );
  await expect
    .poll(async () => (await alphaStats(page)).clear)
    .toBeGreaterThan(1000);
  expect((await alphaStats(page)).opaque).toBeGreaterThan(1000);
  await page
    .getByLabel("New background", { exact: true })
    .selectOption("color");
  await expect
    .poll(async () => (await alphaStats(page)).opaque)
    .toBe(512 * 512);
  await page
    .getByLabel("New background", { exact: true })
    .selectOption("image");
  await page
    .getByTestId("background-file")
    .setInputFiles(await solid(page, "#00ff00", 400, 300));
  await expect
    .poll(async () => (await pixel(page, 0, 0))[1])
    .toBeGreaterThan(240);
  await page
    .getByLabel("New background", { exact: true })
    .selectOption("transparent");
  await slider(page, "Edge softness", 35);
  await expect
    .poll(async () => (await alphaStats(page)).clear)
    .toBeGreaterThan(1000);
  await apply(page);
  await tool(page, "Flip & mirror");
  await page
    .getByRole("button", { name: "Mirror horizontally", exact: true })
    .click();
  await expect
    .poll(async () => (await alphaStats(page)).clear)
    .toBeGreaterThan(1000);
  await apply(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /^PNG/ }).click();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download photo", exact: true })
    .click();
  const downloaded = await readFile((await (await dl).path())!);
  const transparent = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] === 0) count++;
      image.close();
      return count;
    },
    [...downloaded],
  );
  expect(transparent).toBeGreaterThan(1000);
  await expect(page.locator(".save-status")).toContainText("All changes saved");
  await page.reload();
  await expect
    .poll(async () => (await alphaStats(page)).clear)
    .toBeGreaterThan(1000);
});

test("skin smoothing and whitening follow a detected face and leave surrounding pixels intact", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await ready(page);
  await page
    .getByTestId("open-file")
    .setInputFiles(path.resolve("tests/fixtures/astronaut.png"));
  await expect.poll(() => signature(page)).toMatch(/^512x512:/);
  const before = await signature(page),
    corner = await pixel(page, 0, 0);
  await tool(page, "Skin retouch");
  await slider(page, "Skin smoothing", 0);
  await expect.poll(() => signature(page)).toBe(before);
  await page
    .getByRole("button", { name: "Detect faces automatically", exact: true })
    .click();
  await expect(page.locator(".analysis-note")).toContainText(
    "Face detected on this device",
    { timeout: 60_000 },
  );
  await slider(page, "Skin whitening", 80);
  await expect.poll(() => signature(page)).not.toBe(before);
  expect(await pixel(page, 0, 0)).toEqual(corner);
  const whitening = await signature(page);
  await slider(page, "Skin smoothing", 100);
  await expect.poll(() => signature(page)).not.toBe(whitening);
  await apply(page);
  await undo(page);
  await expect.poll(() => signature(page)).toBe(before);
});

test("front/back and lens switching release streams and capture a consistently mirrored selfie", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const events: { calls: string[]; stopped: number } = {
      calls: [],
      stopped: 0,
    };
    Object.assign(window, { cameraEvents: events });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true,
      value: async () => [
        {
          deviceId: "rear",
          label: "Back camera",
          kind: "videoinput",
          groupId: "rear",
        },
        {
          deviceId: "front",
          label: "Front camera",
          kind: "videoinput",
          groupId: "front",
        },
      ],
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        const video = constraints.video as MediaTrackConstraints,
          id = (video.deviceId as ConstrainDOMStringParameters)?.exact,
          facing =
            id === "front"
              ? "user"
              : id === "rear"
                ? "environment"
                : (video.facingMode as ConstrainDOMStringParameters)?.exact ||
                  "environment";
        events.calls.push(String(id || facing));
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 320, 480);
        ctx.fillStyle = "#0000ff";
        ctx.fillRect(320, 0, 320, 480);
        const stream = c.captureStream(10),
          track = stream.getVideoTracks()[0],
          stop = track.stop.bind(track);
        Object.defineProperty(track, "getSettings", {
          value: () => ({
            width: 640,
            height: 480,
            facingMode: facing,
            deviceId: facing === "user" ? "front" : "rear",
          }),
        });
        track.stop = () => {
          events.stopped++;
          stop();
        };
        return stream;
      },
    });
  });
  try {
    await ready(page);
    await page
      .getByRole("button", { name: "Take a photo", exact: true })
      .click();
    await expect(page.locator(".camera-device-status")).toHaveText(
      "Back camera active",
    );
    await page
      .getByRole("button", { name: "Front camera", exact: true })
      .click();
    await expect(page.locator(".camera-device-status")).toHaveText(
      "Front camera active",
    );
    await expect(
      page.getByRole("checkbox", { name: "Mirror selfie" }),
    ).toBeChecked();
    await expect
      .poll(() =>
        page
          .getByLabel("Live camera with selected look")
          .evaluate((c: HTMLCanvasElement) =>
            c.width > 10
              ? c.getContext("2d")!.getImageData(10, 10, 1, 1).data[2]
              : 0,
          ),
      )
      .toBeGreaterThan(240);
    await page.getByLabel("Camera lens", { exact: true }).selectOption("rear");
    await expect(page.locator(".camera-device-status")).toHaveText(
      "Back camera active",
    );
    await page
      .getByRole("button", { name: "Switch camera", exact: true })
      .click();
    await expect(page.locator(".camera-device-status")).toHaveText(
      "Front camera active",
    );
    await page
      .getByRole("button", { name: "Capture photo", exact: true })
      .click();
    await expect(page.locator("h1")).toHaveText("Still camera");
    await expect
      .poll(async () => (await pixel(page, 10, 10))[2])
      .toBeGreaterThan(240);
    const events = await page.evaluate(
      () =>
        (
          window as unknown as {
            cameraEvents: { calls: string[]; stopped: number };
          }
        ).cameraEvents,
    );
    expect(events.calls).toEqual(["environment", "user", "rear", "user"]);
    expect(events.stopped).toBe(4);
  } finally {
    await context.close();
  }
});

test("single-camera devices fall back from unsupported facing constraints and close cleanly", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let stopped = 0;
    Object.assign(window, { stoppedTracks: () => stopped });
    Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
      configurable: true,
      value: async () => [],
    });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async (constraints: MediaStreamConstraints) => {
        if (
          (
            (constraints.video as MediaTrackConstraints)
              .facingMode as ConstrainDOMStringParameters
          ).exact
        )
          throw new DOMException(
            "No facing constraint",
            "OverconstrainedError",
          );
        const c = document.createElement("canvas");
        c.width = c.height = 200;
        c.getContext("2d")!.fillRect(0, 0, 200, 200);
        const stream = c.captureStream(10),
          track = stream.getVideoTracks()[0],
          stop = track.stop.bind(track);
        track.stop = () => {
          stopped++;
          stop();
        };
        return stream;
      },
    });
  });
  await ready(page);
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture photo", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".camera-device-status")).toContainText(
    "direction not reported",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { stoppedTracks: () => number }).stoppedTracks(),
    ),
  ).toBe(1);
});

test("new composition controls fit mobile screens while keeping the photo visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await tool(page, "Collage & stitch");
  await page
    .getByTestId("collage-files")
    .setInputFiles([
      await solid(page, "#e6aca4"),
      await solid(page, "#bad29f"),
    ]);
  await expect(page.getByLabel("Collage photos").locator("li")).toHaveCount(3);
  const canvas = await page.getByTestId("photo-canvas").boundingBox(),
    panel = await page.locator(".tool-panel").boundingBox();
  expect(canvas!.height).toBeGreaterThan(70);
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(panel!.y + 2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await tool(page, "Stickers & overlay");
  await page.getByRole("button", { name: "Flower", exact: true }).click();
  await slider(page, "Rotation", -45);
  await apply(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
