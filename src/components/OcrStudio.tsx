import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ScanText,
  Copy,
  Download,
  Type,
  Crop,
  LoaderCircle,
  X,
} from "lucide-react";
import { Modal } from "./ui";
import {
  cancelOcr,
  ocrLanguages,
  recognizeText,
  type OcrWord,
} from "../lib/ocr";
import { download } from "../lib/files";
type Region = { x: number; y: number; width: number; height: number };
export default function OcrStudio({
  getSource,
  onClose,
  onAddText,
}: {
  getSource: () => Promise<HTMLCanvasElement>;
  onClose: () => void;
  onAddText: (text: string) => void;
}) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null),
    [sourceUrl, setSourceUrl] = useState(""),
    [language, setLanguage] = useState("eng"),
    [region, setRegion] = useState<Region | null>(null),
    [selecting, setSelecting] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Preparing your image…"),
    [percent, setPercent] = useState(0),
    [text, setText] = useState(""),
    [confidence, setConfidence] = useState<number | null>(null),
    [error, setError] = useState(""),
    [resultUrl, setResultUrl] = useState(""),
    [resultSize, setResultSize] = useState({ width: 1, height: 1 }),
    [words, setWords] = useState<OcrWord[]>([]),
    [showWords, setShowWords] = useState(false),
    [copied, setCopied] = useState(false);
  const sourceGetter = useRef(getSource),
    token = useRef(0),
    start = useRef<{ x: number; y: number } | null>(null),
    output = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let alive = true;
    sourceGetter
      .current()
      .then((image) => {
        if (alive) {
          setSource(image);
          setSourceUrl(image.toDataURL("image/png"));
          setStatus("Ready to recognize text.");
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Could not prepare this image.",
          );
      });
    return () => {
      alive = false;
      ++token.current;
      cancelOcr();
    };
  }, []);
  function point(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  async function recognize() {
    if (!source) return;
    const current = ++token.current;
    setBusy(true);
    setError("");
    setCopied(false);
    setPercent(0);
    setStatus("Starting local recognition…");
    setSelecting(false);
    const crop = region || { x: 0, y: 0, width: 1, height: 1 },
      scan = document.createElement("canvas");
    scan.width = Math.max(1, Math.round(source.width * crop.width));
    scan.height = Math.max(1, Math.round(source.height * crop.height));
    const ctx = scan.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, scan.width, scan.height);
    ctx.drawImage(
      source,
      source.width * crop.x,
      source.height * crop.y,
      source.width * crop.width,
      source.height * crop.height,
      0,
      0,
      scan.width,
      scan.height,
    );
    try {
      const result = await recognizeText(scan, language, (message, value) => {
        if (current === token.current) {
          setStatus(message.replace(/\b\w/g, (c) => c.toUpperCase()));
          setPercent(value);
        }
      });
      if (current !== token.current) return;
      setText(result.text);
      setConfidence(result.confidence);
      setWords(result.words);
      setResultUrl(scan.toDataURL("image/png"));
      setResultSize({ width: scan.width, height: scan.height });
      setShowWords(false);
      setStatus(
        result.text
          ? "Recognition complete. Review the text before reuse."
          : "No text found. Try another language or a closer crop.",
      );
    } catch (e) {
      if (
        current === token.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (current === token.current) setBusy(false);
    }
  }
  async function copyText() {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
      else {
        output.current?.focus();
        output.current?.select();
        if (!document.execCommand("copy"))
          throw new Error("Select the text and use Copy.");
      }
      setCopied(true);
    } catch {
      setError("Select the recognized text and use your device's Copy action.");
    }
  }
  const preview = resultUrl || sourceUrl,
    ratio = resultUrl
      ? resultSize.width / resultSize.height
      : source
        ? source.width / source.height
        : 1.5;
  return (
    <Modal
      title="The words in your photo."
      eyebrow="ON-DEVICE OCR"
      onClose={onClose}
      className="ocr-modal"
    >
      <p className="ocr-intro">
        Recognize printed text without uploading your image. Language models are
        included for offline use.
      </p>
      <div
        className={`ocr-preview ${selecting ? "selecting" : ""}`}
        style={{ width: Math.min(520, 260 * ratio), maxWidth: "100%" }}
        onPointerDown={(e) => {
          if (!selecting || busy || !source) return;
          start.current = point(e);
          setRegion(null);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const p = point(e),
            a = start.current;
          setRegion({
            x: Math.min(p.x, a.x),
            y: Math.min(p.y, a.y),
            width: Math.abs(p.x - a.x),
            height: Math.abs(p.y - a.y),
          });
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt="Image for text recognition"
            draggable={false}
          />
        ) : (
          <div className="ocr-preparing">
            <LoaderCircle className="spin" /> Preparing image…
          </div>
        )}
        {!resultUrl && region && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label="OCR region selection"
          >
            <rect
              x={region.x * 100}
              y={region.y * 100}
              width={region.width * 100}
              height={region.height * 100}
            />
          </svg>
        )}
        {resultUrl && showWords && (
          <svg
            viewBox={`0 0 ${resultSize.width} ${resultSize.height}`}
            preserveAspectRatio="none"
            aria-label="Recognized word locations"
          >
            {words.map((word, i) => (
              <rect
                key={i}
                x={word.bbox.x0}
                y={word.bbox.y0}
                width={word.bbox.x1 - word.bbox.x0}
                height={word.bbox.y1 - word.bbox.y0}
              >
                <title>{word.text}</title>
              </rect>
            ))}
          </svg>
        )}
      </div>
      <div className="ocr-region-actions">
        <button
          className="secondary-button"
          disabled={busy || !source}
          aria-pressed={selecting}
          onClick={() => {
            setResultUrl("");
            setSelecting((v) => !v);
          }}
        >
          <Crop size={16} />
          {selecting ? "Finish region selection" : "Select region"}
        </button>
        {region && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setRegion(null);
              setResultUrl("");
            }}
          >
            Use whole image
          </button>
        )}
      </div>
      <label className="field-label" htmlFor="ocr-language">
        Recognition language
      </label>
      <select
        id="ocr-language"
        value={language}
        disabled={busy}
        onChange={(e) => setLanguage(e.target.value)}
      >
        {ocrLanguages.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <div className="ocr-run">
        <button
          className="primary-button"
          disabled={
            busy ||
            !source ||
            (region !== null && (region.width < 0.01 || region.height < 0.01))
          }
          onClick={() => void recognize()}
        >
          <ScanText size={17} /> Recognize text
        </button>
        {busy && (
          <button
            className="secondary-button"
            onClick={() => {
              ++token.current;
              cancelOcr();
              setBusy(false);
              setStatus("Recognition cancelled.");
            }}
          >
            <X size={16} /> Cancel recognition
          </button>
        )}
      </div>
      <div className="ocr-status" role="status">
        {busy && <LoaderCircle size={15} className="spin" />} {status}
        {busy
          ? ` · ${percent}%`
          : confidence !== null
            ? ` · ${Math.round(confidence)}% confidence`
            : ""}
      </div>
      {error && (
        <p className="ocr-error" role="alert">
          {error}
        </p>
      )}
      <label className="field-label" htmlFor="ocr-result">
        Recognized text
      </label>
      <textarea
        id="ocr-result"
        ref={output}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCopied(false);
        }}
        rows={7}
        dir="auto"
        placeholder="Recognized text will appear here. You can edit it before copying or saving."
      />
      {!!words.length && (
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showWords}
            onChange={(e) => setShowWords(e.target.checked)}
          />{" "}
          Show word locations
        </label>
      )}
      <div className="ocr-output-actions">
        <button
          className="secondary-button"
          disabled={!text}
          onClick={() => void copyText()}
        >
          <Copy size={16} /> {copied ? "Copied" : "Copy text"}
        </button>
        <button
          className="secondary-button"
          disabled={!text}
          onClick={() =>
            download(
              new Blob([text], { type: "text/plain;charset=utf-8" }),
              "still-recognized-text.txt",
            )
          }
        >
          <Download size={16} /> Save TXT
        </button>
        <button
          className="secondary-button"
          disabled={!text}
          onClick={() => onAddText(text)}
        >
          <Type size={16} /> Add text layer
        </button>
      </div>
      {text.length > 300 && (
        <p className="analysis-note">
          Text layers use the first 300 characters and eight lines. Copy and TXT
          keep the full result.
        </p>
      )}
    </Modal>
  );
}
