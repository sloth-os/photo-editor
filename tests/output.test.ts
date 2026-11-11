import { expect, it } from "vitest";
import { exportFileName, resizedDimensions } from "../src/lib/output";
import { applyLook } from "../src/lib/look-renderer";
import { idPhotoDimensions } from "../src/lib/id-photo";
import { normalizeRotation } from "../src/lib/text";
import {
  withMetadata,
  withPrintDensity,
  readMetadata,
} from "../src/lib/metadata";
import { blurPixels } from "../src/lib/blur";
import piexif from "piexifjs";

it("converts names without duplicate extensions and sanitizes filesystem separators", () => {
  expect(exportFileName("holiday.jpg", "image/png")).toBe("holiday.png");
  expect(exportFileName("portrait.PNG", "image/jpeg")).toBe("portrait.jpg");
  expect(exportFileName("path/name", "image/webp")).toBe("path-name.webp");
});
it("reduces pixel dimensions with locked proportions and never enlarges", () => {
  expect(
    resizedDimensions({ width: 1800, height: 1200 }, "percent", "", "", 25),
  ).toEqual({ width: 450, height: 300 });
  expect(
    resizedDimensions(
      { width: 1800, height: 1200 },
      "custom",
      "600",
      "400",
      50,
    ),
  ).toEqual({ width: 600, height: 400 });
  expect(
    resizedDimensions({ width: 300, height: 200 }, "1080", "", "", 50),
  ).toEqual({ width: 300, height: 200 });
  expect(() =>
    resizedDimensions({ width: 300, height: 200 }, "custom", "", "1", 50),
  ).toThrow(/width and height/);
});
it("renders brightness and monochrome without native canvas filters, retaining alpha", () => {
  const pixels = new Uint8ClampedArray([100, 50, 25, 128]);
  expect([...applyLook(pixels, "brightness(2)")]).toEqual([200, 100, 50, 128]);
  const gray = applyLook(
    new Uint8ClampedArray([100, 50, 25, 255]),
    "grayscale(1)",
  );
  expect(gray[0]).toBe(gray[1]);
  expect(gray[1]).toBe(gray[2]);
  expect(gray[0]).toBe(59);
});
it("maps common physical ID sizes to exact 150/300/600 dpi pixel dimensions", () => {
  expect(idPhotoDimensions({ preset: "us-2x2", dpi: 300 })).toMatchObject({
    width: 600,
    height: 600,
  });
  expect(idPhotoDimensions({ preset: "35x45", dpi: 300 })).toMatchObject({
    width: 413,
    height: 531,
  });
  expect(idPhotoDimensions({ preset: "35x45", dpi: 600 })).toMatchObject({
    width: 827,
    height: 1063,
  });
  expect(idPhotoDimensions({ preset: "50x70", dpi: 300 })).toMatchObject({
    width: 591,
    height: 827,
  });
});
it("wraps finger rotation without jumps at the ±180 degree boundary", () => {
  expect(normalizeRotation(190)).toBe(-170);
  expect(normalizeRotation(-190)).toBe(170);
  expect(normalizeRotation(720)).toBe(0);
});
it("adds print resolution without copying camera data when metadata preservation is off", async () => {
  const source = new Blob([new Uint8Array([255, 216, 255, 217])], {
      type: "image/jpeg",
    }),
    exif = await withMetadata(source, undefined, 413, 531, 300),
    result = await withPrintDensity(exif, 300),
    bytes = Buffer.from(await result.arrayBuffer()),
    tags = piexif.load((await readMetadata(result))!.exif!);
  expect(tags["0th"]![piexif.ImageIFD.XResolution]).toEqual([300000, 1000]);
  expect(tags["0th"]![piexif.ImageIFD.ResolutionUnit]).toBe(2);
  expect(tags["0th"]![piexif.ImageIFD.Make]).toBeUndefined();
  const offset = bytes.indexOf(Buffer.from("JFIF\0"));
  expect(bytes[offset + 7]).toBe(1);
  expect(bytes.readUInt16BE(offset + 8)).toBe(300);
});
it("portable blur spreads detail while preserving a constant field", () => {
  const constant = new Uint8ClampedArray(9 * 9 * 4);
  for (let i = 0; i < constant.length; i += 4)
    constant.set([150, 90, 60, 255], i);
  const original = constant.slice();
  expect(blurPixels(constant, 9, 9, 2)).toEqual(original);
  const impulse = new Uint8ClampedArray(9 * 9 * 4);
  for (let i = 0; i < impulse.length; i += 4) impulse[i + 3] = 255;
  impulse[40 * 4] = 255;
  blurPixels(impulse, 9, 9, 1);
  expect(impulse[40 * 4]).toBeLessThan(255);
  expect(impulse[39 * 4]).toBeGreaterThan(0);
});
