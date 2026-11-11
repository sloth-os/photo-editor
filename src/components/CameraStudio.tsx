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
    [deviceId, setDeviceId] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [activeDevice, setActiveDevice] = useState(""),
    [actualFacing, setActualFacing] = useState<string>(""),
    [retry, setRetry] = useState(0),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [capturing, setCapturing] = useState(false),
    [choice, setChoice] = useState("original"),
    [mirror, setMirror] = useState(true);
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const viewFacing = actualFacing || facing;
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
    setActualFacing("");
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access is unavailable here. Open a photo or use Still over HTTPS.",
          );
        const resolution = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...resolution,
              ...(deviceId
                ? { deviceId: { exact: deviceId } }
                : { facingMode: { exact: facing } }),
            },
            audio: false,
          });
        } catch (e) {
          if (
            deviceId ||
            !(e instanceof DOMException) ||
            ![
              "OverconstrainedError",
              "NotFoundError",
              "ConstraintNotSatisfiedError",
            ].includes(e.name)
          )
            throw e;
          // Desktops and single-camera devices may not expose facing constraints.
          stream = await navigator.mediaDevices.getUserMedia({
            video: { ...resolution, facingMode: { ideal: facing } },
            audio: false,
          });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        if (cancelled) return;
        const track = stream.getVideoTracks()[0],
          settings = track.getSettings(),
          direction = ["user", "environment"].includes(
            settings.facingMode || "",
          )
            ? settings.facingMode!
            : /front|facetime|user/i.test(track.label)
              ? "user"
              : /back|rear|environment/i.test(track.label)
                ? "environment"
                : "";
        setActualFacing(direction);
        setActiveDevice(settings.deviceId || "");
        const available =
          (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ||
          [];
        if (cancelled) return;
        setDevices(available.filter((d) => d.kind === "videoinput"));
        setReady(true);
        const source = document.createElement("canvas");
        const tick = async (time: number) => {
          if (cancelled) return;
          if (time - last > 100 && v.videoWidth && preview.current) {
            last = time;
            source.width = 640;
            source.height = Math.round((640 * v.videoHeight) / v.videoWidth);
            const ctx = source.getContext("2d")!;
            ctx.save();
            if ((direction || facing) === "user" && mirrorRef.current) {
              ctx.translate(source.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(v, 0, 0, source.width, source.height);
            ctx.restore();
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
        stream?.getTracks().forEach((track) => track.stop());
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
  }, [facing, deviceId, retry]);
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
          ...(viewFacing === "user" && mirror
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
        <canvas ref={preview} aria-label="Live camera with selected look" />
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
            <button
              className="text-button"
              onClick={() => setRetry((v) => v + 1)}
            >
              Try camera again
            </button>
          </div>
        )}
      </div>
      <div
        className="camera-direction"
        role="group"
        aria-label="Camera direction"
      >
        {(
          [
            ["environment", "Back camera"],
            ["user", "Front camera"],
          ] as const
        ).map(([direction, label]) => (
          <button
            key={direction}
            disabled={capturing}
            aria-pressed={facing === direction && !deviceId}
            className={facing === direction && !deviceId ? "selected" : ""}
            onClick={() => {
              setDeviceId("");
              setFacing(direction);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {devices.length > 1 && (
        <div className="camera-device">
          <label className="field-label" htmlFor="camera-device">
            Camera lens
          </label>
          <select
            id="camera-device"
            value={deviceId || activeDevice}
            disabled={capturing}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">Automatic camera</option>
            {devices.map((device, i) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="camera-device-status" role="status">
        {ready
          ? actualFacing === "user"
            ? "Front camera active"
            : actualFacing === "environment"
              ? "Back camera active"
              : "Camera active · direction not reported by this device"
          : error
            ? "Camera unavailable"
            : "Starting camera…"}
      </p>
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
          disabled={capturing}
          onClick={() => {
            setDeviceId("");
            setFacing(viewFacing === "user" ? "environment" : "user");
          }}
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
        {viewFacing === "user" ? (
          <label className="mirror-control">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(e) => setMirror(e.target.checked)}
            />{" "}
            Mirror selfie
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
