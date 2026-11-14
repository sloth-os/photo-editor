import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Zap, X, LoaderCircle } from "lucide-react";
import { ScanProcessor } from "../lib/scanner-client";
import { canvas, fitDimensions, toBlob } from "../lib/engine";
import type { ScanQuad } from "../lib/scanner-types";

export default function ScannerCamera({
  onCapture,
  onDone,
  pageCount,
  available,
  onNativeCapture,
}: {
  onCapture: (file: File) => Promise<void>;
  onDone: () => void;
  pageCount: number;
  available: boolean;
  onNativeCapture: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stage = useRef<HTMLDivElement>(null),
    streamRef = useRef<MediaStream | null>(null),
    takeRef = useRef<() => Promise<void>>(async () => {}),
    autoRef = useRef(false),
    availableRef = useRef(available),
    capturingRef = useRef(false),
    captureEpoch = useRef(0),
    [facing, setFacing] = useState<"environment" | "user">("environment"),
    [device, setDevice] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(false),
    [ratio, setRatio] = useState(4 / 3),
    [stageSize, setStageSize] = useState({ width: 0, height: 0 }),
    [error, setError] = useState(""),
    [quad, setQuad] = useState<ScanQuad | null>(null),
    [capturing, setCapturing] = useState(false),
    [auto, setAuto] = useState(false),
    [steady, setSteady] = useState(0),
    [torchAvailable, setTorchAvailable] = useState(false),
    [torch, setTorch] = useState(false),
    [message, setMessage] = useState("Point the camera at a document.");
  autoRef.current = auto;
  availableRef.current = available;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false,
      stream: MediaStream | undefined,
      timer: ReturnType<typeof setInterval> | undefined,
      detecting = false,
      previous: ScanQuad | null = null,
      stable = 0,
      armed = true,
      lastCapture = captureEpoch.current;
    const processor = new ScanProcessor();
    setError("");
    setReady(false);
    setQuad(null);
    setTorch(false);
    setTorchAvailable(false);
    setSteady(0);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access needs HTTPS and a supported browser. You can import photos instead.",
          );
        const resolution = { width: { ideal: 2560 }, height: { ideal: 1920 } };
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...resolution,
              ...(device
                ? { deviceId: { exact: device } }
                : { facingMode: { exact: facing } }),
            },
            audio: false,
          });
        } catch (e) {
          if (
            device ||
            !(e instanceof DOMException) ||
            ![
              "OverconstrainedError",
              "NotFoundError",
              "ConstraintNotSatisfiedError",
            ].includes(e.name)
          )
            throw e;
          stream = await navigator.mediaDevices.getUserMedia({
            video: { ...resolution, facingMode: { ideal: facing } },
            audio: false,
          });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.current!.srcObject = stream;
        await video.current!.play();
        if (cancelled) return;
        setRatio(video.current!.videoWidth / video.current!.videoHeight);
        const track = stream.getVideoTracks()[0],
          capabilities = track.getCapabilities?.() as
            (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(!!capabilities?.torch);
        const all =
          (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ||
          [];
        if (cancelled) return;
        setDevices(all.filter((d) => d.kind === "videoinput"));
        setReady(true);
        timer = setInterval(async () => {
          if (
            cancelled ||
            detecting ||
            capturingRef.current ||
            !video.current?.videoWidth
          )
            return;
          detecting = true;
          try {
            const v = video.current,
              size = fitDimensions(v.videoWidth, v.videoHeight, 480),
              frame = canvas(size.width, size.height);
            frame.getContext("2d")!.drawImage(v, 0, 0, size.width, size.height);
            const found = await processor.detect(frame);
            if (cancelled) return;
            setQuad(found?.corners || null);
            if (captureEpoch.current !== lastCapture) {
              lastCapture = captureEpoch.current;
              armed = false;
              stable = 0;
            }
            if (!found) {
              armed = true;
              stable = 0;
              previous = null;
              setSteady(0);
              setMessage(
                "Place the page on a contrasting surface, or capture and adjust its corners.",
              );
              return;
            }
            const change = previous
              ? found.corners.reduce(
                  (s, p, i) =>
                    s + Math.hypot(p.x - previous![i].x, p.y - previous![i].y),
                  0,
                ) / 4
              : 1;
            if (change > 0.08) armed = true;
            stable =
              change < 0.018 && found.confidence > 0.76 && found.sharpness > 12
                ? stable + 1
                : 1;
            previous = found.corners;
            setSteady(Math.min(4, stable));
            setMessage(
              armed
                ? autoRef.current
                  ? "Edges found. Hold steady for automatic capture."
                  : "Edges found. Ready to capture."
                : "Page added. Move the page before the next automatic capture.",
            );
            if (
              autoRef.current &&
              availableRef.current &&
              armed &&
              stable >= 4
            ) {
              armed = false;
              stable = 0;
              setSteady(0);
              await takeRef.current();
            }
          } catch (e) {
            if (
              !cancelled &&
              !(e instanceof DOMException && e.name === "AbortError")
            )
              setMessage("Capture now and adjust the corners afterward.");
          } finally {
            detecting = false;
          }
        }, 600);
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (!cancelled)
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera access was blocked. Allow it in your browser, or use Add photos."
              : e instanceof Error
                ? e.message
                : "The camera could not start.",
          );
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      processor.dispose();
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, device, attempt]);
  async function capture() {
    if (
      !video.current?.videoWidth ||
      capturingRef.current ||
      !availableRef.current
    )
      return;
    capturingRef.current = true;
    ++captureEpoch.current;
    setCapturing(true);
    setError("");
    try {
      const v = video.current,
        size = fitDimensions(v.videoWidth, v.videoHeight, 3200),
        frame = canvas(size.width, size.height);
      frame.getContext("2d")!.drawImage(v, 0, 0, frame.width, frame.height);
      await onCapture(
        new File(
          [await toBlob(frame, "image/jpeg", 0.96)],
          `Camera page ${pageCount + 1}.jpg`,
          { type: "image/jpeg" },
        ),
      );
      setMessage("Page added. Capture the next page, or choose Done.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "Capture failed.");
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }
  takeRef.current = capture;
  async function switchTorch() {
    try {
      await streamRef.current?.getVideoTracks()[0].applyConstraints({
        advanced: [{ torch: !torch } as MediaTrackConstraintSet],
      });
      setTorch(!torch);
    } catch {
      setError("This camera could not change its light.");
    }
  }
  return (
    <div className="scan-camera">
      <div className="scan-camera-toolbar">
        <div
          className="choice-row"
          role="group"
          aria-label="Scanner camera direction"
        >
          {(
            [
              ["environment", "Back camera"],
              ["user", "Front camera"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={!device && facing === value}
              className={!device && facing === value ? "selected" : ""}
              disabled={capturing}
              onClick={() => {
                setDevice("");
                setFacing(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {devices.length > 1 && (
          <select
            aria-label="Scanner camera lens"
            value={device}
            disabled={capturing}
            onChange={(e) => setDevice(e.target.value)}
          >
            <option value="">Automatic lens</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        )}
        {torchAvailable && (
          <button
            className="secondary-button"
            aria-pressed={torch}
            onClick={() => void switchTorch()}
          >
            <Zap size={17} /> Camera light
          </button>
        )}
      </div>
      <div className="scan-camera-stage" ref={stage}>
        <div
          className="scan-camera-frame"
          style={{
            width: Math.min(stageSize.width, stageSize.height * ratio),
            height: Math.min(stageSize.height, stageSize.width / ratio),
          }}
        >
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Live document camera"
          />
          {quad && (
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-label="Live detected page edges"
            >
              <polygon
                points={quad
                  .map((p) => `${p.x * 1000},${p.y * 1000}`)
                  .join(" ")}
              />
            </svg>
          )}
          {!ready && !error && (
            <div className="scan-camera-opening">
              <LoaderCircle className="spin" /> Opening camera…
            </div>
          )}
        </div>
      </div>
      <p className="scan-camera-guidance" role="status">
        {capturing ? "Adding page…" : message}
        {auto && ready && quad && ` · ${steady}/4`}
      </p>
      {error && (
        <div className="scan-camera-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            <RefreshCw size={16} /> Retry camera
          </button>
          <button className="secondary-button" onClick={onDone}>
            Return to scanner
          </button>
          <button className="secondary-button" onClick={onNativeCapture}>
            Use device camera
          </button>
        </div>
      )}
      <div className="scan-camera-actions">
        <label className="inline-check">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />{" "}
          Auto capture when steady
        </label>
        <button
          className="scan-shutter"
          disabled={!ready || capturing || !available}
          aria-label="Capture document page"
          onClick={() => void capture()}
        >
          {capturing ? <LoaderCircle className="spin" /> : <Camera size={28} />}
        </button>
        <button
          className="secondary-button"
          onClick={onDone}
          disabled={capturing}
        >
          <X size={16} /> Done · {pageCount}{" "}
          {pageCount === 1 ? "page" : "pages"}
        </button>
      </div>
    </div>
  );
}
