import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { createScanPdf, scanPdfSize } from "../src/lib/scanner-pdf";
import type { ScanText } from "../src/lib/scanner-types";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

describe("scanned document PDF", () => {
  it("chooses physical paper sizes, landscape orientation and native 150 dpi", () => {
    expect(scanPdfSize(800, 1200, "letter")).toEqual([612, 792]);
    expect(scanPdfSize(1200, 800, "legal")).toEqual([1008, 612]);
    expect(scanPdfSize(600, 900, "auto")).toEqual([288, 432]);
  });
  it("creates actual ordered image pages with selectable English, Chinese and Japanese Unicode text", async () => {
    const image = new Uint8Array(
        await readFile("tests/fixtures/ocr-english.png"),
      ),
      strings = ["HELLO WORLD", "中文扫描测试", "日本語の文字認識"],
      bytes = await createScanPdf("Offline scan", "a4", 3, async (i) => {
        const ocr: ScanText = {
          text: strings[i],
          confidence: 95,
          width: 1200,
          height: 320,
          language: "eng",
          signature: "test",
          words: [
            {
              text: strings[i],
              confidence: 95,
              bbox: { x0: 60, y0: 50, x1: 700, y1: 120 },
            },
          ],
        };
        return { image, format: "png", width: 1200, height: 320, ocr };
      });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(3);
    expect(document.getTitle()).toBe("Offline scan");
    expect(document.getPage(0).getWidth()).toBeCloseTo(841.8898);
    const loading = getDocument({
        data: bytes.slice(),
        useSystemFonts: false,
        disableFontFace: true,
      }),
      parsed = await loading.promise;
    for (const [i, text] of strings.entries()) {
      const content = await (await parsed.getPage(i + 1)).getTextContent();
      expect(
        content.items.map((item) => ("str" in item ? item.str : "")).join(""),
      ).toBe(text);
    }
    await loading.destroy();
  });
  it("does not create a partial download when export is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    let read = false;
    await expect(
      createScanPdf(
        "Cancelled",
        "letter",
        2,
        async () => {
          read = true;
          throw new Error("Should not render");
        },
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(read).toBe(false);
    await expect(
      createScanPdf("Empty", "a4", 0, async () => {
        throw new Error();
      }),
    ).rejects.toThrow(/one and twenty/);
  });
});
