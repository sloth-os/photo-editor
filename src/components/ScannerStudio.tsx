import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Plus,
  FileScan,
  ImagePlus,
  ScanLine,
  RotateCw,
  RotateCcw,
  Crop,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Copy,
  LoaderCircle,
  X,
  Check,
  RefreshCw,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Undo2,
} from "lucide-react";
import { Modal } from "./ui";
import ScannerCorners from "./ScannerCorners";
import ScannerCamera from "./ScannerCamera";
import { ACCEPT, download } from "../lib/files";
import { canvas, fitDimensions, toBlob } from "../lib/engine";
import {
  ScanProcessor,
  importScanPage,
  scanSource,
  scanThumbnail,
} from "../lib/scanner-client";
import { loadScanDocument, saveScanDocument } from "../lib/storage";
import { cancelOcr, ocrLanguages, recognizeText } from "../lib/ocr";
import {
  MAX_SCAN_PAGES,
  defaultScanSettings,
  emptyScanDocument,
  fullPage,
  scanSignature,
  validateScanDocument,
  type ScanDocument,
  type ScanPage,
  type ScanSettings,
  type ScanText,
} from "../lib/scanner-types";

const filterNames = [
  ["original", "Original"],
  ["color", "Clean color"],
  ["gray", "Grayscale"],
  ["bw", "Black & white"],
  ["whiteboard", "Whiteboard"],
] as const;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fileStem = (title: string) =>
  title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.(pdf|jpe?g|png|zip|txt)$/i, "")
    .trim()
    .slice(0, 100) || "Scanned document";
type View = "corners" | "scan" | "text";
type Panel = "page" | "text" | "export";

export default function ScannerStudio({
  onClose,
  getSource,
  onEditPage,
}: {
  onClose: () => void;
  getSource?: () => Promise<HTMLCanvasElement>;
  onEditPage: (file: File) => Promise<void>;
}) {
  const [document, setDocument] = useState<ScanDocument>(emptyScanDocument),
    [loaded, setLoaded] = useState(false),
    [sourceState, setSourceState] = useState<{
      id: string;
      canvas: HTMLCanvasElement;
    } | null>(null),
    [preview, setPreview] = useState<HTMLCanvasElement | null>(null),
    [rendering, setRendering] = useState(false),
    [view, setView] = useState<View>("corners"),
    [panel, setPanel] = useState<Panel>("page"),
    [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saveState, setSaveState] = useState("ready"),
    [format, setFormat] = useState<"pdf" | "jpeg" | "png">("pdf"),
    [scope, setScope] = useState<"all" | "page">("all"),
    [confirmNew, setConfirmNew] = useState(false),
    [deleted, setDeleted] = useState<{ page: ScanPage; index: number } | null>(
      null,
    ),
    [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [replaced, setReplaced] = useState<ScanPage | null>(null);
  const alive = useRef(true),
    latest = useRef(document),
    touched = useRef(false),
    initialized = useRef(false),
    saveToken = useRef(0),
    worker = useRef<ScanProcessor | null>(null),
    job = useRef(0),
    busyRef = useRef(false),
    abort = useRef<AbortController | null>(null),
    files = useRef<HTMLInputElement>(null),
    nativeCamera = useRef<HTMLInputElement>(null),
    output = useRef<HTMLCanvasElement>(null),
    textOutput = useRef<HTMLTextAreaElement>(null),
    getSourceRef = useRef(getSource);
  getSourceRef.current = getSource;
  latest.current = document;
  if (!worker.current) worker.current = new ScanProcessor();
  const selected = document.pages.find((p) => p.id === document.selectedId),
    index = document.pages.findIndex((p) => p.id === document.selectedId),
    source =
      selected && sourceState?.id === selected.id ? sourceState.canvas : null,
    signature = selected ? scanSignature(selected) : "";
  function change(update: (previous: ScanDocument) => ScanDocument) {
    touched.current = true;
    setDocument((previous) => {
      const next = update(previous);
      latest.current = next;
      return next;
    });
  }
  function pageChange(patch: Partial<ScanPage>) {
    if (!selected) return;
    const id = selected.id;
    change((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch };
        if (scanSignature(next) !== scanSignature(p)) next.ocr = undefined;
        return next;
      }),
    }));
    setCopied(false);
  }
  function setting<K extends keyof ScanSettings>(
    key: K,
    value: ScanSettings[K],
  ) {
    if (selected)
      pageChange({ settings: { ...selected.settings, [key]: value } });
  }
  useEffect(() => {
    let current = true;
    alive.current = true;
    loadScanDocument()
      .then((saved) => {
        if (!current) return;
        if (saved) {
          const restored = validateScanDocument(saved);
          latest.current = restored;
          setDocument(restored);
          setSaveState("saved");
        }
      })
      .catch((e) => {
        if (current)
          setError(
            `Could not restore the last scan. ${errorText(e)} You can start a new document.`,
          );
      })
      .finally(() => {
        if (current) {
          initialized.current = true;
          setLoaded(true);
        }
      });
    return () => {
      current = false;
      alive.current = false;
      ++job.current;
      abort.current?.abort();
      cancelOcr();
      worker.current?.dispose();
      if (initialized.current && touched.current)
        void saveScanDocument(latest.current).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!loaded || !touched.current) return;
    const token = ++saveToken.current;
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveScanDocument(document)
        .then(() => {
          if (alive.current && saveToken.current === token)
            setSaveState("saved");
        })
        .catch(() => {
          if (alive.current && saveToken.current === token)
            setSaveState("error");
        });
    }, 550);
    return () => clearTimeout(timer);
  }, [document, loaded]);
  useEffect(() => {
    let current = true;
    setSourceState(null);
    setPreview(null);
    if (selected)
      scanSource(selected.source)
        .then((image) => {
          if (current) setSourceState({ id: selected.id, canvas: image });
        })
        .catch((e) => {
          if (current) setError(errorText(e));
        });
    return () => {
      current = false;
    };
  }, [selected?.id, selected?.source]);
  useEffect(() => {
    if (!source || !selected || camera || busy) return;
    let current = true;
    setRendering(true);
    const page = selected,
      timer = setTimeout(async () => {
        try {
          const result = await worker.current!.render(
            source,
            page.corners,
            page.settings,
            1400,
          );
          if (!current) return;
          setPreview(result);
          const thumbnail = scanThumbnail(result);
          if (thumbnail !== page.thumbnail)
            change((d) => ({
              ...d,
              pages: d.pages.map((p) =>
                p.id === page.id && scanSignature(p) === signature
                  ? { ...p, thumbnail }
                  : p,
              ),
            }));
        } catch (e) {
          if (
            current &&
            !(e instanceof DOMException && e.name === "AbortError")
          )
            setError(errorText(e));
        } finally {
          if (current) setRendering(false);
        }
      }, 85);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [source, signature, camera, busy]);
  useEffect(() => {
    if (!preview || !output.current) return;
    output.current.width = preview.width;
    output.current.height = preview.height;
    output.current.getContext("2d")!.drawImage(preview, 0, 0);
  }, [preview, view, camera, selected?.id]);

  async function perform(
    task: (
      signal: AbortSignal,
      report: (message: string) => void,
    ) => Promise<void>,
  ) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setProgress("Preparing…");
    const token = ++job.current,
      controller = new AbortController();
    abort.current = controller;
    try {
      await task(controller.signal, (message) => {
        if (alive.current && token === job.current) setProgress(message);
      });
      return !controller.signal.aborted;
    } catch (e) {
      if (alive.current && token === job.current) {
        if (e instanceof DOMException && e.name === "AbortError")
          setNotice("Cancelled. Pages already added are kept.");
        else setError(errorText(e));
      }
      return false;
    } finally {
      if (token === job.current) {
        busyRef.current = false;
        if (alive.current) {
          setBusy(false);
          setProgress("");
        }
      }
    }
  }
  function cancel() {
    abort.current?.abort();
    cancelOcr();
    worker.current?.dispose();
  }
  async function addFiles(incoming: File[]) {
    return perform(async (signal, report) => {
      const remaining = MAX_SCAN_PAGES - latest.current.pages.length,
        chosen = incoming.slice(0, remaining);
      if (!chosen.length)
        throw new Error(
          `A document holds up to ${MAX_SCAN_PAGES} pages. Export it or start a new document.`,
        );
      const failures: string[] = [];
      for (let i = 0; i < chosen.length; i++) {
        signal.throwIfAborted();
        report(`Finding page edges · ${i + 1} of ${chosen.length}`);
        try {
          const page = await importScanPage(chosen[i], worker.current!);
          signal.throwIfAborted();
          change((d) => ({
            ...d,
            pages: [...d.pages, page],
            selectedId: page.id,
          }));
        } catch (e) {
          if (signal.aborted) throw e;
          failures.push(`${chosen[i].name}: ${errorText(e)}`);
        }
      }
      if (failures.length) setError(failures.join("\n"));
      if (incoming.length > chosen.length)
        setNotice(
          `Added the first ${chosen.length} photos. The document limit is ${MAX_SCAN_PAGES} pages.`,
        );
      setView("corners");
      setPanel("page");
      setDeleted(null);
      if (failures.length === chosen.length)
        throw new Error(failures.join("\n"));
    });
  }
  async function usePhoto() {
    await perform(async (signal, report) => {
      if (!getSourceRef.current) return;
      if (latest.current.pages.length >= MAX_SCAN_PAGES)
        throw new Error(`A document holds up to ${MAX_SCAN_PAGES} pages.`);
      report("Preparing the visible photo…");
      const image = await getSourceRef.current();
      signal.throwIfAborted();
      const file = new File(
          [await toBlob(image, "image/jpeg", 0.96)],
          "Edited photo.jpg",
          { type: "image/jpeg" },
        ),
        page = await importScanPage(file, worker.current!);
      signal.throwIfAborted();
      change((d) => ({ ...d, pages: [...d.pages, page], selectedId: page.id }));
      setView("corners");
      setPanel("page");
    });
  }
  function selectPage(id: string) {
    change((d) => ({ ...d, selectedId: id }));
    setCopied(false);
  }
  async function replaceWithPhoto() {
    if (!selected || !getSourceRef.current) return;
    const previous = selected;
    await perform(async (signal, report) => {
      report("Bringing the visible photo back into this page…");
      const visible = await getSourceRef.current!();
      signal.throwIfAborted();
      const image = await scanSource(await toBlob(visible, "image/png"));
      signal.throwIfAborted();
      const source = await toBlob(image, "image/jpeg", 0.96);
      signal.throwIfAborted();
      const next: ScanPage = {
        ...previous,
        source,
        width: image.width,
        height: image.height,
        thumbnail: scanThumbnail(image),
        corners: fullPage(),
        settings: { ...defaultScanSettings(), filter: "original" },
        detected: false,
        ocr: undefined,
      };
      change((d) => ({
        ...d,
        pages: d.pages.map((p) => (p.id === previous.id ? next : p)),
      }));
      setReplaced(previous);
      setView("scan");
      setPanel("page");
      setNotice("Page replaced with the visible photo, including its edits.");
    });
  }
  function movePage(offset: number) {
    if (
      !selected ||
      index + offset < 0 ||
      index + offset >= document.pages.length
    )
      return;
    change((d) => {
      const pages = [...d.pages],
        i = pages.findIndex((p) => p.id === selected.id);
      [pages[i], pages[i + offset]] = [pages[i + offset], pages[i]];
      return { ...d, pages };
    });
  }
  function removePage() {
    if (!selected) return;
    setDeleted({ page: selected, index });
    change((d) => {
      const pages = d.pages.filter((p) => p.id !== selected.id);
      return {
        ...d,
        pages,
        selectedId: pages[Math.min(index, pages.length - 1)]?.id || "",
      };
    });
  }
  async function detectEdges() {
    if (!source || !selected) return;
    await perform(async (signal, report) => {
      report("Finding document edges…");
      const result = await worker.current!.detect(source);
      signal.throwIfAborted();
      if (result) {
        pageChange({ corners: result.corners, detected: true });
        setNotice("Page edges found. Review the four corners.");
      } else
        setNotice(
          "No clear page boundary found. Drag the corners, or use the full image.",
        );
      setView("corners");
    });
  }
  async function renderPage(page: ScanPage, max = 3200) {
    const original = await scanSource(page.source);
    return worker.current!.render(original, page.corners, page.settings, max);
  }
  async function recognizePage(
    page: ScanPage,
    image: HTMLCanvasElement,
    signal: AbortSignal,
    report: (message: string) => void,
    prefix: string,
  ): Promise<ScanText> {
    signal.throwIfAborted();
    const result = await recognizeText(
      image,
      document.language,
      (status, percent) => report(`${prefix} · ${status} · ${percent}%`),
    );
    signal.throwIfAborted();
    const ocr: ScanText = {
      ...result,
      text: result.text.slice(0, 100000),
      words: result.words.slice(0, 20000).map((word) => ({
        ...word,
        bbox: {
          x0: Math.max(0, Math.min(image.width, word.bbox.x0)),
          y0: Math.max(0, Math.min(image.height, word.bbox.y0)),
          x1: Math.max(0, Math.min(image.width, word.bbox.x1)),
          y1: Math.max(0, Math.min(image.height, word.bbox.y1)),
        },
      })),
      width: image.width,
      height: image.height,
      language: document.language,
      signature: scanSignature(page),
    };
    change((d) => ({
      ...d,
      pages: d.pages.map((p) =>
        p.id === page.id && scanSignature(p) === ocr.signature
          ? { ...p, ocr }
          : p,
      ),
    }));
    return ocr;
  }
  async function recognize(all: boolean) {
    const pages = all ? document.pages : selected ? [selected] : [];
    await perform(async (signal, report) => {
      for (const [i, page] of pages.entries()) {
        signal.throwIfAborted();
        report(`Preparing OCR · page ${i + 1} of ${pages.length}`);
        const image = await renderPage(page);
        signal.throwIfAborted();
        await recognizePage(
          page,
          image,
          signal,
          report,
          `Page ${i + 1} of ${pages.length}`,
        );
      }
      setView("text");
      setPanel("text");
      setCopied(false);
      setNotice("Recognition complete. Review the text before reuse.");
    });
  }
  async function copyText() {
    if (!selected?.ocr) return;
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(selected.ocr.text);
      else {
        textOutput.current?.focus();
        textOutput.current?.select();
        if (!window.document.execCommand("copy")) throw new Error();
      }
      setCopied(true);
    } catch {
      setError("Select the text and use your device's Copy action.");
    }
  }
  function saveText() {
    const text = document.pages
      .map((p, i) => (p.ocr ? `Page ${i + 1} · ${p.name}\n${p.ocr.text}` : ""))
      .filter(Boolean)
      .join("\n\n");
    download(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      `${fileStem(document.title)}.txt`,
    );
  }
  async function exportDocument() {
    const pages =
      scope === "page" ? (selected ? [selected] : []) : document.pages;
    await perform(async (signal, report) => {
      if (!pages.length) return;
      const quality = {
        compact: { max: 1400, jpeg: 0.74 },
        standard: { max: 2200, jpeg: 0.9 },
        high: { max: 3200, jpeg: 0.96 },
      }[document.quality];
      async function prepare(page: ScanPage, i: number) {
        signal.throwIfAborted();
        report(`Processing page ${i + 1} of ${pages.length}`);
        let image = await renderPage(page),
          ocr = page.ocr;
        signal.throwIfAborted();
        if (
          format === "pdf" &&
          document.searchable &&
          (!ocr || ocr.signature !== scanSignature(page))
        )
          ocr = await recognizePage(
            page,
            image,
            signal,
            report,
            `Recognizing page ${i + 1} of ${pages.length}`,
          );
        if (Math.max(image.width, image.height) > quality.max) {
          const size = fitDimensions(image.width, image.height, quality.max),
            resized = canvas(size.width, size.height);
          resized
            .getContext("2d")!
            .drawImage(image, 0, 0, resized.width, resized.height);
          image = resized;
        }
        const mime = format === "png" ? "image/png" : "image/jpeg",
          blob = await toBlob(image, mime, quality.jpeg);
        signal.throwIfAborted();
        return {
          blob,
          image: new Uint8Array(await blob.arrayBuffer()),
          format: format === "png" ? ("png" as const) : ("jpeg" as const),
          width: image.width,
          height: image.height,
          ocr: document.searchable ? ocr : undefined,
        };
      }
      const stem = fileStem(document.title);
      if (format === "pdf") {
        const { createScanPdf } = await import("../lib/scanner-pdf"),
          bytes = await createScanPdf(
            document.title,
            document.paper,
            pages.length,
            (i) => prepare(pages[i], i),
            () => {},
            signal,
          );
        signal.throwIfAborted();
        download(new Blob([bytes], { type: "application/pdf" }), `${stem}.pdf`);
      } else if (pages.length === 1) {
        const result = await prepare(pages[0], 0);
        signal.throwIfAborted();
        download(result.blob, `${stem}.${format === "jpeg" ? "jpg" : "png"}`);
      } else {
        const { default: JSZip } = await import("jszip"),
          zip = new JSZip();
        for (const [i, page] of pages.entries()) {
          const result = await prepare(page, i);
          zip.file(
            `${stem}-${String(i + 1).padStart(2, "0")}.${format === "jpeg" ? "jpg" : "png"}`,
            result.blob,
          );
        }
        report("Packing scanned pages…");
        const blob = await zip.generateAsync({ type: "blob" });
        signal.throwIfAborted();
        download(blob, `${stem}.zip`);
      }
      setNotice("Download started. Your editable scan is kept on this device.");
    });
  }
  async function openEditor() {
    if (!selected) return;
    const page = selected;
    await perform(async (signal, report) => {
      report("Preparing the scanned page for editing…");
      const image = await renderPage(page);
      signal.throwIfAborted();
      const file = new File(
        [await toBlob(image, "image/png")],
        `${fileStem(page.name)}.png`,
        { type: "image/png" },
      );
      signal.throwIfAborted();
      await saveScanDocument(latest.current);
      signal.throwIfAborted();
      await onEditPage(file);
    });
  }
  function showPanel(next: Panel) {
    setPanel(next);
    setView(next === "text" ? "text" : "scan");
  }
  const totalOutput = scope === "page" && selected ? 1 : document.pages.length,
    exportLabel =
      format === "pdf"
        ? "Download PDF"
        : totalOutput > 1
          ? `Download ${format === "jpeg" ? "JPG" : "PNG"} ZIP`
          : `Download ${format === "jpeg" ? "JPG" : "PNG"}`;
  return (
    <Modal
      title="Document scanner."
      eyebrow="STILL · ON-DEVICE SCANNING"
      onClose={
        camera
          ? () => setCamera(false)
          : expanded
            ? () => setExpanded(false)
            : onClose
      }
      className={`scanner-modal ${expanded ? "scan-expanded" : ""} ${selected && view === "corners" && !camera ? "scan-cropping" : ""}`}
    >
      <div
        className="scan-shell"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!busy && loaded) void addFiles([...e.dataTransfer.files]);
        }}
      >
        <input
          ref={files}
          hidden
          className="sr-only"
          type="file"
          multiple
          accept={ACCEPT}
          aria-label="Add document photos"
          data-testid="scan-files"
          onChange={(e) => {
            const chosen = [...(e.target.files || [])];
            e.target.value = "";
            if (chosen.length) void addFiles(chosen);
          }}
        />
        <input
          ref={nativeCamera}
          hidden
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Capture document with device camera"
          onChange={(e) => {
            const chosen = [...(e.target.files || [])];
            e.target.value = "";
            if (chosen.length) void addFiles(chosen);
          }}
        />
        {!camera && (
          <div className="scan-topbar">
            <div className="scan-title-field">
              <label htmlFor="scan-title">Document name</label>
              <input
                id="scan-title"
                value={document.title}
                maxLength={120}
                disabled={busy || !loaded}
                onChange={(e) =>
                  change((d) => ({ ...d, title: e.target.value }))
                }
              />
              <span className={`scan-save-state ${saveState}`} role="status">
                {saveState === "saved"
                  ? "Saved on this device"
                  : saveState === "saving"
                    ? "Saving…"
                    : saveState === "error"
                      ? "Storage unavailable · download to keep your scan"
                      : "Private, offline-ready scanning"}
              </span>
            </div>
            <div className="scan-add-actions">
              <button
                className="secondary-button"
                disabled={
                  busy || !loaded || document.pages.length >= MAX_SCAN_PAGES
                }
                onClick={() => files.current?.click()}
              >
                <ImagePlus size={17} /> Add photos
              </button>
              <button
                className="secondary-button"
                disabled={
                  busy || !loaded || document.pages.length >= MAX_SCAN_PAGES
                }
                onClick={() => setCamera(true)}
              >
                <Camera size={17} /> Camera
              </button>
              {getSource && (
                <button
                  className="secondary-button scan-use-photo"
                  disabled={
                    busy || !loaded || document.pages.length >= MAX_SCAN_PAGES
                  }
                  onClick={() => void usePhoto()}
                >
                  <ImageIcon size={16} /> Use current photo
                </button>
              )}
            </div>
          </div>
        )}
        {!loaded ? (
          <div className="scan-empty">
            <LoaderCircle className="spin" /> Opening your scan…
          </div>
        ) : camera ? (
          <ScannerCamera
            pageCount={document.pages.length}
            available={!busy && document.pages.length < MAX_SCAN_PAGES}
            onDone={() => setCamera(false)}
            onNativeCapture={() => nativeCamera.current?.click()}
            onCapture={async (file) => {
              if (!(await addFiles([file])))
                throw new Error(
                  "The page could not be added. Try capturing again.",
                );
            }}
          />
        ) : !selected ? (
          <div className="scan-empty">
            <div className="scan-empty-icon">
              <FileScan size={54} strokeWidth={1.3} />
            </div>
            <h3>Paper, ready for anywhere.</h3>
            <p>
              Capture a document, receipt, card, or whiteboard. We’ll find the
              edges, straighten the page, and clear up the background.
            </p>
            <div className="scan-empty-actions">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => setCamera(true)}
              >
                <Camera size={18} /> Scan with camera
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => files.current?.click()}
              >
                <Plus size={18} /> Import photos
              </button>
            </div>
            <span>
              Up to {MAX_SCAN_PAGES} pages · PDF, JPG, PNG, and text · Works
              offline
            </span>
          </div>
        ) : (
          <>
            <div
              className={`scan-body ${view === "corners" ? "corner-view" : ""}`}
            >
              <div className="scan-main">
                <div className="scan-preview-bar">
                  <span>
                    PAGE {index + 1}{" "}
                    <span className="scan-muted">
                      OF {document.pages.length}
                    </span>
                  </span>
                  <div role="group" aria-label="Scanner preview">
                    <button
                      aria-pressed={view === "corners"}
                      onClick={() => {
                        setView("corners");
                        setPanel("page");
                      }}
                    >
                      <Crop size={15} /> Corners
                    </button>
                    <button
                      aria-pressed={view === "scan"}
                      onClick={() => setView("scan")}
                    >
                      <FileScan size={15} /> Scan
                    </button>
                    <button
                      aria-pressed={view === "text"}
                      onClick={() => showPanel("text")}
                    >
                      <FileText size={15} /> Text
                    </button>
                    <button
                      className="scan-expand-preview"
                      aria-label={
                        expanded
                          ? "Return to scanner controls"
                          : "Expand scanner preview"
                      }
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? (
                        <Minimize2 size={16} />
                      ) : (
                        <Maximize2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
                <div
                  className={`scan-stage ${view === "text" ? "text-view" : ""}`}
                >
                  {view === "text" ? (
                    <div className="scan-text-view">
                      <label htmlFor="scan-recognized-text">
                        Recognized page text
                      </label>
                      <textarea
                        id="scan-recognized-text"
                        ref={textOutput}
                        readOnly
                        dir="auto"
                        value={selected.ocr?.text || ""}
                        placeholder="Choose a language and recognize this page. The text can be copied, saved as TXT, or included in a searchable PDF."
                      />
                      <div className="scan-text-actions">
                        <button
                          className="secondary-button"
                          disabled={!selected.ocr?.text || busy}
                          onClick={() => void copyText()}
                        >
                          <Copy size={16} />{" "}
                          {copied ? "Copied" : "Copy page text"}
                        </button>
                        <button
                          className="secondary-button"
                          disabled={
                            !document.pages.some((p) => p.ocr?.text) || busy
                          }
                          onClick={saveText}
                        >
                          <Download size={16} /> Save document TXT
                        </button>
                      </div>
                    </div>
                  ) : source ? (
                    view === "corners" ? (
                      <ScannerCorners
                        source={source}
                        corners={selected.corners}
                        onChange={(corners) => {
                          if (!busy) pageChange({ corners });
                        }}
                      />
                    ) : (
                      <canvas
                        ref={output}
                        data-testid="scan-preview"
                        data-ready={!!preview && !rendering}
                        aria-label="Corrected document preview"
                      />
                    )
                  ) : (
                    <LoaderCircle className="spin" />
                  )}
                  {rendering && view !== "text" && (
                    <span className="scan-rendering">
                      <LoaderCircle size={14} className="spin" /> Updating scan…
                    </span>
                  )}
                </div>
                <div className="scan-page-bar">
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Move page earlier"
                      disabled={busy || index === 0}
                      onClick={() => movePage(-1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Move page later"
                      disabled={busy || index === document.pages.length - 1}
                      onClick={() => movePage(1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="icon-button scan-delete"
                      aria-label="Delete scanned page"
                      disabled={busy}
                      onClick={removePage}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <span>
                    {selected.detected
                      ? "Edges found · drag corners to refine"
                      : "Drag corners to frame the page"}
                  </span>
                  {view === "corners" && (
                    <div className="scan-mobile-crop-actions">
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void detectEdges()}
                      >
                        <ScanLine size={15} /> Find edges
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          pageChange({ corners: fullPage(), detected: false })
                        }
                      >
                        Full image
                      </button>
                    </div>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void openEditor()}
                  >
                    Edit a copy
                  </button>
                </div>
              </div>
              <aside className="scan-inspector" aria-label="Scanner controls">
                <div
                  className="scan-panel-tabs"
                  role="tablist"
                  aria-label="Scanner settings"
                >
                  {(
                    [
                      ["page", "Adjust"],
                      ["text", "OCR"],
                      ["export", "Export"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={panel === value}
                      aria-controls="scan-settings-panel"
                      onClick={() => showPanel(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  id="scan-settings-panel"
                  role="tabpanel"
                  className={`scan-panel-content panel-${panel}`}
                >
                  {panel === "page" && (
                    <>
                      <div
                        className="scan-filters"
                        role="group"
                        aria-label="Document filter"
                      >
                        {filterNames.map(([value, name]) => (
                          <button
                            key={value}
                            disabled={busy}
                            aria-pressed={selected.settings.filter === value}
                            onClick={() => setting("filter", value)}
                          >
                            <span
                              className={`scan-filter-sample sample-${value}`}
                              aria-hidden="true"
                            >
                              Aa
                            </span>
                            {name}
                          </button>
                        ))}
                      </div>
                      <div className="scan-adjust-actions">
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void detectEdges()}
                        >
                          <ScanLine size={15} /> Find edges
                        </button>
                        <button
                          className="secondary-button"
                          disabled={busy}
                          aria-label="Rotate scanned page left"
                          onClick={() =>
                            setting("turns", (selected.settings.turns + 3) % 4)
                          }
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button
                          className="secondary-button"
                          disabled={busy}
                          aria-label="Rotate scanned page right"
                          onClick={() =>
                            setting("turns", (selected.settings.turns + 1) % 4)
                          }
                        >
                          <RotateCw size={16} />
                        </button>
                      </div>
                      <details className="scan-more-settings">
                        <summary>
                          <SlidersHorizontal size={14} /> More scan settings
                        </summary>
                        <label className="field-label" htmlFor="scan-aspect">
                          Page proportions
                        </label>
                        <select
                          id="scan-aspect"
                          value={selected.settings.aspect}
                          disabled={busy}
                          onChange={(e) =>
                            setting(
                              "aspect",
                              e.target.value as ScanSettings["aspect"],
                            )
                          }
                        >
                          <option value="auto">Follow the crop</option>
                          <option value="a4">A4 · 210 × 297 mm</option>
                          <option value="letter">
                            US Letter · 8.5 × 11 in
                          </option>
                          <option value="card">
                            ID card · 85.6 × 53.98 mm
                          </option>
                        </select>
                        {selected.settings.filter !== "original" && (
                          <label className="scan-range">
                            Cleanup strength{" "}
                            <output>{selected.settings.strength}</output>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              aria-label="Document cleanup strength"
                              value={selected.settings.strength}
                              disabled={busy}
                              onChange={(e) =>
                                setting("strength", Number(e.target.value))
                              }
                            />
                          </label>
                        )}
                        {selected.settings.filter === "bw" && (
                          <label className="scan-range">
                            Ink threshold{" "}
                            <output>{selected.settings.threshold}</output>
                            <input
                              type="range"
                              min="80"
                              max="230"
                              aria-label="Document ink threshold"
                              value={selected.settings.threshold}
                              disabled={busy}
                              onChange={(e) =>
                                setting("threshold", Number(e.target.value))
                              }
                            />
                          </label>
                        )}
                        <div className="scan-reset-actions">
                          {getSource && (
                            <button
                              className="secondary-button full"
                              disabled={busy}
                              onClick={() => void replaceWithPhoto()}
                            >
                              <ImageIcon size={15} /> Replace page with current
                              photo
                            </button>
                          )}
                          <button
                            className="secondary-button"
                            disabled={busy}
                            onClick={() =>
                              pageChange({
                                corners: fullPage(),
                                detected: false,
                              })
                            }
                          >
                            <Crop size={15} /> Use full image
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              pageChange({
                                corners: fullPage(),
                                settings: defaultScanSettings(),
                                detected: false,
                              })
                            }
                          >
                            Reset page
                          </button>
                        </div>
                      </details>
                    </>
                  )}
                  {panel === "text" && (
                    <>
                      <label
                        className="field-label"
                        htmlFor="scan-ocr-language"
                      >
                        Scan text language
                      </label>
                      <select
                        id="scan-ocr-language"
                        value={document.language}
                        disabled={busy}
                        onChange={(e) =>
                          change((d) => ({ ...d, language: e.target.value }))
                        }
                      >
                        {ocrLanguages.map((l) => (
                          <option value={l.id} key={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <div className="scan-ocr-actions">
                        <button
                          className="primary-button"
                          disabled={busy}
                          onClick={() => void recognize(false)}
                        >
                          <FileText size={16} /> Recognize page
                        </button>
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void recognize(true)}
                        >
                          Recognize all pages
                        </button>
                      </div>
                      <p className="scan-note">
                        {selected.ocr
                          ? selected.ocr.text
                            ? `${Math.round(selected.ocr.confidence)}% confidence · Review the recognized text.`
                            : "No text found. Try a closer crop, another language, or the Original filter."
                          : "Printed text recognition stays on your device. English, Chinese, Japanese, and more work offline."}
                      </p>
                    </>
                  )}
                  {panel === "export" && (
                    <>
                      <div className="scan-export-grid">
                        <div>
                          <label className="field-label" htmlFor="scan-format">
                            File format
                          </label>
                          <select
                            id="scan-format"
                            value={format}
                            disabled={busy}
                            onChange={(e) =>
                              setFormat(e.target.value as typeof format)
                            }
                          >
                            <option value="pdf">PDF document</option>
                            <option value="jpeg">JPG pages</option>
                            <option value="png">PNG pages</option>
                          </select>
                        </div>
                        <div>
                          <label
                            className="field-label"
                            htmlFor="scan-export-scope"
                          >
                            Export pages
                          </label>
                          <select
                            id="scan-export-scope"
                            value={scope}
                            disabled={busy}
                            onChange={(e) =>
                              setScope(e.target.value as typeof scope)
                            }
                          >
                            <option value="all">
                              All {document.pages.length} pages
                            </option>
                            <option value="page">Current page only</option>
                          </select>
                        </div>
                        {format === "pdf" && (
                          <div>
                            <label className="field-label" htmlFor="scan-paper">
                              PDF paper size
                            </label>
                            <select
                              id="scan-paper"
                              value={document.paper}
                              disabled={busy}
                              onChange={(e) =>
                                change((d) => ({
                                  ...d,
                                  paper: e.target
                                    .value as ScanDocument["paper"],
                                }))
                              }
                            >
                              <option value="a4">A4</option>
                              <option value="letter">US Letter</option>
                              <option value="legal">US Legal</option>
                              <option value="auto">
                                Match each scan · 150 dpi
                              </option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="field-label" htmlFor="scan-quality">
                            Output quality
                          </label>
                          <select
                            id="scan-quality"
                            value={document.quality}
                            disabled={busy}
                            onChange={(e) =>
                              change((d) => ({
                                ...d,
                                quality: e.target
                                  .value as ScanDocument["quality"],
                              }))
                            }
                          >
                            <option value="compact">
                              Compact · up to 1400 px
                            </option>
                            <option value="standard">
                              Standard · up to 2200 px
                            </option>
                            <option value="high">High · up to 3200 px</option>
                          </select>
                        </div>
                      </div>
                      {format === "pdf" && (
                        <>
                          <label className="inline-check">
                            <input
                              type="checkbox"
                              checked={document.searchable}
                              disabled={busy}
                              onChange={(e) =>
                                change((d) => ({
                                  ...d,
                                  searchable: e.target.checked,
                                }))
                              }
                            />{" "}
                            Searchable PDF with OCR
                          </label>
                          {document.searchable && (
                            <>
                              <label
                                className="field-label"
                                htmlFor="scan-pdf-language"
                              >
                                Language for unrecognized pages
                              </label>
                              <select
                                id="scan-pdf-language"
                                value={document.language}
                                disabled={busy}
                                onChange={(e) =>
                                  change((d) => ({
                                    ...d,
                                    language: e.target.value,
                                  }))
                                }
                              >
                                {ocrLanguages.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          <p className="scan-note">
                            {document.searchable
                              ? "Pages without recognized text are scanned during export. You can search and select the text in a PDF reader."
                              : "One PDF with your pages in their current order. Choose searchable PDF to include recognized text."}
                          </p>
                        </>
                      )}
                      {format !== "pdf" && (
                        <p className="scan-note">
                          {totalOutput > 1
                            ? "Pages are numbered in order and saved together in a ZIP."
                            : "Save a corrected image of the selected page."}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>
            <div
              className="scan-filmstrip"
              role="group"
              aria-label="Scanned pages"
            >
              {document.pages.map((page, i) => (
                <button
                  key={page.id}
                  aria-label={`Select scan page ${i + 1}: ${page.name}`}
                  aria-pressed={page.id === selected.id}
                  disabled={busy}
                  onClick={() => selectPage(page.id)}
                >
                  <img src={page.thumbnail} alt="" />
                  <span>{i + 1}</span>
                  {page.ocr && <FileText size={12} className="scan-has-text" />}
                </button>
              ))}
              <button
                className="scan-add-page"
                aria-label="Add more document photos"
                disabled={busy || document.pages.length >= MAX_SCAN_PAGES}
                onClick={() => files.current?.click()}
              >
                <Plus size={22} />
                <span>Add</span>
              </button>
              <button
                className="scan-add-page"
                aria-label="Capture another document page"
                disabled={busy || document.pages.length >= MAX_SCAN_PAGES}
                onClick={() => setCamera(true)}
              >
                <Camera size={21} />
                <span>Camera</span>
              </button>
            </div>
          </>
        )}
        {(error || notice || deleted || replaced || confirmNew) && !camera && (
          <div className="scan-messages">
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            {replaced && document.pages.some((p) => p.id === replaced.id) && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const previous = replaced;
                  change((d) => ({
                    ...d,
                    pages: d.pages.map((p) =>
                      p.id === previous.id ? previous : p,
                    ),
                    selectedId: previous.id,
                  }));
                  setReplaced(null);
                  setNotice("Previous page restored.");
                }}
              >
                <Undo2 size={14} /> Undo page replacement
              </button>
            )}
            {deleted && document.pages.length < MAX_SCAN_PAGES && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const restore = deleted;
                  change((d) => {
                    const pages = [...d.pages];
                    pages.splice(
                      Math.min(restore.index, pages.length),
                      0,
                      restore.page,
                    );
                    return { ...d, pages, selectedId: restore.page.id };
                  });
                  setDeleted(null);
                }}
              >
                <Undo2 size={14} /> Undo page deletion
              </button>
            )}
            {confirmNew && (
              <div className="scan-confirm-new">
                <span>Replace this saved scan with a new document?</span>
                <button
                  className="secondary-button"
                  onClick={() => {
                    change(() => emptyScanDocument());
                    setConfirmNew(false);
                    setDeleted(null);
                    setReplaced(null);
                    setNotice("");
                    setError("");
                    setView("corners");
                    setPanel("page");
                  }}
                >
                  Start new document
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmNew(false)}
                >
                  Keep this document
                </button>
              </div>
            )}
          </div>
        )}
        {!camera && (
          <footer className="scan-footer">
            <button
              className="text-button scan-new-document"
              disabled={!loaded || busy || !document.pages.length}
              onClick={() => setConfirmNew(true)}
            >
              <RefreshCw size={15} /> New document
            </button>
            <div
              className={`scan-operation ${saveState === "error" ? "storage-error" : ""}`}
              role="status"
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={15} />
                  {progress}
                </>
              ) : (
                <>
                  {saveState === "saving" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  {saveState === "error"
                    ? "Download to keep this scan"
                    : `${document.pages.length} / ${MAX_SCAN_PAGES} pages · ${saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : "on this device"}`}
                </>
              )}
            </div>
            {busy ? (
              <button className="secondary-button" onClick={cancel}>
                <X size={16} /> Cancel operation
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={!loaded || !document.pages.length}
                onClick={() => void exportDocument()}
              >
                <Download size={17} /> {exportLabel}
              </button>
            )}
          </footer>
        )}
      </div>
    </Modal>
  );
}
