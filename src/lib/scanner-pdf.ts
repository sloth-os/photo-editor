import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  endMarkedContent,
  TextRenderingMode,
  rgb,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import type { ScanPaper, ScanText } from "./scanner-types";

export type PdfScanPage = {
  image: Uint8Array;
  format: "jpeg" | "png";
  width: number;
  height: number;
  ocr?: ScanText;
};
export function scanPdfSize(
  width: number,
  height: number,
  paper: ScanPaper,
): [number, number] {
  if (paper === "auto")
    return [
      Math.max(36, (width * 72) / 150),
      Math.max(36, (height * 72) / 150),
    ];
  const sizes = {
      a4: [595.2756, 841.8898],
      letter: [612, 792],
      legal: [612, 1008],
    } as const,
    size = sizes[paper];
  return width > height ? [size[1], size[0]] : [...size];
}

/** Embedded blank Type 3 glyphs + ToUnicode maps keep the OCR layer invisible and searchable in every script, without downloading a font. */
function ocrFonts(pdf: PDFDocument, text: ScanText) {
  const characters = [...new Set(text.words.flatMap((word) => [...word.text]))],
    result = new Map<string, { font: PDFRef; code: number }>(),
    context = pdf.context,
    emptyGlyph = context.register(context.flateStream("1000 0 d0\n"));
  for (let offset = 0; offset < characters.length; offset += 240) {
    const group = characters.slice(offset, offset + 240),
      procs: Record<string, PDFRef> = { ".notdef": emptyGlyph },
      encoding: (string | number)[] = [1],
      hex = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
    const mappings: string[] = [];
    group.forEach((character, i) => {
      procs[`g${i + 1}`] = emptyGlyph;
      encoding.push(`g${i + 1}`);
      const unicode = [...Array(character.length)]
        .map((_, n) => character.charCodeAt(n).toString(16).padStart(4, "0"))
        .join("")
        .toUpperCase();
      mappings.push(`<${hex(i + 1)}> <${unicode}>`);
    });
    const chunks: string[] = [];
    for (let i = 0; i < mappings.length; i += 100) {
      const part = mappings.slice(i, i + 100);
      chunks.push(`${part.length} beginbfchar\n${part.join("\n")}\nendbfchar`);
    }
    const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Still) /Ordering (OCR) /Supplement 0 >> def\n/CMapName /StillOCR${offset} def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${chunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`,
      font = context.register(
        context.obj({
          Type: "Font",
          Subtype: "Type3",
          Name: `StillOCR${offset}`,
          FontBBox: [0, 0, 1000, 1000],
          FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
          FirstChar: 1,
          LastChar: group.length,
          Widths: group.map(() => 1000),
          CharProcs: procs,
          Encoding: { Type: "Encoding", Differences: encoding },
          Resources: {},
          ToUnicode: context.register(context.flateStream(cmap)),
        }),
      );
    group.forEach((character, i) =>
      result.set(character, { font, code: i + 1 }),
    );
  }
  return result;
}

function addRecognizedText(
  pdf: PDFDocument,
  page: PDFPage,
  text: ScanText,
  image: { x: number; y: number; width: number; height: number },
) {
  const fonts = ocrFonts(pdf, text),
    resources = new Map<PDFRef, PDFName>(),
    scaleX = image.width / text.width,
    scaleY = image.height / text.height;
  for (const word of text.words) {
    const chars = [...word.text];
    if (
      !chars.length ||
      word.bbox.x1 <= word.bbox.x0 ||
      word.bbox.y1 <= word.bbox.y0
    )
      continue;
    const height = (word.bbox.y1 - word.bbox.y0) * scaleY,
      width = (word.bbox.x1 - word.bbox.x0) * scaleX,
      x = image.x + word.bbox.x0 * scaleX,
      y = image.y + image.height - word.bbox.y1 * scaleY;
    // ActualText also preserves logical Unicode order for complex/RTL scripts.
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        PDFName.of("Span"),
        pdf.context
          .obj({ ActualText: PDFHexString.fromText(word.text) })
          .toString(),
      ]),
    );
    let run = "",
      font: PDFRef | undefined,
      runStart = 0;
    const flush = () => {
      if (!font || !run) return;
      let name = resources.get(font);
      if (!name) {
        name = page.node.newFontDictionary("OCR", font);
        resources.set(font, name);
      }
      page.pushOperators(
        beginText(),
        setTextRenderingMode(TextRenderingMode.Invisible),
        setFontAndSize(name, height),
        setTextMatrix(
          width / chars.length / height,
          0,
          0,
          1,
          x + (runStart * width) / chars.length,
          y,
        ),
        showText(PDFHexString.of(run)),
        endText(),
      );
      run = "";
    };
    chars.forEach((character, i) => {
      const entry = fonts.get(character)!;
      if (font !== entry.font) {
        flush();
        font = entry.font;
        runStart = i;
      }
      run += entry.code.toString(16).padStart(2, "0");
    });
    flush();
    page.pushOperators(endMarkedContent());
  }
}

export async function createScanPdf(
  title: string,
  paper: ScanPaper,
  count: number,
  getPage: (index: number) => Promise<PdfScanPage>,
  progress: (index: number) => void = () => {},
  signal?: AbortSignal,
) {
  if (count < 1 || count > 20)
    throw new Error("Choose between one and twenty scanned pages.");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("Still document scanner");
  pdf.setProducer("Still / pdf-lib");
  for (let i = 0; i < count; i++) {
    signal?.throwIfAborted();
    progress(i);
    const source = await getPage(i);
    signal?.throwIfAborted();
    const embedded =
        source.format === "png"
          ? await pdf.embedPng(source.image)
          : await pdf.embedJpg(source.image),
      size = scanPdfSize(source.width, source.height, paper),
      page = pdf.addPage(size),
      scale = Math.min(size[0] / source.width, size[1] / source.height),
      image = {
        width: source.width * scale,
        height: source.height * scale,
        x: (size[0] - source.width * scale) / 2,
        y: (size[1] - source.height * scale) / 2,
      };
    page.drawRectangle({
      x: 0,
      y: 0,
      width: size[0],
      height: size[1],
      color: rgb(1, 1, 1),
    });
    page.drawImage(embedded, image);
    if (source.ocr?.text && source.ocr.words.length)
      addRecognizedText(pdf, page, source.ocr, image);
  }
  signal?.throwIfAborted();
  return pdf.save();
}
