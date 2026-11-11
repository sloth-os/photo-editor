import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Aperture,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crop,
  Download,
  FolderOpen,
  Grid2X2,
  Image as ImageIcon,
  Layers2,
  Leaf,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Redo2,
  Upload,
  WifiOff,
  X,
  Camera,
  Smartphone,
  Trash2,
  Save,
  ScanLine,
  Copy,
  FileImage,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  tools,
  looks,
  defaults,
  matchesTool,
  type Edit,
  type Tool,
  type Params,
  type StrokePoint,
} from "./lib/catalog";
import {
  canvas,
  renderImage,
  histogram,
  toBlob,
  fitDimensions,
  resizeOutput,
} from "./lib/engine";
import {
  ACCEPT,
  readPhoto,
  download,
  fileSize,
  fileToDataUrl,
  validateRecipe,
  validateProjectEdits,
  importLookFile,
  pngToCube,
  blobDataUrl,
  type Photo,
  type Recipe,
} from "./lib/files";
import {
  loadProject,
  saveProject,
  loadRecipes,
  saveRecipes,
} from "./lib/storage";
import { parseCube } from "./lib/color";
import {
  Histogram,
  IconButton,
  Modal,
  ResetButton,
  Slider,
} from "./components/ui";
import ToolControls from "./components/ToolControls";
import { analyze, cancelAnalysis } from "./lib/intelligence";
import { prepareBatchEdits } from "./lib/batch";
import { faceRegion } from "./lib/face-mesh";
import CameraStudio from "./components/CameraStudio";
import { withMetadata } from "./lib/metadata";
import CommunityStudio from "./components/CommunityStudio";
import { exportXmp } from "./lib/presets";
import { exportSnapseed } from "./lib/snapseed";

type Snapshot = { edits: Edit[]; label: string };
type Dialog =
  | "tools"
  | "export"
  | "help"
  | "reset"
  | "looks"
  | "save-look"
  | "batch"
  | "incoming"
  | "camera"
  | "community"
  | null;
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type LaunchFile = { getFile: () => Promise<File> };
declare global {
  interface Window {
    launchQueue?: {
      setConsumer: (
        consumer: (params: { files: LaunchFile[] }) => void,
      ) => void;
    };
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (blob: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }
}
const freshEdit = (tool: string): Edit => ({
  id: crypto.randomUUID(),
  tool,
  params: defaults(tool),
});
const initialBins = Array.from({ length: 64 }, (_, i) =>
  Math.max(
    0.02,
    Math.exp(-(((i - 22) / 12) ** 2)) * 0.7 +
      Math.exp(-(((i - 39) / 9) ** 2)) * 0.45,
  ),
);
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

export default function App() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([
    { edits: [], label: "Original photo" },
  ]);
  const [cursor, setCursor] = useState(0),
    [active, setActive] = useState<Edit | null>(() => freshEdit("tune"));
  const [dirty, setDirty] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null),
    [rail, setRail] = useState("edit"),
    [search, setSearch] = useState("");
  const [toast, setToast] = useState(""),
    [busy, setBusy] = useState(""),
    [rendering, setRendering] = useState(false);
  const [initialized, setInitialized] = useState(false),
    [saveState, setSaveState] = useState<"saving" | "saved" | "error">(
      "saving",
    );
  const [online, setOnline] = useState(navigator.onLine),
    [installed, setInstalled] = useState(
      window.matchMedia("(display-mode: standalone)").matches,
    );
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
      null,
    ),
    [showOriginal, setShowOriginal] = useState(false);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [stageSize, setStageSize] = useState({ width: 800, height: 500 });
  const [outputSize, setOutputSize] = useState({ width: 1800, height: 1200 }),
    [bins, setBins] = useState(initialBins);
  const [thumb, setThumb] = useState(
      `${import.meta.env.BASE_URL}images/alpine-lake.jpg`,
    ),
    [dragOver, setDragOver] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [recipeName, setRecipeName] = useState("My everyday look");
  const [format, setFormat] = useState("image/jpeg"),
    [quality, setQuality] = useState(95),
    [exportSize, setExportSize] = useState("original");
  const [preserveMetadata, setPreserveMetadata] = useState(false);
  const [exportName, setExportName] = useState("alpine-escape-still"),
    [batchProgress, setBatchProgress] = useState("");
  const [incoming, setIncoming] = useState<File[]>([]),
    [qrUrl, setQrUrl] = useState("");
  const [showMask, setShowMask] = useState(false);
  const [lookLink, setLookLink] = useState("");
  const analysisToken = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null),
    stageRef = useRef<HTMLDivElement>(null),
    photoRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null),
    recipeRef = useRef<HTMLInputElement>(null),
    batchRef = useRef<HTMLInputElement>(null);
  const loadToken = useRef(0),
    renderToken = useRef(0),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveToken = useRef(0);
  const drag = useRef<{
    type: "paint" | "pan" | "crop";
    x: number;
    y: number;
    pan: { x: number; y: number };
    corner?: string;
    params?: Params;
  } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const stack = history[cursor].edits,
    tool = tools.find((t) => t.id === active?.tool) || tools[0];
  const previewEdits = useMemo(
    () =>
      dirty && active
        ? editingId
          ? stack.map((e) => (e.id === editingId ? active : e))
          : [...stack, active]
        : stack,
    [stack, active, dirty, editingId],
  );
  const chosenLook = String(
    previewEdits.find((e) => e.tool === "look")?.params.look || "original",
  );
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      notify(
        "Offline installation could not complete. Reconnect and reload to try again.",
      ),
  });

  const replacePhoto = useCallback(
    async (file: File) => {
      const token = ++loadToken.current;
      setBusy(
        /\.(dng|cr2|cr3|nef|arw|raf|rw2|orf)$/i.test(file.name)
          ? "Developing your RAW photo…"
          : "Opening your photo…",
      );
      try {
        const next = await readPhoto(file);
        if (loadToken.current !== token) return;
        setPhoto(next);
        setHistory([{ edits: [], label: "Original photo" }]);
        setCursor(0);
        setActive(freshEdit(next.raw ? "raw" : "tune"));
        setDirty(false);
        setEditingId(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setShowOriginal(false);
        setInitialized(true);
        setDialog(null);
        setExportName(file.name.replace(/\.[^.]+$/, "") + "-still");
        notify(
          next.width === 6000 || next.height === 6000
            ? "Photo opened. Large images are resized to 6000 px for a smoother workspace."
            : next.raw
              ? "RAW developed locally. Make it your own."
              : "Your photo, your little world.",
        );
        setShowMask(false);
        return next;
      } catch (e) {
        if (loadToken.current === token) notify(errorText(e));
      } finally {
        if (loadToken.current === token) setBusy("");
      }
    },
    [notify],
  );
  const openRef = useRef(replacePhoto);
  openRef.current = replacePhoto;

  useEffect(() => {
    let cancelled = false;
    const token = loadToken.current;
    (async () => {
      let restored = false;
      try {
        const saved = await loadProject();
        if (saved && loadToken.current === token && !cancelled) {
          const image = await readPhoto(
            new File([saved.blob], "restored.png", { type: saved.blob.type }),
          );
          if (cancelled || loadToken.current !== token) return;
          const validated = { edits: validateProjectEdits(saved.edits) };
          setPhoto({
            ...image,
            name: saved.name,
            raw: saved.raw,
            rawSource: saved.rawSource,
            metadata: saved.metadata,
          });
          setHistory([
            { edits: [], label: "Original photo" },
            { edits: validated.edits, label: "Recovered edits" },
          ]);
          setCursor(saved.edits.length ? 1 : 0);
          setExportName(saved.name.replace(/\.[^.]+$/, "") + "-still");
          restored = true;
          notify("Welcome back. Your last photo is right here.");
        }
      } catch {
        /* A blocked or outdated project must not prevent opening the editor. */
      }
      if (cancelled || loadToken.current !== token) return;
      if (!restored) {
        try {
          const res = await fetch(
            `${import.meta.env.BASE_URL}images/alpine-lake.jpg`,
          );
          if (!res.ok)
            throw new Error(
              "The sample photo could not load. Open a photo to get started.",
            );
          const blob = await res.blob(),
            image = await readPhoto(
              new File([blob], "Alpine escape.jpg", { type: "image/jpeg" }),
            );
          if (!cancelled && loadToken.current === token) setPhoto(image);
        } catch (e) {
          if (!cancelled) notify(errorText(e));
        }
      }
      if (!cancelled && loadToken.current === token) setInitialized(true);
    })();
    loadRecipes()
      .then((r) => {
        if (!cancelled) setRecipes(r.map(validateRecipe));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    if (!window.launchQueue) return;
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files.length) return;
      ++loadToken.current;
      try {
        const files = await Promise.all(
          params.files.map((handle) => handle.getFile()),
        );
        if (files.length === 1) await openRef.current(files[0]);
        else {
          setIncoming(files);
          setDialog("incoming");
          setInitialized(true);
        }
      } catch (e) {
        notify(`Could not open the system file. ${errorText(e)}`);
      }
    });
  }, [notify]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine),
      install = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as InstallPrompt);
      },
      installedHandler = () => {
        setInstalled(true);
        setInstallPrompt(null);
        notify("Still is installed. A little studio, always with you.");
      };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [notify]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ width, height });
    });
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!photo) return;
    const c = canvas(220, Math.round((220 * photo.height) / photo.width));
    c.getContext("2d")!.drawImage(photo.image, 0, 0, c.width, c.height);
    setThumb(c.toDataURL("image/jpeg", 0.8));
  }, [photo]);
  useEffect(() => {
    if (!photo) return;
    const token = ++renderToken.current;
    setRendering(true);
    const timer = setTimeout(async () => {
      try {
        const display = showOriginal
          ? []
          : dirty && active?.tool === "crop"
            ? previewEdits.filter((e) => e.id !== active.id)
            : previewEdits;
        const result = await renderImage(
          photo.image,
          display,
          1400,
          photo.rawSource,
        );
        if (renderToken.current !== token || !canvasRef.current) return;
        const target = canvasRef.current;
        target.width = result.width;
        target.height = result.height;
        target.getContext("2d")!.drawImage(result, 0, 0);
        setOutputSize({ width: result.width, height: result.height });
        setBins(histogram(result));
      } catch (e) {
        if (renderToken.current === token) notify(errorText(e));
      } finally {
        if (renderToken.current === token) setRendering(false);
      }
    }, 25);
    return () => clearTimeout(timer);
  }, [
    photo,
    previewEdits,
    showOriginal,
    dirty,
    active?.tool,
    active?.id,
    notify,
  ]);
  useEffect(() => {
    if (!photo || !initialized) return;
    const token = ++saveToken.current;
    setSaveState("saving");
    const timer = setTimeout(() => {
      saveProject({
        blob: photo.blob,
        name: photo.name,
        raw: photo.raw,
        rawSource: photo.rawSource,
        metadata: photo.metadata,
        edits: previewEdits,
        savedAt: Date.now(),
      })
        .then(() => {
          if (token === saveToken.current) setSaveState("saved");
        })
        .catch(() => {
          if (token === saveToken.current) setSaveState("error");
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [photo, previewEdits, initialized]);

  function commit(edits: Edit[], label: string) {
    const next = [...history.slice(0, cursor + 1), { edits, label }];
    // Keep the original snapshot reachable when pruning old undo steps.
    if (next.length > 61) next.splice(1, next.length - 61);
    setHistory(next);
    setCursor(next.length - 1);
    setDirty(false);
    setEditingId(null);
  }
  function applyActive() {
    if (!dirty || !active) return;
    commit(previewEdits, `Applied ${tool.name}`);
    setActive(freshEdit(active.tool));
    notify(`${tool.name} applied.`);
  }
  function selectTool(next: Tool) {
    if (dirty && active) commit(previewEdits, `Applied ${tool.name}`);
    setActive(freshEdit(next.id));
    setDirty(
      ![
        "tune",
        "details",
        "curves",
        "white-balance",
        "raw",
        "hsl",
        "rotate",
        "flip",
        "collage",
        "background",
        "perspective",
        "crop",
        "brush",
        "healing",
        "double",
        "lut",
      ].includes(next.id),
    );
    setEditingId(null);
    setRail("edit");
    setDialog(null);
    setMobilePanel(true);
    setShowOriginal(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowMask(false);
    if (next.id === "raw" && photo?.raw) {
      const previous = [...previewEdits]
        .reverse()
        .find((e) => e.tool === "raw");
      if (previous) {
        setActive({ ...previous, params: { ...previous.params } });
        setEditingId(previous.id);
        setDirty(false);
      }
    }
  }
  async function analyzePhoto(
    kind: "subject" | "face" | "depth",
    mode = "subject",
  ) {
    if (!photo || !active) return;
    const id = active.id;
    const token = ++analysisToken.current;
    setBusy(
      kind === "subject"
        ? "Selecting your subject on this device…"
        : kind === "face"
          ? "Finding facial landmarks on this device…"
          : "Estimating scene depth on this device…",
    );
    try {
      const base = editingId
        ? stack.slice(
            0,
            stack.findIndex((e) => e.id === editingId),
          )
        : stack;
      const source = await renderImage(
          photo.image,
          base,
          1000,
          photo.rawSource,
        ),
        result =
          token === analysisToken.current
            ? await analyze(source, kind)
            : undefined;
      if (!result || token !== analysisToken.current) return;
      setActive((previous) =>
        previous?.id === id
          ? {
              ...previous,
              ...result,
              params: {
                ...previous.params,
                ...(kind === "subject"
                  ? {
                      mask: mode,
                      target: mode,
                      area: mode,
                      shape:
                        previous.tool === "lens-blur"
                          ? "subject"
                          : previous.params.shape || "radial",
                    }
                  : kind === "depth"
                    ? { shape: "depth" }
                    : {
                        ...faceRegion(
                          result.faces![0],
                          source.width,
                          source.height,
                        ),
                        faceIndex: 0,
                      }),
              },
            }
          : previous,
      );
      setDirty(true);
      if (kind === "subject") setShowMask(active.tool !== "background");
      notify(
        kind === "subject"
          ? active.tool === "background"
            ? "Background removed. Choose a fill or export with transparency."
            : "Selection ready. Adjust just the area you chose."
          : kind === "face"
            ? `${result.faces!.length} face${result.faces!.length > 1 ? "s" : ""} detected locally.`
            : "Depth map ready. Tap your photo to choose the focus distance.",
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        notify(errorText(error));
    } finally {
      if (token === analysisToken.current) setBusy("");
    }
  }
  function setParam(key: string, value: number | string) {
    setActive((prev) =>
      prev
        ? {
            ...prev,
            params: {
              ...prev.params,
              ...(prev.tool === "crop" && key !== "ratio"
                ? { ratio: "Free" }
                : {}),
              [key]: value,
            },
          }
        : prev,
    );
    setDirty(true);
    setShowOriginal(false);
  }
  function resetActive() {
    setActive(freshEdit(tool.id));
    setDirty(false);
    setEditingId(null);
    notify("Adjustments reset. Your applied edits are kept.");
  }
  function undo() {
    if (dirty) {
      resetActive();
      return;
    }
    if (cursor > 0) {
      setCursor(cursor - 1);
      setDirty(false);
      setEditingId(null);
      setActive(freshEdit("tune"));
      setShowOriginal(false);
    }
  }
  function redo() {
    if (cursor < history.length - 1) {
      setCursor(cursor + 1);
      setDirty(false);
      setEditingId(null);
      setActive(freshEdit("tune"));
      setShowOriginal(false);
    }
  }
  function chooseLook(id: string) {
    const next = previewEdits.filter((e) => e.tool !== "look");
    if (id !== "original")
      next.unshift({
        id: crypto.randomUUID(),
        tool: "look",
        params: { look: id },
      });
    commit(
      next,
      id === "original"
        ? "Removed look"
        : `${looks.find((l) => l.id === id)?.name} look`,
    );
    setActive(freshEdit("tune"));
    setRail("edit");
    setShowOriginal(false);
    notify(
      id === "original"
        ? "Original colors. Your other edits are kept."
        : `${looks.find((l) => l.id === id)?.name}. A fresh way to see it.`,
    );
  }
  function cropRatio(ratio: string) {
    if (!active) return;
    const ratioValue =
      ratio === "Original"
        ? outputSize.width / outputSize.height
        : ratio.includes(":")
          ? Number(ratio.split(":")[0]) / Number(ratio.split(":")[1])
          : 0;
    let left = 0,
      right = 0,
      top = 0,
      bottom = 0;
    if (ratioValue) {
      const current = outputSize.width / outputSize.height;
      if (current > ratioValue) left = right = (1 - ratioValue / current) * 50;
      else top = bottom = (1 - current / ratioValue) * 50;
    }
    setActive({
      ...active,
      params: { ...active.params, left, right, top, bottom, ratio },
    });
    setDirty(true);
  }
  function autoAdjust() {
    const low = bins.slice(0, 16).reduce((a, b) => a + b, 0),
      high = bins.slice(48).reduce((a, b) => a + b, 0);
    setActive((prev) =>
      prev
        ? {
            ...prev,
            params: {
              ...prev.params,
              brightness: Math.round(
                Math.max(-20, Math.min(20, (low - high) * 2)),
              ),
              contrast: 12,
              saturation: 8,
              ambiance: 18,
              highlights: -12,
              shadows: 15,
              warmth: 3,
            },
          }
        : prev,
    );
    setDirty(true);
    notify("A little balance, automatically. Fine-tune it from here.");
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[role="dialog"]',
        ) ||
        dialog
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        fileRef.current?.click();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setDialog("export");
      } else if (e.key === "\\") {
        e.preventDefault();
        setShowOriginal((v) => !v);
      } else if (e.key === "Escape") {
        setShowOriginal(false);
        setMobilePanel(false);
        setActive(freshEdit(tool.id));
        setDirty(false);
        setEditingId(null);
      } else if (e.key === "Enter") applyActive();
      else if (e.key.toLowerCase() === "a" && active?.tool === "tune")
        autoAdjust();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      const file = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        e.preventDefault();
        void openRef.current(file);
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, []);

  function point(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = photoRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  function paint(e: ReactPointerEvent<HTMLDivElement>) {
    if (!active) return;
    const pos = point(e),
      pt: StrokePoint = {
        ...pos,
        radius: Number(active.params.size || 8) / 100,
        amount: Number(active.params.amount || 30),
      };
    setActive((prev) => {
      if (!prev) return prev;
      const points = prev.points || [],
        last = points[points.length - 1];
      if (last && Math.hypot(last.x - pt.x, last.y - pt.y) < pt.radius * 0.12)
        return prev;
      return { ...prev, points: [...points, pt] };
    });
    setDirty(true);
  }
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || showOriginal || !active) return;
    const corner = (e.target as HTMLElement).dataset.corner;
    if (active.tool === "white-balance" && active.params.pick) {
      const pos = point(e),
        c = canvasRef.current!,
        pixel = c
          .getContext("2d")!
          .getImageData(
            Math.min(c.width - 1, Math.floor(pos.x * c.width)),
            Math.min(c.height - 1, Math.floor(pos.y * c.height)),
            1,
            1,
          ).data,
        avg = (pixel[0] + pixel[1] + pixel[2]) / 3;
      setActive({
        ...active,
        params: {
          ...active.params,
          pick: 0,
          temperature: Math.max(
            -100,
            Math.min(100, Math.round((pixel[2] - pixel[0]) / 1.05)),
          ),
          tint: Math.max(-100, Math.min(100, Math.round((pixel[1] - avg) * 2))),
        },
      });
      setDirty(true);
      notify("White balance sampled from your neutral point.");
      return;
    }
    if (active.tool === "crop" && corner) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        type: "crop",
        x: e.clientX,
        y: e.clientY,
        pan,
        corner,
        params: { ...active.params },
      };
      return;
    }
    if (["brush", "healing"].includes(active.tool)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { type: "paint", x: e.clientX, y: e.clientY, pan };
      paint(e);
    } else if (
      [
        "selective",
        "vignette",
        "lens-blur",
        "portrait",
        "head-pose",
        "skin",
        "text",
        "sticker",
      ].includes(active.tool)
    ) {
      const pos = point(e),
        isFace = ["portrait", "head-pose", "skin"].includes(active.tool),
        isLayer = ["text", "sticker"].includes(active.tool);
      setActive({
        ...active,
        params: {
          ...active.params,
          [isFace ? "centerX" : isLayer ? "positionX" : "x"]: Math.round(
            pos.x * 100,
          ),
          [isFace ? "centerY" : isLayer ? "positionY" : "y"]: Math.round(
            pos.y * 100,
          ),
        },
      });
      setDirty(true);
    } else if (zoom > 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { type: "pan", x: e.clientX, y: e.clientY, pan };
    }
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (d.type === "paint") paint(e);
    else if (d.type === "pan")
      setPan({ x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y });
    else if (d.type === "crop" && active && d.params) {
      const rect = photoRef.current!.getBoundingClientRect(),
        dx = ((e.clientX - d.x) / rect.width) * 100,
        dy = ((e.clientY - d.y) / rect.height) * 100,
        p = { ...d.params, ratio: "Free" } as Params;
      if (d.corner?.includes("l"))
        p.left = Math.max(
          0,
          Math.min(90 - Number(p.right), Number(d.params.left) + dx),
        );
      if (d.corner?.includes("r"))
        p.right = Math.max(
          0,
          Math.min(90 - Number(p.left), Number(d.params.right) - dx),
        );
      if (d.corner?.includes("t"))
        p.top = Math.max(
          0,
          Math.min(90 - Number(p.bottom), Number(d.params.top) + dy),
        );
      if (d.corner?.includes("b"))
        p.bottom = Math.max(
          0,
          Math.min(90 - Number(p.top), Number(d.params.bottom) - dy),
        );
      setActive({ ...active, params: p });
      setDirty(true);
    }
  }
  async function addOverlay(file: File) {
    if (!active) return;
    const id = active.id;
    setBusy("Preparing your image layer…");
    try {
      const image = await fileToDataUrl(file);
      setActive((prev) => (prev?.id === id ? { ...prev, image } : prev));
      setDirty(true);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function addCollageFiles(files: File[]) {
    if (!active || active.tool !== "collage") return;
    const id = active.id,
      remaining = 8 - (active.images?.length || 0);
    if (remaining <= 0) {
      notify("A composition can hold up to nine photos.");
      return;
    }
    setBusy("Bringing your photos together…");
    try {
      // Decode sequentially to keep mobile memory bounded.
      const images: string[] = [];
      for (const file of files.slice(0, remaining))
        images.push(await fileToDataUrl(file));
      setActive((previous) =>
        previous?.id === id
          ? { ...previous, images: [...(previous.images || []), ...images] }
          : previous,
      );
      setDirty(true);
      setShowOriginal(false);
      if (files.length > remaining)
        notify(`Added ${remaining} photos. A composition holds up to nine.`);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy("");
    }
  }
  async function addLut(file: File) {
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Please use a LUT smaller than 8 MB.");
      const cube = /\.png$/i.test(file.name)
        ? await pngToCube(file)
        : await file.text();
      parseCube(cube);
      const lutPng = /\.png$/i.test(file.name) ? await blobDataUrl(file) : "";
      setActive((prev) =>
        prev
          ? {
              ...prev,
              params: {
                ...prev.params,
                cube,
                lutName: file.name,
                lutPng,
                lutLayout: "hald",
              },
            }
          : prev,
      );
      setDirty(true);
      notify("Your color palette is ready.");
    } catch (e) {
      notify(errorText(e));
    }
  }

  async function exportPhoto(saveAs = false) {
    if (!photo) return;
    const ext =
        format === "image/png"
          ? "png"
          : format === "image/webp"
            ? "webp"
            : "jpg",
      name =
        (exportName.trim() || "my-photo").replace(/[\\/:*?"<>|]/g, "-") +
        "." +
        ext;
    try {
      let handle:
        | Awaited<ReturnType<NonNullable<Window["showSaveFilePicker"]>>>
        | undefined;
      if (saveAs && window.showSaveFilePicker)
        handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [
            { description: "Edited photo", accept: { [format]: ["." + ext] } },
          ],
        });
      setBusy("Making your photo ready…");
      await new Promise((r) => setTimeout(r, 40));
      const max = exportSize === "original" ? 6000 : Number(exportSize),
        result = resizeOutput(
          await renderImage(photo.image, previewEdits, max, photo.rawSource),
          max,
        ),
        plain = await toBlob(result, format, quality / 100),
        blob = preserveMetadata
          ? await withMetadata(
              plain,
              photo.metadata,
              result.width,
              result.height,
            )
          : plain;
      if (blob.type !== format)
        throw new Error(
          "This browser does not support this export format. Try JPG or PNG.",
        );
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else download(blob, name);
      setDialog(null);
      notify(
        `Saved ${name} · ${result.width} × ${result.height} · ${fileSize(blob.size)}`,
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notify(errorText(e));
    } finally {
      setBusy("");
    }
  }
  async function exportBatch(files: File[]) {
    if (files.length > 10) {
      notify("Choose up to 10 photos at a time.");
      return;
    }
    setDialog("batch");
    setBusy("");
    setBatchProgress("Preparing your photos…");
    try {
      const { default: JSZip } = await import("jszip"),
        zip = new JSZip();
      for (let i = 0; i < files.length; i++) {
        setBatchProgress(
          `Editing photo ${i + 1} of ${files.length} · ${files[i].name}`,
        );
        await new Promise((r) => setTimeout(r, 20));
        const p = await readPhoto(files[i]),
          edits = await prepareBatchEdits(p, previewEdits),
          max = exportSize === "original" ? 6000 : Number(exportSize),
          result = resizeOutput(
            await renderImage(p.image, edits, max, p.rawSource),
            max,
          ),
          plain = await toBlob(result, format, quality / 100),
          blob = preserveMetadata
            ? await withMetadata(plain, p.metadata, result.width, result.height)
            : plain;
        if (blob.type !== format)
          throw new Error(
            "This export format is not supported by your browser.",
          );
        const ext =
          format === "image/png"
            ? "png"
            : format === "image/webp"
              ? "webp"
              : "jpg";
        zip.file(
          `${i + 1}-${p.name.replace(/\.[^.]+$/, "")}-still.${ext}`,
          blob,
        );
      }
      setBatchProgress("Wrapping up your photos…");
      const blob = await zip.generateAsync({ type: "blob" });
      download(blob, "still-edited-photos.zip");
      setDialog(null);
      notify(`${files.length} photos edited and saved as a ZIP.`);
    } catch (e) {
      notify(errorText(e));
      setDialog(null);
    } finally {
      setBatchProgress("");
    }
  }
  async function persistRecipe() {
    if (previewEdits.length > 200) {
      notify(
        "A shared Look supports up to 200 adjustments. Your full photo and edit stack remain saved on this device.",
      );
      return;
    }
    const next: Recipe = {
      version: 1,
      name: recipeName.trim() || "My look",
      edits: previewEdits,
    };
    const updated = [...recipes, next];
    try {
      await saveRecipes(updated);
      setRecipes(updated);
      setDialog("looks");
      notify("Your look is saved on this device.");
    } catch {
      notify("Could not save your look. Local storage may be full.");
    }
  }
  async function applyRecipe(r: Recipe) {
    if (!photo) return;
    const token = loadToken.current;
    setBusy(`Applying ${r.name}…`);
    try {
      const incoming = r.edits.map((edit) => ({
          ...edit,
          id: crypto.randomUUID(),
        })),
        edits = await prepareBatchEdits(photo, incoming, previewEdits);
      if (token !== loadToken.current) return;
      commit([...previewEdits, ...edits], `${r.name} look`);
      setActive(freshEdit("tune"));
      setDialog(null);
      notify(`${r.name} applied. Make it your own.`);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setBusy("");
    }
  }
  async function importRecipe(file: File) {
    try {
      const imported = await importLookFile(file),
        updated = [...recipes, ...imported];
      await saveRecipes(updated);
      setRecipes(updated);
      notify(
        imported.length === 1
          ? `${imported[0].name} added to your looks.${imported[0].warnings?.length ? " " + imported[0].warnings.join(" ") : ""}`
          : `${imported.length} looks added to your collection.`,
      );
      setDialog("looks");
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function shareQr(r: Recipe, native = false) {
    try {
      const { default: QRCode } = await import("qrcode");
      const text = native ? await exportSnapseed(r) : JSON.stringify(r);
      if (text.length > 2000)
        throw new Error(
          "This look is too detailed for a QR code. Download its JSON file instead.",
        );
      setQrUrl(
        await QRCode.toDataURL(text, {
          width: 520,
          margin: 3,
          color: { dark: "#20261c", light: "#ffffff" },
        }),
      );
    } catch (e) {
      notify(errorText(e));
    }
  }
  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
    } else setDialog("help");
  }
  const fit = Math.min(
    (stageSize.width - (stageSize.width < 600 ? 28 : 88)) / outputSize.width,
    (stageSize.height - (stageSize.width < 600 ? 20 : 44)) / outputSize.height,
  );
  const displayWidth = Math.max(1, outputSize.width * Math.max(0.01, fit)),
    displayHeight = Math.max(1, outputSize.height * Math.max(0.01, fit));
  const cropped = active?.tool === "crop",
    local =
      active &&
      ["selective", "vignette", "lens-blur", "portrait", "head-pose"].includes(
        active.tool,
      );
  const localX = Number(
      active?.params[
        ["portrait", "head-pose"].includes(active?.tool || "") ? "centerX" : "x"
      ] ?? 50,
    ),
    localY = Number(
      active?.params[
        ["portrait", "head-pose"].includes(active?.tool || "") ? "centerY" : "y"
      ] ?? 50,
    );

  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0]) void replacePhoto(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileRef}
        data-testid="open-file"
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void replacePhoto(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void replacePhoto(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={recipeRef}
        data-testid="import-look"
        type="file"
        accept=".json,.txt,.xmp,.cube,.zip,image/png,image/jpeg"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void importRecipe(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={batchRef}
        data-testid="batch-files"
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length)
            void exportBatch(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <header className="topbar">
        <a className="brand" href="./" aria-label="Still photo editor">
          <span className="brand-mark">
            <Aperture size={30} strokeWidth={1.5} />
          </span>
          <span>
            still<span className="brand-period">.</span>
          </span>
          <span className="brand-caption">PHOTO EDITOR</span>
        </a>
        <div className="topbar-center">
          <span className="little-star">✳</span> A little room to create.
        </div>
        <div className="topbar-actions">
          <button
            className="privacy-indicator"
            onClick={() => setDialog("help")}
          >
            <ShieldCheck size={15} />
            <span>Just you & your photos</span>
          </button>
          <button
            className="secondary-button open-button"
            onClick={() => fileRef.current?.click()}
          >
            <FolderOpen size={16} />
            <span>Open photo</span>
          </button>
          <button
            className="primary-button export-button"
            disabled={!photo || !!busy}
            onClick={() => setDialog("export")}
          >
            <span>Export</span>
            <ArrowUpRight size={17} />
          </button>
        </div>
      </header>
      <div className="editor-layout">
        <nav className="rail" aria-label="Workspace navigation">
          <div className="rail-top">
            {[
              {
                id: "edit",
                icon: SlidersHorizontal,
                label: "Edit",
                action: () => {
                  setRail("edit");
                  setMobilePanel(true);
                },
              },
              {
                id: "looks",
                icon: Sparkles,
                label: "Looks",
                action: () => {
                  setRail("looks");
                  setDialog("looks");
                },
              },
              {
                id: "crop",
                icon: Crop,
                label: "Crop",
                action: () => selectTool(tools.find((t) => t.id === "crop")!),
              },
              {
                id: "history",
                icon: Layers2,
                label: "Edits",
                action: () => {
                  setRail("history");
                  setMobilePanel(true);
                },
              },
            ].map(({ id, icon: Icon, label, action }) => (
              <button
                key={id}
                className={`rail-item ${rail === id || (id === "crop" && cropped) ? "active" : ""}`}
                onClick={action}
                aria-label={label}
                aria-pressed={rail === id}
              >
                <Icon size={21} strokeWidth={1.5} />
                <span>{label}</span>
                {id === "history" && stack.length > 0 && <i>{stack.length}</i>}
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <button
              className="rail-item"
              onClick={() => setDialog("camera")}
              aria-label="Take a photo"
            >
              <Camera size={21} strokeWidth={1.5} />
              <span>Camera</span>
            </button>
            <button
              className="rail-item install-rail"
              onClick={() => void install()}
              aria-label={installed ? "App installed" : "Install app"}
            >
              {installed ? (
                <CheckCheck size={20} />
              ) : (
                <Smartphone size={20} strokeWidth={1.5} />
              )}
              <span>{installed ? "Installed" : "Install"}</span>
            </button>
            <button
              className="rail-item help-rail"
              onClick={() => setDialog("help")}
              aria-label="Help and keyboard shortcuts"
            >
              <CircleHelp size={20} strokeWidth={1.5} />
            </button>
          </div>
        </nav>
        <main className="workspace-main">
          <div className="workspace-heading">
            <div className="photo-heading">
              <span className="file-icon">
                <ImageIcon size={19} strokeWidth={1.5} />
              </span>
              <div>
                <h1>
                  {photo?.name.replace(/\.[^.]+$/, "") ||
                    "Your next favorite photo"}
                </h1>
                <p>
                  {photo?.raw
                    ? "RAW · Developed on your device"
                    : "A moment worth making your own."}
                </p>
              </div>
              <button
                className="filename-menu"
                aria-label="Photo options"
                onClick={() => setDialog("reset")}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="workspace-actions">
              <div className="history-actions">
                <IconButton
                  icon={Undo2}
                  label="Undo (Ctrl+Z)"
                  onClick={undo}
                  disabled={cursor === 0 && !dirty}
                />
                <IconButton
                  icon={Redo2}
                  label="Redo (Ctrl+Shift+Z)"
                  onClick={redo}
                  disabled={cursor >= history.length - 1}
                />
              </div>
              <span className="vertical-divider" />
              <button
                className={`compare-button ${showOriginal ? "selected" : ""}`}
                aria-pressed={showOriginal}
                onClick={() => setShowOriginal((v) => !v)}
                title="Compare with original"
              >
                <Copy size={15} />
                <span>Compare</span>
              </button>
            </div>
          </div>
          <section
            className={`canvas-section ${showOriginal ? "showing-original" : ""}`}
            aria-label="Photo editing canvas"
          >
            <div className="canvas-topline">
              <div>
                <span className="tiny-dot" />
                {showOriginal ? "ORIGINAL" : "YOUR CANVAS"}
              </div>
              <span className="canvas-top-right">
                {rendering ? (
                  <>
                    <LoaderCircle size={12} className="spin" /> Rendering
                  </>
                ) : (
                  <>
                    <LockIcon /> Private by nature
                  </>
                )}
              </span>
            </div>
            <div
              className="image-stage"
              ref={stageRef}
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  drag.current = null;
                  pinch.current = {
                    distance: Math.hypot(
                      e.touches[0].clientX - e.touches[1].clientX,
                      e.touches[0].clientY - e.touches[1].clientY,
                    ),
                    zoom,
                  };
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && pinch.current) {
                  const distance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                  );
                  setZoom(
                    Math.max(
                      1,
                      Math.min(
                        4,
                        (pinch.current.zoom * distance) /
                          pinch.current.distance,
                      ),
                    ),
                  );
                }
              }}
              onTouchEnd={() => {
                pinch.current = null;
              }}
            >
              {photo ? (
                <div
                  ref={photoRef}
                  className={`photo-wrap ${["brush", "healing"].includes(active?.tool || "") ? "paint-cursor" : ""} ${zoom > 1 ? "can-pan" : ""}`}
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
                  }}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    aria-label={`Edited preview of ${photo.name}`}
                    data-testid="photo-canvas"
                  />
                  {showMask && active?.mask && !showOriginal && (
                    <div
                      className="selection-overlay"
                      aria-label={
                        active.params.mask === "background"
                          ? "Background selection preview"
                          : "Subject selection preview"
                      }
                      style={{
                        maskImage:
                          active.params.mask === "background"
                            ? `linear-gradient(#fff,#fff), url(${active.mask})`
                            : `url(${active.mask})`,
                        WebkitMaskImage:
                          active.params.mask === "background"
                            ? `linear-gradient(#fff,#fff), url(${active.mask})`
                            : `url(${active.mask})`,
                        maskComposite:
                          active.params.mask === "background"
                            ? "exclude"
                            : undefined,
                        WebkitMaskComposite:
                          active.params.mask === "background"
                            ? "xor"
                            : undefined,
                      }}
                    />
                  )}
                  {cropped && !showOriginal && (
                    <div
                      className="crop-overlay"
                      style={{
                        left: `${active.params.left}%`,
                        right: `${active.params.right}%`,
                        top: `${active.params.top}%`,
                        bottom: `${active.params.bottom}%`,
                      }}
                    >
                      <div className="crop-grid" />
                      {["tl", "tr", "bl", "br"].map((c) => (
                        <span
                          key={c}
                          data-corner={c}
                          className={`crop-corner ${c}`}
                        />
                      ))}
                    </div>
                  )}
                  {local && dirty && !showOriginal && (
                    <div
                      className={`local-point ${["portrait", "head-pose"].includes(active.tool) ? "face-point" : ""}`}
                      style={{ left: `${localX}%`, top: `${localY}%` }}
                    >
                      <Plus size={14} />
                    </div>
                  )}
                  {showOriginal && (
                    <span className="original-badge">Original</span>
                  )}
                </div>
              ) : (
                <div className="canvas-empty">
                  <Aperture size={42} />
                  <h2>A fresh perspective awaits.</h2>
                  <p>Drop a photo here or open one to begin.</p>
                  <button
                    className="primary-button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Plus size={16} /> Open photo
                  </button>
                </div>
              )}
            </div>
            <div className="canvas-bottomline">
              <div className="image-meta">
                <ImageIcon size={13} />
                <span>
                  {photo
                    ? `${photo.width.toLocaleString()} × ${photo.height.toLocaleString()}`
                    : "No photo yet"}
                </span>
                <span className="meta-dot">·</span>
                <span>
                  {photo ? fileSize(photo.size) : "JPG, PNG, RAW & more"}
                </span>
                <span className="image-format">
                  {photo?.raw
                    ? "RAW"
                    : photo?.name.split(".").pop()?.toUpperCase() || "JPG"}
                </span>
              </div>
              <div className="zoom-controls">
                <IconButton
                  icon={Minus}
                  label="Zoom out"
                  disabled={zoom <= 1}
                  onClick={() => {
                    setZoom((v) => Math.max(1, v - 0.25));
                    if (zoom <= 1.25) setPan({ x: 0, y: 0 });
                  }}
                />
                <button
                  className="zoom-value"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  aria-label="Fit photo to screen"
                >
                  {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
                  <ChevronDown size={11} />
                </button>
                <IconButton
                  icon={Plus}
                  label="Zoom in"
                  onClick={() => setZoom((v) => Math.min(4, v + 0.25))}
                  disabled={zoom >= 4}
                />
                <span className="vertical-divider" />
                <IconButton
                  icon={Maximize2}
                  label="Reset photo view"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    setMobilePanel(false);
                  }}
                />
              </div>
            </div>
          </section>
          <section className="looks-section" aria-labelledby="looks-heading">
            <div className="looks-heading">
              <div>
                <Sparkles size={17} />
                <h2 id="looks-heading">
                  A good place to start<span>Looks that make it yours.</span>
                </h2>
              </div>
              <button
                className="text-button"
                onClick={() => setDialog("looks")}
              >
                Explore looks <ArrowRight size={14} />
              </button>
            </div>
            <div className="looks-strip">
              {looks.slice(0, 8).map((look) => (
                <button
                  key={look.id}
                  className={`look-tile ${chosenLook === look.id ? "selected" : ""}`}
                  onClick={() => chooseLook(look.id)}
                  aria-pressed={chosenLook === look.id}
                >
                  <div className="look-image">
                    <img src={thumb} alt="" style={{ filter: look.filter }} />
                    {chosenLook === look.id && (
                      <span className="look-check">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <span>{look.name}</span>
                </button>
              ))}
            </div>
          </section>
          <footer className="workspace-footer">
            <div className={`save-status ${saveState}`}>
              <span className="status-dot" />
              {saveState === "saved"
                ? "All changes saved on this device"
                : saveState === "saving"
                  ? "Saving on your device…"
                  : "Local storage unavailable · export to keep your work"}
            </div>
            <div className="offline-status">
              {!online ? (
                <>
                  <WifiOff size={12} /> You’re offline. Keep creating.
                </>
              ) : (
                <>
                  <Leaf size={12} /> Made for a slower kind of scroll.
                </>
              )}
            </div>
          </footer>
        </main>
        <aside
          className={`tool-panel ${mobilePanel ? "mobile-open" : ""}`}
          aria-label="Editing tools"
        >
          <div className="panel-topbar">
            <span>
              {rail === "history" ? "Your edit stack" : "The little details"}
            </span>
            <button
              className="all-tools-button"
              onClick={() => {
                setSearch("");
                setDialog("tools");
              }}
            >
              <Grid2X2 size={14} /> All tools <span>{tools.length}</span>
            </button>
            <IconButton
              icon={ChevronDown}
              label="Collapse adjustments"
              className="mobile-close"
              onClick={() => setMobilePanel(false)}
            />
          </div>
          {rail === "history" ? (
            <>
              <div className="panel-scroll">
                <div className="tool-title">
                  <span className="eyebrow">NON-DESTRUCTIVE, ALWAYS</span>
                  <h2>A little change. A new story.</h2>
                  <p>Revisit any step, anytime.</p>
                </div>
                <button
                  className="history-original"
                  onClick={() => {
                    setCursor(0);
                    setDirty(false);
                    setActive(freshEdit("tune"));
                  }}
                >
                  <ImageIcon size={19} />
                  <div>
                    Original photo<small>Where it all began</small>
                  </div>
                </button>
                <div className="edit-stack">
                  {stack.map((edit, index) => {
                    const t = tools.find((t) => t.id === edit.tool),
                      Icon = t?.icon || Sparkles;
                    return (
                      <div className="stack-item" key={edit.id}>
                        <span className="stack-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <Icon size={18} />
                        <button
                          onClick={() => {
                            if (edit.tool === "look") {
                              setDialog("looks");
                              return;
                            }
                            setActive({ ...edit, params: { ...edit.params } });
                            setEditingId(edit.id);
                            setDirty(true);
                            setRail("edit");
                          }}
                        >
                          {t?.name ||
                            `${looks.find((l) => l.id === edit.params.look)?.name || "Creative"} look`}
                          <small>Edit this adjustment</small>
                        </button>
                        <IconButton
                          icon={Trash2}
                          label={`Remove ${t?.name || "look"}`}
                          onClick={() =>
                            commit(
                              stack.filter((e) => e.id !== edit.id),
                              `Removed ${t?.name || "look"}`,
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                {!stack.length && (
                  <div className="empty-state">
                    <Layers2 size={32} />
                    <p>Your story starts here.</p>
                    <span>Applied adjustments will appear in this space.</span>
                  </div>
                )}
                <div className="timeline">
                  <span className="eyebrow">HISTORY</span>
                  {history.map((entry, i) => (
                    <button
                      key={i}
                      className={cursor === i ? "current" : ""}
                      onClick={() => {
                        setCursor(i);
                        setDirty(false);
                        setEditingId(null);
                        setActive(freshEdit("tune"));
                      }}
                    >
                      <span className="timeline-dot" />
                      {entry.label}
                      {cursor === i && <Check size={13} />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-bottom">
                <button
                  className="secondary-button full"
                  onClick={() => setDialog("reset")}
                >
                  <RotateCcw size={15} /> Revert to original
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="panel-scroll">
                <div className="tool-title">
                  <div className="tool-category">
                    <span className="eyebrow">{tool.group.toUpperCase()}</span>
                    <ResetButton onClick={resetActive} />
                  </div>
                  <h2>
                    <tool.icon size={23} strokeWidth={1.6} />
                    {tool.name}
                  </h2>
                  <p>{tool.description}</p>
                </div>
                <Histogram bins={bins} />
                <div className="panel-rule" />
                <ToolControls
                  tool={tool}
                  edit={active || freshEdit("tune")}
                  setParam={setParam}
                  onOverlay={(file) => void addOverlay(file)}
                  onCollageFiles={(files) => void addCollageFiles(files)}
                  thumbnail={thumb}
                  onPatchEdit={(patch) => {
                    setActive((previous) =>
                      previous ? { ...previous, ...patch } : previous,
                    );
                    setDirty(true);
                    setShowOriginal(false);
                  }}
                  onLut={(file) => void addLut(file)}
                  onAuto={autoAdjust}
                  onCropRatio={cropRatio}
                  onAnalyze={(kind, mode) => void analyzePhoto(kind, mode)}
                  showMask={showMask}
                  onToggleMask={() => setShowMask((v) => !v)}
                  onClearFace={() => {
                    setActive((previous) =>
                      previous
                        ? { ...previous, faces: undefined, mesh: undefined }
                        : previous,
                    );
                    setDirty(true);
                  }}
                  onClearSelection={() => {
                    setActive((previous) =>
                      previous
                        ? {
                            ...previous,
                            mask: undefined,
                            params: {
                              ...previous.params,
                              mask: "radial",
                              area: "all",
                              target: "all",
                              shape:
                                previous.params.shape === "subject"
                                  ? "radial"
                                  : previous.params.shape || "radial",
                            },
                          }
                        : previous,
                    );
                    setShowMask(false);
                    setDirty(true);
                  }}
                />
                {tool.id === "tune" && (
                  <div className="gentle-tip">
                    <span className="tip-icon">
                      <Lightbulb size={17} />
                    </span>
                    <div>
                      <strong>A little goes a long way.</strong>
                      <p>
                        Small adjustments can make a big difference. Trust your
                        eye.
                      </p>
                    </div>
                  </div>
                )}
                <div className="quick-tools">
                  <span className="eyebrow">KEEP EXPLORING</span>
                  <div>
                    {[tools[1], tools[2], tools[3]]
                      .filter((t) => t.id !== tool.id)
                      .map((t) => (
                        <button key={t.id} onClick={() => selectTool(t)}>
                          <t.icon size={16} />
                          {t.name}
                          <ChevronRight size={13} />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
              <div className="panel-bottom">
                <button
                  className="cancel-button"
                  onClick={() => {
                    resetActive();
                    setMobilePanel(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="primary-button apply-button"
                  onClick={() => {
                    applyActive();
                    setMobilePanel(false);
                  }}
                  disabled={!dirty}
                >
                  <Check size={16} /> Apply changes
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
      <nav className="mobile-nav" aria-label="Mobile editing">
        <button onClick={() => setDialog("looks")}>
          <Sparkles size={19} />
          <span>Looks</span>
        </button>
        <button
          className={mobilePanel ? "selected" : ""}
          onClick={() => {
            setRail("edit");
            setMobilePanel((v) => !v);
          }}
        >
          <SlidersHorizontal size={19} />
          <span>Adjust</span>
        </button>
        <button onClick={() => setDialog("tools")}>
          <Grid2X2 size={19} />
          <span>Tools</span>
        </button>
        <button
          onClick={() => {
            setRail("history");
            setMobilePanel(true);
          }}
        >
          <Layers2 size={19} />
          <span>Edits</span>
          {stack.length > 0 && <i>{stack.length}</i>}
        </button>
      </nav>
      {dialog === "community" && (
        <CommunityStudio
          current={{ version: 1, name: recipeName, edits: previewEdits }}
          fallback={thumb}
          getPreview={() => {
            const source = canvasRef.current;
            if (!source) return thumb;
            const small = canvas(
              280,
              Math.round((280 * source.height) / source.width),
            );
            small
              .getContext("2d")!
              .drawImage(source, 0, 0, small.width, small.height);
            return small.toDataURL("image/jpeg", 0.7);
          }}
          onClose={() => setDialog(null)}
          onApply={applyRecipe}
        />
      )}
      {dialog === "tools" && (
        <Modal
          title="A little possibility in every tool."
          eyebrow="YOUR CREATIVE TOOLKIT"
          onClose={() => setDialog(null)}
          className="tools-modal"
        >
          <div className="search-field">
            <Search size={17} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find your next adjustment…"
              aria-label="Search tools"
            />
            <span>{tools.length} tools</span>
          </div>
          <div className="tools-grid-scroll">
            {[
              "Essentials",
              "Transform",
              "Local adjustments",
              "Creative",
              "Portrait",
              "Finishing",
            ].map((group) => {
              const list = tools.filter(
                (t) => t.group === group && matchesTool(t, search),
              );
              return (
                list.length > 0 && (
                  <section className="tool-group" key={group}>
                    <h3>{group}</h3>
                    <div className="tools-grid">
                      {list.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => selectTool(t)}
                          className={active?.tool === t.id ? "selected" : ""}
                        >
                          <span>
                            <t.icon size={24} strokeWidth={1.4} />
                          </span>
                          <strong>{t.name}</strong>
                        </button>
                      ))}
                    </div>
                  </section>
                )
              );
            })}
            {!tools.some((t) => matchesTool(t, search)) && (
              <div className="empty-state">
                <Search size={30} />
                <p>No tools found.</p>
                <span>Try “color”, “crop”, or “light”.</span>
              </div>
            )}
          </div>
          <div className="modal-footnote">
            <ShieldCheck size={14} /> Every edit stays on your device.
          </div>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal
          title="Ready to go out into the world."
          eyebrow="KEEP YOUR CREATION"
          onClose={() => setDialog(null)}
          className="export-modal"
        >
          <div className="export-preview">
            <img
              src={canvasRef.current?.toDataURL("image/jpeg", 0.65) || thumb}
              alt="Your edited photo"
            />
            <div>
              <strong>{photo?.name.replace(/\.[^.]+$/, "")}</strong>
              <span>Your photo. No watermark. Always.</span>
            </div>
            <Check size={19} />
          </div>
          <label className="field-label" htmlFor="export-name">
            File name
          </label>
          <input
            id="export-name"
            className="text-input"
            value={exportName}
            onChange={(e) => setExportName(e.target.value)}
            maxLength={160}
          />
          <div className="export-field">
            <label className="field-label">File format</label>
            <div className="format-options">
              {[
                { value: "image/jpeg", name: "JPG", hint: "Small & shareable" },
                { value: "image/png", name: "PNG", hint: "Lossless quality" },
                { value: "image/webp", name: "WebP", hint: "Best of both" },
              ].map((f) => (
                <button
                  key={f.value}
                  className={format === f.value ? "selected" : ""}
                  aria-pressed={format === f.value}
                  onClick={() => setFormat(f.value)}
                >
                  <strong>{f.name}</strong>
                  <span>{f.hint}</span>
                  {format === f.value && <Check size={13} />}
                </button>
              ))}
            </div>
          </div>
          <div className="export-field">
            <label className="field-label" htmlFor="export-size">
              Image size
            </label>
            <select
              id="export-size"
              value={exportSize}
              onChange={(e) => setExportSize(e.target.value)}
            >
              <option value="original">
                Full working resolution · up to 6000 px
              </option>
              <option value="2048">Large · 2048 px</option>
              <option value="1080">Social · 1080 px</option>
            </select>
          </div>
          {format !== "image/png" && (
            <Slider
              control={{
                key: "quality",
                label: "Quality",
                min: 10,
                max: 100,
                value: 95,
              }}
              value={quality}
              onChange={setQuality}
            />
          )}
          <label className="metadata-option">
            <input
              type="checkbox"
              checked={preserveMetadata}
              onChange={(e) => setPreserveMetadata(e.target.checked)}
            />
            <span>
              Preserve camera metadata
              <small>
                Includes saved location when present. Dimensions and orientation
                are updated.
              </small>
            </span>
          </label>
          <p className="export-note">
            <ShieldCheck size={14} /> Export creates a new copy. Your original
            stays yours.
          </p>
          <div className="export-actions">
            <button
              className="primary-button full"
              disabled={!!busy}
              onClick={() => void exportPhoto()}
            >
              <Download size={17} /> Download photo <ArrowUpRight size={16} />
            </button>
            {window.showSaveFilePicker && (
              <button
                className="secondary-button full"
                onClick={() => void exportPhoto(true)}
                disabled={!!busy}
              >
                <Save size={15} /> Save as…
              </button>
            )}
          </div>
          <button
            className="batch-link"
            onClick={() => batchRef.current?.click()}
          >
            <Copy size={14} /> Apply these edits to multiple photos{" "}
            <ArrowRight size={13} />
          </button>
        </Modal>
      )}
      {dialog === "looks" && (
        <Modal
          title="A fresh way to see it."
          eyebrow="A LITTLE INSPIRATION"
          onClose={() => {
            setDialog(null);
            setQrUrl("");
          }}
          className="looks-modal"
        >
          <div className="looks-modal-toolbar">
            <p>One tap. A whole new feeling.</p>
            <button
              className="secondary-button"
              onClick={() => setDialog("community")}
            >
              <Sparkles size={14} /> Discover
            </button>
            <button
              className="secondary-button"
              onClick={() => recipeRef.current?.click()}
            >
              <Upload size={14} /> Import look
            </button>
            <button
              className="primary-button"
              disabled={!previewEdits.length}
              onClick={() => setDialog("save-look")}
            >
              <Plus size={14} /> Save look
            </button>
          </div>
          <details className="import-look-text">
            <summary>Paste a QR look link or JSON</summary>
            <label className="field-label" htmlFor="look-payload">
              Look link or JSON
            </label>
            <textarea
              id="look-payload"
              value={lookLink}
              maxLength={200000}
              onChange={(e) => setLookLink(e.target.value)}
              placeholder="https://snapseed.com/qr?l=…"
            />
            <button
              className="secondary-button"
              disabled={!lookLink.trim()}
              onClick={() =>
                void importRecipe(
                  new File([lookLink], "pasted-look.txt", {
                    type: "text/plain",
                  }),
                )
              }
            >
              Import pasted look
            </button>
          </details>
          <div className="looks-gallery">
            {looks.map((look) => (
              <button
                key={look.id}
                className={chosenLook === look.id ? "selected" : ""}
                onClick={() => {
                  chooseLook(look.id);
                  setDialog(null);
                }}
              >
                <div>
                  <img src={thumb} style={{ filter: look.filter }} alt="" />
                  {chosenLook === look.id && (
                    <span>
                      <Check size={15} />
                    </span>
                  )}
                </div>
                <strong>{look.name}</strong>
                <small>{look.tag}</small>
              </button>
            ))}
          </div>
          <div className="saved-looks-title">
            <h3>Your own little collection</h3>
            <span>{recipes.length} saved</span>
          </div>
          {recipes.length === 0 ? (
            <div className="collection-empty">
              <Sparkles size={19} />
              <p>Find your favorite combination, then save it as a look.</p>
            </div>
          ) : (
            <div className="saved-looks">
              {recipes.map((r, i) => (
                <div key={`${r.name}-${i}`}>
                  <button
                    className="recipe-apply"
                    onClick={() => applyRecipe(r)}
                  >
                    <Sparkles size={18} />
                    <span>
                      {r.name}
                      <small>{r.edits.length} adjustments</small>
                      {r.warnings?.map((warning, i) => (
                        <small key={i} className="recipe-warning">
                          {warning}
                        </small>
                      ))}
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <IconButton
                    icon={Download}
                    label={`Download ${r.name} look`}
                    onClick={() =>
                      download(
                        new Blob([JSON.stringify(r, null, 2)], {
                          type: "application/json",
                        }),
                        `${r.name.replace(/[^\w-]/g, "-")}.still.json`,
                      )
                    }
                  />
                  <IconButton
                    icon={FileImage}
                    label={`Download ${r.name} as XMP`}
                    onClick={() =>
                      download(
                        new Blob([exportXmp(r)], {
                          type: "application/rdf+xml",
                        }),
                        `${r.name.replace(/[^\w-]/g, "-")}.xmp`,
                      )
                    }
                  />
                  <IconButton
                    icon={ScanLine}
                    label={`Share ${r.name} as QR`}
                    onClick={() => void shareQr(r)}
                  />
                  <IconButton
                    icon={Aperture}
                    label={`Share ${r.name} as Snapseed QR`}
                    onClick={() => void shareQr(r, true)}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Delete ${r.name} look`}
                    onClick={() => {
                      const next = recipes.filter((_, n) => n !== i);
                      saveRecipes(next)
                        .then(() => setRecipes(next))
                        .catch(() => notify("Could not delete this look."));
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {qrUrl && (
            <div className="qr-look">
              <img src={qrUrl} alt="QR code for your Still look" />
              <button
                className="secondary-button"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = qrUrl;
                  a.download = "still-look-qr.png";
                  a.click();
                }}
              >
                <Download size={14} /> Save QR look
              </button>
            </div>
          )}
          <div className="modal-footnote">
            Import Still JSON, QR images or Snapseed links, XMP, 3D LUTs, or ZIP
            look packs.
          </div>
        </Modal>
      )}
      {dialog === "save-look" && (
        <Modal
          title="Make this feeling your own."
          eyebrow="SAVE A LOOK"
          onClose={() => setDialog("looks")}
          className="small-modal"
        >
          <p className="modal-copy">
            Keep this combination of edits for the next photo. Saved only on
            this device, with JSON and QR sharing available.
          </p>
          <label className="field-label" htmlFor="look-name">
            Look name
          </label>
          <input
            id="look-name"
            className="text-input"
            value={recipeName}
            maxLength={60}
            onChange={(e) => setRecipeName(e.target.value)}
          />
          <button
            className="primary-button full"
            onClick={() => void persistRecipe()}
          >
            <Sparkles size={16} /> Save my look
          </button>
        </Modal>
      )}
      {dialog === "reset" && (
        <Modal
          title="Back to the beginning?"
          eyebrow="A FRESH START"
          onClose={() => setDialog(null)}
          className="small-modal"
        >
          <p className="modal-copy">
            Remove all applied adjustments and return to your original photo.
            You can still undo this step.
          </p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => setDialog(null)}
            >
              Keep editing
            </button>
            <button
              className="primary-button"
              onClick={() => {
                commit([], "Reverted to original");
                setActive(freshEdit("tune"));
                setShowOriginal(false);
                setDialog(null);
                notify("A fresh canvas. Your original photo, again.");
              }}
            >
              <RotateCcw size={15} /> Revert photo
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="A little space. A lot of possibility."
          eyebrow="WELCOME TO STILL"
          onClose={() => setDialog(null)}
          className="help-modal"
        >
          <div className="help-intro">
            <span className="help-brand">
              <Aperture size={36} />
            </span>
            <p>
              A quiet place to make your photos feel more like you. Inspired by
              the simplicity of Snapseed, built for your browser.
            </p>
          </div>
          <div className="help-features">
            <div>
              <ShieldCheck size={21} />
              <h3>Private by nature</h3>
              <p>
                Your originals and image processing stay on-device. Optional
                community sharing publishes a look and small preview only when
                you choose.
              </p>
            </div>
            <div>
              <WifiOff size={21} />
              <h3>Take it offline</h3>
              <p>
                {offlineReady
                  ? "Still is cached and ready to work offline."
                  : "Open Still online once and let offline installation finish."}{" "}
                Install it from your browser for a little studio of your own.
              </p>
            </div>
            <div>
              <FolderOpen size={21} />
              <h3>Open it your way</h3>
              <p>
                Open, drop, paste, or capture a photo. On supported desktop
                Chromium browsers, install Still and choose “Open with Still” on
                an image file.
              </p>
            </div>
            <div>
              <Layers2 size={21} />
              <h3>Every edit is a new beginning</h3>
              <p>
                Apply a tool or switch tools to keep an adjustment. Cancel to
                discard it. Revisit applied adjustments in Edits.
              </p>
            </div>
          </div>
          <div className="install-instructions">
            <h3>Make yourself at home</h3>
            <p>
              Chrome / Edge: use the install icon in the address bar. iPhone /
              iPad: Safari → Share → Add to Home Screen. OS file handling is
              currently a desktop Chromium feature; Open photo works everywhere.
            </p>
            {installPrompt && (
              <button className="primary-button" onClick={() => void install()}>
                <Smartphone size={16} /> Install Still
              </button>
            )}
          </div>
          <div className="shortcuts">
            <h3>A few little shortcuts</h3>
            {[
              ["Open photo", "⌘ / Ctrl + O"],
              ["Undo", "⌘ / Ctrl + Z"],
              ["Redo", "⌘ / Ctrl + Shift + Z"],
              ["Export", "⌘ / Ctrl + S"],
              ["Compare original", "\\"],
              ["Apply adjustment", "Enter"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <p className="help-limitations">
            Subject and depth models run locally, as do facial landmarks and 3D
            mesh pose changes. Smart healing and expansion match surrounding
            texture. RAW controls develop 16-bit linear data before display.
            Display edits and exports use 8-bit sRGB; source images over 6000 px
            are resized. Some private Snapseed QR operators and Adobe-only XMP
            features remain incompatible. Community sharing needs a separately
            hosted service.
          </p>
          <a
            href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Credits & licenses <ArrowUpRight size={13} />
          </a>
        </Modal>
      )}
      {dialog === "batch" && (
        <Modal
          title="A whole collection, made yours."
          eyebrow="BATCH EDITING"
          onClose={() => {
            if (!batchProgress) setDialog(null);
          }}
          className="small-modal"
        >
          <div className="batch-progress">
            <LoaderCircle className="spin" size={30} />
            <p>{batchProgress}</p>
            <span>Everything is happening right here on your device.</span>
          </div>
        </Modal>
      )}
      {dialog === "camera" && (
        <CameraStudio
          recipes={recipes}
          onClose={() => setDialog(null)}
          onOpen={() => cameraRef.current?.click()}
          onCapture={async (file, edits) => {
            const opened = await replacePhoto(file);
            if (!opened)
              throw new Error(
                "Your captured photo could not be opened. Please try again.",
              );
            setHistory([
              { edits: [], label: "Original photo" },
              { edits, label: "Captured with editable look" },
            ]);
            setCursor(edits.length ? 1 : 0);
            setActive(freshEdit("tune"));
            setDirty(false);
            setDialog(null);
          }}
        />
      )}
      {dialog === "incoming" && (
        <Modal
          title="Which moment shall we start with?"
          eyebrow="OPENED WITH STILL"
          onClose={() => setDialog(null)}
          className="small-modal"
        >
          <p className="modal-copy">
            {incoming.length} photos were opened. Choose one to edit, or apply
            your current edits to the collection from Export.
          </p>
          <div className="incoming-files">
            <button
              className="primary-button"
              onClick={() => void exportBatch([...incoming])}
            >
              <Copy size={16} /> Batch edit these photos
            </button>
            {incoming.map((file, i) => (
              <button key={i} onClick={() => void replacePhoto(file)}>
                <FileImage size={18} />
                <span>{file.name}</span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dragOver && (
        <div
          className="drop-overlay"
          onDragLeave={(e) => {
            if (e.target === e.currentTarget) setDragOver(false);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <div>
            <Upload size={42} />
            <h2>A new perspective.</h2>
            <p>Drop your photo to make it yours.</p>
          </div>
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <div>
            <Aperture size={32} className="spin" />
            <p>{busy}</p>
            {busy.includes("this device") && (
              <button
                className="secondary-button"
                onClick={() => {
                  ++analysisToken.current;
                  cancelAnalysis();
                  setBusy("");
                }}
              >
                Cancel analysis
              </button>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-mark">
            <Check size={14} />
          </span>
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="update-banner">
          <Sparkles size={16} />
          <span>A fresh version of Still is ready.</span>
          <button
            onClick={() => {
              if (saveState === "saved") void updateServiceWorker(true);
              else notify("Wait for your photo to finish saving, then update.");
            }}
          >
            Update
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            aria-label="Dismiss update"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="10"
      height="11"
      viewBox="0 0 10 11"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1.5" y="4.5" width="7" height="5" rx="1" stroke="currentColor" />
      <path d="M3 4.5V3a2 2 0 014 0v1.5" stroke="currentColor" />
    </svg>
  );
}
