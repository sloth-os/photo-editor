import type { Worker } from "tesseract.js";
export const ocrLanguages = [
  { id: "eng", name: "English", codes: "eng" },
  { id: "chi_sim", name: "简体中文 + English", codes: "chi_sim+eng" },
  { id: "chi_tra", name: "繁體中文 + English", codes: "chi_tra+eng" },
  { id: "jpn", name: "日本語 + English", codes: "jpn+eng" },
  { id: "kor", name: "한국어 + English", codes: "kor+eng" },
  { id: "spa", name: "Español", codes: "spa+eng" },
  { id: "fra", name: "Français", codes: "fra+eng" },
  { id: "deu", name: "Deutsch", codes: "deu+eng" },
  { id: "ara", name: "العربية + English", codes: "ara+eng" },
  { id: "hin", name: "हिन्दी + English", codes: "hin+eng" },
  { id: "mixed", name: "English + 中文 + 日本語", codes: "eng+chi_sim+jpn" },
];
export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
let queue = Promise.resolve(),
  cancelCurrent: (() => void) | undefined,
  generation = 0;
export const cancelOcr = () => {
  ++generation;
  cancelCurrent?.();
};
export async function recognizeText(
  image: HTMLCanvasElement,
  language: string,
  progress: (status: string, percent: number) => void,
) {
  cancelCurrent?.();
  const job = ++generation;
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  if (job !== generation) {
    release();
    throw new DOMException("Text recognition cancelled.", "AbortError");
  }
  let ready: Promise<Worker> | undefined,
    cancel!: () => void,
    cancelled = false;
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      cancelled = true;
      reject(new DOMException("Text recognition cancelled.", "AbortError"));
    };
  });
  void aborted.catch(() => {});
  cancelCurrent = cancel;
  try {
    const { createWorker, OEM, PSM } = await import("tesseract.js"),
      base = new URL(import.meta.env.BASE_URL, window.location.href).href,
      codes =
        ocrLanguages.find((entry) => entry.id === language)?.codes || "eng";
    if (cancelled || job !== generation)
      throw new DOMException("Text recognition cancelled.", "AbortError");
    ready = createWorker(codes, OEM.LSTM_ONLY, {
      workerPath: `${base}vendor/ocr/worker.min.js`,
      corePath: `${base}vendor/ocr/core/`,
      langPath: `${base}models/ocr/`,
      gzip: true,
      cacheMethod: "none",
      workerBlobURL: false,
      logger: (message) => {
        if (cancelCurrent === cancel)
          progress(message.status, Math.round(message.progress * 100));
      },
    });
    const worker = await Promise.race([ready, aborted]);
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const result = await Promise.race([
      worker.recognize(image, {}, { text: true, blocks: true }),
      aborted,
    ]);
    const words: OcrWord[] = (result.data.blocks || []).flatMap((block) =>
      (block.paragraphs || []).flatMap((paragraph) =>
        (paragraph.lines || []).flatMap((line) =>
          (line.words || []).map((word) => ({
            text: word.text,
            confidence: word.confidence,
            bbox: word.bbox,
          })),
        ),
      ),
    );
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
      words,
    };
  } finally {
    if (cancelCurrent === cancel) cancelCurrent = undefined;
    if (ready) {
      try {
        await (await ready).terminate();
      } catch {
        /* Initialization can fail or be cancelled. */
      }
    }
    release();
  }
}
