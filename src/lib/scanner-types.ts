import type { OcrWord } from "./ocr";
import { validScanQuad } from "./scanner";

export type ScanPoint = { x: number; y: number };
/** Clockwise, starting at the top left of the source photograph. */
export type ScanQuad = [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
export type ScanFilter = "original" | "color" | "gray" | "bw" | "whiteboard";
export type ScanAspect = "auto" | "a4" | "letter" | "card";
export type ScanPaper = "auto" | "a4" | "letter" | "legal";
export type ScanQuality = "compact" | "standard" | "high";
export type ScanSettings = {
  filter: ScanFilter;
  strength: number;
  threshold: number;
  turns: number;
  aspect: ScanAspect;
};
export type ScanText = {
  text: string;
  confidence: number;
  language: string;
  width: number;
  height: number;
  words: OcrWord[];
  signature: string;
};
export type ScanPage = {
  id: string;
  name: string;
  source: Blob;
  width: number;
  height: number;
  thumbnail: string;
  corners: ScanQuad;
  settings: ScanSettings;
  detected: boolean;
  ocr?: ScanText;
};
export type ScanDocument = {
  version: 1;
  title: string;
  pages: ScanPage[];
  selectedId: string;
  paper: ScanPaper;
  quality: ScanQuality;
  language: string;
  searchable: boolean;
};
export const MAX_SCAN_PAGES = 20;
export const fullPage = (): ScanQuad => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
export const defaultScanSettings = (): ScanSettings => ({
  filter: "color",
  strength: 85,
  threshold: 175,
  turns: 0,
  aspect: "auto",
});
export const emptyScanDocument = (): ScanDocument => ({
  version: 1,
  title: "Scanned document",
  pages: [],
  selectedId: "",
  paper: "a4",
  quality: "standard",
  language: "eng",
  searchable: false,
});
export function scanSignature(page: Pick<ScanPage, "corners" | "settings">) {
  return JSON.stringify([page.corners, page.settings]);
}

export function validateScanDocument(value: unknown): ScanDocument {
  const d = value as ScanDocument;
  if (
    !d ||
    d.version !== 1 ||
    typeof d.title !== "string" ||
    d.title.length > 120 ||
    !Array.isArray(d.pages) ||
    d.pages.length > MAX_SCAN_PAGES ||
    !["auto", "a4", "letter", "legal"].includes(d.paper) ||
    !["compact", "standard", "high"].includes(d.quality) ||
    typeof d.language !== "string" ||
    typeof d.searchable !== "boolean"
  )
    throw new Error("This saved scan is not supported.");
  const ids = new Set<string>();
  for (const page of d.pages) {
    const s = page?.settings;
    if (
      !page ||
      typeof page.id !== "string" ||
      page.id.length > 100 ||
      ids.has(page.id) ||
      typeof page.name !== "string" ||
      page.name.length > 120 ||
      !(page.source instanceof Blob) ||
      page.source.size > 32 * 1024 * 1024 ||
      !Number.isInteger(page.width) ||
      !Number.isInteger(page.height) ||
      page.width < 1 ||
      page.height < 1 ||
      Math.max(page.width, page.height) > 3200 ||
      page.width * page.height > 8010000 ||
      !validScanQuad(page.corners) ||
      typeof page.thumbnail !== "string" ||
      !/^data:image\/(jpeg|png);base64,[\da-z+/=]+$/i.test(page.thumbnail) ||
      page.thumbnail.length > 200000 ||
      !s ||
      !["original", "color", "gray", "bw", "whiteboard"].includes(s.filter) ||
      !["auto", "a4", "letter", "card"].includes(s.aspect) ||
      !Number.isFinite(s.strength) ||
      s.strength < 0 ||
      s.strength > 100 ||
      !Number.isFinite(s.threshold) ||
      s.threshold < 80 ||
      s.threshold > 230 ||
      !Number.isInteger(s.turns) ||
      s.turns < 0 ||
      s.turns > 3
    )
      throw new Error("A saved scan page is invalid.");
    ids.add(page.id);
    const ocr = page.ocr;
    if (
      ocr &&
      (typeof ocr.text !== "string" ||
        ocr.text.length > 100000 ||
        typeof ocr.language !== "string" ||
        ocr.signature !== scanSignature(page) ||
        !Number.isFinite(ocr.width) ||
        !Number.isFinite(ocr.height) ||
        ocr.width < 1 ||
        ocr.height < 1 ||
        ocr.width > 3200 ||
        ocr.height > 3200 ||
        !Number.isFinite(ocr.confidence) ||
        !Array.isArray(ocr.words) ||
        ocr.words.length > 20000 ||
        ocr.words.some(
          (word) =>
            typeof word.text !== "string" ||
            word.text.length > 1024 ||
            !word.bbox ||
            ![word.bbox.x0, word.bbox.x1, word.bbox.y0, word.bbox.y1].every(
              Number.isFinite,
            ) ||
            word.bbox.x0 < 0 ||
            word.bbox.y0 < 0 ||
            word.bbox.x1 > ocr.width ||
            word.bbox.y1 > ocr.height ||
            word.bbox.x1 < word.bbox.x0 ||
            word.bbox.y1 < word.bbox.y0,
        ))
    )
      throw new Error("The saved recognition result is invalid.");
  }
  return {
    ...d,
    selectedId: ids.has(d.selectedId) ? d.selectedId : d.pages[0]?.id || "",
  };
}
