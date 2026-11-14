import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const documentPhoto = path.resolve(
  "tests/fixtures/document-perspective.png",
);
export const englishPhoto = path.resolve("tests/fixtures/ocr-english.png");
export const chinesePhoto = path.resolve("tests/fixtures/ocr-chinese.png");
export const japanesePhoto = path.resolve("tests/fixtures/ocr-japanese.png");
export async function scanner(page: Page) {
  await page
    .getByRole("button", { name: "Scan documents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Document scanner.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Document name", { exact: true })).toBeEnabled();
}
export async function addScanFiles(page: Page, files: string | string[]) {
  await page.getByTestId("scan-files").setInputFiles(files);
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeEnabled();
  await expect(
    page.locator(".scan-filmstrip button[aria-pressed='true']"),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Document corner editor" }),
  ).toBeVisible();
}
export async function scanView(page: Page) {
  await page
    .getByRole("group", { name: "Scanner preview", exact: true })
    .getByRole("button", { name: "Scan", exact: true })
    .click();
  await expect(page.getByTestId("scan-preview")).toHaveAttribute(
    "data-ready",
    "true",
  );
}
export async function scanSignature(page: Page) {
  return page.getByTestId("scan-preview").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 16)
      sum = (Math.imul(sum, 31) + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    return `${c.width}x${c.height}:${sum}`;
  });
}
export async function scanDownload(page: Page, name: string) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file = await waiting;
  return { file, bytes: await readFile((await file.path())!) };
}
export async function fakeScanCamera(page: Page) {
  const image = (await readFile(documentPhoto)).toString("base64");
  await page.addInitScript(
    ({ image }) => {
      const stats = {
        requested: [] as MediaStreamConstraints[],
        stopped: 0,
        streams: 0,
        torch: [] as boolean[],
        frames: 0,
      };
      (window as unknown as { scanCameraStats: typeof stats }).scanCameraStats =
        stats;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async (constraints: MediaStreamConstraints) => {
          stats.requested.push(constraints);
          stats.streams++;
          const photo = new Image();
          photo.src = `data:image/png;base64,${image}`;
          await photo.decode();
          const c = document.createElement("canvas");
          c.width = photo.width;
          c.height = photo.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(photo, 0, 0);
          const timer = setInterval(() => {
              ctx.drawImage(photo, 0, 0);
              stats.frames++;
            }, 60),
            stream = c.captureStream(15),
            track = stream.getVideoTracks()[0],
            stop = track.stop.bind(track),
            v = constraints.video as MediaTrackConstraints,
            facing =
              typeof v.facingMode === "object"
                ? v.facingMode.exact || v.facingMode.ideal
                : "environment";
          track.getSettings = () => ({
            facingMode: String(facing),
            deviceId: String(facing) === "user" ? "front" : "back",
            width: c.width,
            height: c.height,
          });
          track.getCapabilities = () =>
            ({ torch: true }) as MediaTrackCapabilities;
          track.applyConstraints = async (constraints) => {
            const torch = (
              constraints?.advanced?.[0] as MediaTrackConstraintSet & {
                torch?: boolean;
              }
            )?.torch;
            if (torch !== undefined) stats.torch.push(torch);
          };
          track.stop = () => {
            stats.stopped++;
            clearInterval(timer);
            stop();
          };
          return stream;
        },
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        configurable: true,
        value: async () => [
          {
            deviceId: "back",
            kind: "videoinput",
            label: "Rear document camera",
            groupId: "camera",
          },
          {
            deviceId: "front",
            kind: "videoinput",
            label: "Front camera",
            groupId: "camera",
          },
        ],
      });
    },
    { image },
  );
}
