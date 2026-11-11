import { describe, it, expect } from "vitest";
import { inpaintPixels } from "../src/lib/inpaint";
import { minFilter, recoverHaze } from "../src/lib/dehaze";
import { exportSnapseed, importSnapseed } from "../src/lib/snapseed";
import { readMetadata, withMetadata } from "../src/lib/metadata";
import piexif from "piexifjs";
import { readFile } from "node:fs/promises";

describe("content-aware texture synthesis", () => {
  const width = 20,
    height = 16;
  function scene() {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        pixels[i] = 80 + x * 2;
        pixels[i + 1] = 110 + y;
        pixels[i + 2] = 140 + (x % 3) * 2;
        pixels[i + 3] = 255;
      }
    return pixels;
  }
  it("fills selected damage while preserving every known pixel", () => {
    const data = scene(),
      mask = new Uint8Array(width * height);
    for (let y = 6; y < 10; y++)
      for (let x = 8; x < 12; x++) {
        mask[y * width + x] = 1;
        data.set([255, 0, 255, 255], (y * width + x) * 4);
      }
    const output = inpaintPixels(data, mask, width, height);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i])
        expect([...output.subarray(i * 4, i * 4 + 4)]).toEqual([
          ...data.subarray(i * 4, i * 4 + 4),
        ]);
      else {
        expect(output[i * 4 + 1]).toBeGreaterThan(90);
        expect(output[i * 4]).toBeLessThan(160);
        expect(output[i * 4 + 3]).toBe(255);
      }
    }
  });
  it("extends a masked border without changing the source region", () => {
    const data = scene(),
      mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < 4; x++) {
        mask[y * width + x] = 1;
        data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 4);
      }
    const result = inpaintPixels(data, mask, width, height);
    expect(result[0]).toBeGreaterThan(50);
    expect(result[3]).toBe(255);
    for (let i = 0; i < mask.length; i++)
      if (!mask[i])
        expect(result.subarray(i * 4, i * 4 + 4)).toEqual(
          data.subarray(i * 4, i * 4 + 4),
        );
  });
  it("is deterministic and rejects a selection with no source context", () => {
    const data = scene(),
      mask = new Uint8Array(width * height);
    mask[100] = 1;
    expect(inpaintPixels(data, mask, width, height)).toEqual(
      inpaintPixels(data, mask, width, height),
    );
    expect(() =>
      inpaintPixels(data, new Uint8Array(mask.length).fill(1), width, height),
    ).toThrow(/entire photo/);
  });
});
describe("dark-channel recovery", () => {
  it("matches a brute-force minimum filter at edges and in the interior", () => {
    const width = 9,
      height = 7,
      input = Float32Array.from(
        { length: width * height },
        (_, i) => ((i * 17) % 41) / 41,
      ),
      actual = minFilter(input, width, height, 2);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let expected = Infinity;
        for (
          let yy = Math.max(0, y - 2);
          yy <= Math.min(height - 1, y + 2);
          yy++
        )
          for (
            let xx = Math.max(0, x - 2);
            xx <= Math.min(width - 1, x + 2);
            xx++
          )
            expected = Math.min(expected, input[yy * width + xx]);
        expect(actual[y * width + x]).toBe(expected);
      }
  });
  it("increases contrast in a hazy image and leaves neutral recovery unchanged", () => {
    const width = 24,
      height = 16,
      data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const light = 140 + (i % width) * 3;
      data.set([light, light + 5, light + 10, 255], i * 4);
    }
    expect(recoverHaze(data, width, height, 0)).toEqual(data);
    const result = recoverHaze(data, width, height, 70);
    expect(result[(width - 1) * 4] - result[0]).toBeGreaterThan(
      data[(width - 1) * 4] - data[0],
    );
  });
});
describe("native Snapseed QR interoperability", () => {
  it("round-trips verified Tune image and Curves protobuf operators", async () => {
    const recipe = {
      version: 1 as const,
      name: "Tone test",
      edits: [
        {
          id: "1",
          tool: "tune",
          params: {
            brightness: 33,
            contrast: 12,
            saturation: -20,
            ambiance: 8,
          },
        },
        {
          id: "2",
          tool: "curves",
          params: {
            channel: "rgb",
            curveRGB: JSON.stringify([
              [0, 0.05],
              [0.5, 0.65],
              [1, 1],
            ]),
          },
        },
      ],
    };
    const url = await exportSnapseed(recipe),
      restored = await importSnapseed(url);
    expect(restored.edits[0].params.brightness).toBe(33);
    expect(restored.edits[0].params.saturation).toBe(-20);
    expect(
      JSON.parse(String(restored.edits[1].params.curveRGB))[1][1],
    ).toBeCloseTo(0.65, 4);
    expect(restored.warnings).toEqual([]);
  });
  it("imports a public native QR sample and reports its unsupported operator", async () => {
    const value = await readFile("tests/fixtures/native-snapseed.txt", "utf8"),
      recipe = await importSnapseed(value.trim());
    expect(recipe.edits.map((e) => e.tool)).toEqual(["curves", "tune"]);
    expect(recipe.edits[1].params.contrast).toBe(39);
    expect(recipe.warnings?.length).toBe(1);
    expect(await exportSnapseed(recipe)).toBe(value.trim());
  });
  it("rejects unknown links and avoids pretending every tool is convertible", async () => {
    await expect(
      importSnapseed("https://example.com/qr?l=abc"),
    ).rejects.toThrow();
    await expect(
      importSnapseed("https://snapseed.com/qr?l=not-gzip"),
    ).rejects.toThrow();
    await expect(
      exportSnapseed({
        version: 1,
        name: "x",
        edits: [{ id: "1", tool: "healing", params: {} }],
      }),
    ).rejects.toThrow(/supports Tune image and Curves/);
  });
});
describe("metadata preservation", () => {
  const exif = piexif.dump({
    "0th": {
      [piexif.ImageIFD.Make]: "Still test",
      [piexif.ImageIFD.Orientation]: 6,
    },
    Exif: {
      [piexif.ExifIFD.PixelXDimension]: 64,
      [piexif.ExifIFD.PixelYDimension]: 48,
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [
        [37, 1],
        [0, 1],
        [0, 1],
      ],
    },
  });
  it("preserves EXIF and GPS while correcting dimensions and orientation", async () => {
    const blob = await withMetadata(
        new Blob([new Uint8Array([255, 216, 255, 217])], {
          type: "image/jpeg",
        }),
        { exif },
        320,
        200,
      ),
      metadata = await readMetadata(blob),
      tags = piexif.load(metadata!.exif!);
    expect(tags["0th"]![piexif.ImageIFD.Make]).toBe("Still test");
    expect(tags["0th"]![piexif.ImageIFD.Orientation]).toBe(1);
    expect(tags.Exif![piexif.ExifIFD.PixelXDimension]).toBe(320);
    expect(tags.GPS![piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
  });
  it("leaves exports unchanged when the source contains no EXIF", async () => {
    const blob = new Blob(["data"], { type: "image/png" });
    expect(await withMetadata(blob, undefined, 1, 1)).toBe(blob);
  });
});

describe("re-editing metadata-rich formats", () => {
  it("reads the eXIf chunk from an exported PNG", async () => {
    const original = new Blob(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        { type: "image/png" },
      ),
      exif = piexif.dump({ "0th": { [piexif.ImageIFD.Make]: "PNG camera" } }),
      exported = await withMetadata(original, { exif }, 1, 1);
    expect(
      piexif.load((await readMetadata(exported))!.exif!)["0th"]![
        piexif.ImageIFD.Make
      ],
    ).toBe("PNG camera");
  });
});

describe("edited native recipe safeguards", () => {
  it("does not silently replace edited values with the original private payload", async () => {
    const text = await readFile("tests/fixtures/native-snapseed.txt", "utf8"),
      recipe = await importSnapseed(text.trim());
    recipe.edits[1].params.brightness = 70;
    await expect(exportSnapseed(recipe)).rejects.toThrow(/was edited/);
  });
});

describe("long project recovery", () => {
  it("retains a local stack larger than the preset interchange limit", async () => {
    const { validateProjectEdits, validateRecipe } =
      await import("../src/lib/files");
    const edits = Array.from({ length: 201 }, (_, i) => ({
      id: String(i),
      tool: "tune",
      params: { brightness: i % 10 },
    }));
    expect(() =>
      validateRecipe({ version: 1, name: "interchange", edits }),
    ).toThrow();
    const recovered = validateProjectEdits(edits);
    expect(recovered).toHaveLength(201);
    expect(recovered[200].params.brightness).toBe(0);
    expect(new Set(recovered.map((e) => e.id)).size).toBe(201);
  });
});
