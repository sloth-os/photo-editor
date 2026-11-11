import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, FolderOpen, LoaderCircle } from "lucide-react";
import { Modal } from "./ui";
import { looks, type Edit } from "../lib/catalog";
import type { Recipe } from "../lib/files";
import { renderImage, toBlob } from "../lib/engine";

export default function CameraStudio({
  recipes,
  onClose,
  onOpen,
  onCapture,
}: {
  recipes: Recipe[];
  onClose: () => void;
  onOpen: () => void;
  onCapture: (file: File, edits: Edit[]) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null),
    preview = useRef<HTMLCanvasElement>(null),
    [facing, setFacing] = useState<"environment" | "user">("environment"),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [capturing, setCapturing] = useState(false),
    [choice, setChoice] = useState("original"),
    [mirror, setMirror] = useState(true);
  const edits = useRef<Edit[]>([]),
    selected: Edit[] = choice.startsWith("saved-")
      ? recipes[Number(choice.slice(6))]?.edits || []
      : choice === "original"
        ? []
        : [{ id: "camera-look", tool: "look", params: { look: choice } }];
  edits.current = selected;
  useEffect(() => {
    let cancelled = false,
      stream: MediaStream | undefined,
      frame = 0,
      last = 0;
    setError("");
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access is unavailable here. Open a photo or use Still over HTTPS.",
          );
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        if (cancelled) return;
        setReady(true);
        const source = document.createElement("canvas");
        const tick = async (time: number) => {
          if (cancelled) return;
          if (time - last > 100 && v.videoWidth && preview.current) {
            last = time;
            source.width = 640;
            source.height = Math.round((640 * v.videoHeight) / v.videoWidth);
            source
              .getContext("2d")!
              .drawImage(v, 0, 0, source.width, source.height);
            try {
              const image = await renderImage(source, edits.current, 680);
              if (cancelled || !preview.current) return;
              preview.current.width = image.width;
              preview.current.height = image.height;
              preview.current.getContext("2d")!.drawImage(image, 0, 0);
            } catch {
              if (preview.current) {
                preview.current.width = source.width;
                preview.current.height = source.height;
                preview.current.getContext("2d")!.drawImage(source, 0, 0);
              }
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Camera access was blocked. Allow camera access in your browser, or open a photo."
              : e instanceof Error
                ? e.message
                : "Your camera could not start.",
          );
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);
  async function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    setCapturing(true);
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      const blob = await toBlob(c, "image/jpeg", 0.98),
        recipe: Edit[] = [
          ...(facing === "user" && mirror
            ? [
                {
                  id: crypto.randomUUID(),
                  tool: "rotate",
                  params: { angle: 0, turns: 0, flipX: 1, flipY: 0 },
                },
              ]
            : []),
          ...edits.current.map((edit) => ({
            ...edit,
            id: crypto.randomUUID(),
          })),
        ];
      await onCapture(
        new File([blob], "Still camera.jpg", { type: "image/jpeg" }),
        recipe,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Capture failed. Please try again.",
      );
    } finally {
      setCapturing(false);
    }
  }
  return (
    <Modal
      title="A moment, as you see it."
      eyebrow="STILL CAMERA"
      onClose={onClose}
      className="camera-modal"
    >
      <video ref={video} muted playsInline autoPlay className="camera-source" />
      <div className="camera-view">
        <canvas
          ref={preview}
          style={{
            transform: facing === "user" && mirror ? "scaleX(-1)" : undefined,
          }}
          aria-label="Live camera with selected look"
        />
        {!ready && !error && (
          <div className="camera-loading">
            <LoaderCircle className="spin" /> Opening your camera…
          </div>
        )}
        {error && (
          <div className="camera-loading">
            <Camera size={30} />
            <p>{error}</p>
            <button className="secondary-button" onClick={onOpen}>
              <FolderOpen size={16} /> Open photo
            </button>
          </div>
        )}
      </div>
      <div className="camera-looks">
        {looks.map((look) => (
          <button
            key={look.id}
            className={choice === look.id ? "selected" : ""}
            onClick={() => setChoice(look.id)}
          >
            {look.name}
          </button>
        ))}
        {recipes.map((r, i) => (
          <button
            key={`saved-${i}`}
            className={choice === `saved-${i}` ? "selected" : ""}
            onClick={() => setChoice(`saved-${i}`)}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div className="camera-actions">
        <button
          className="secondary-button"
          aria-label="Switch camera"
          onClick={() =>
            setFacing((v) => (v === "user" ? "environment" : "user"))
          }
        >
          <RefreshCw size={17} />
        </button>
        <button
          className="camera-shutter"
          aria-label="Capture photo"
          disabled={!ready || capturing}
          onClick={() => void capture()}
        >
          {capturing ? <LoaderCircle className="spin" /> : <Camera size={24} />}
        </button>
        {facing === "user" ? (
          <label className="mirror-control">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => setMirror(e.target.checked)}
            />{" "}
            Mirror
          </label>
        ) : (
          <span className="camera-caption">Original + editable look</span>
        )}
      </div>
      <p className="modal-footnote">
        Looks stay editable after capture. Camera and photos remain on this
        device.
      </p>
    </Modal>
  );
}
