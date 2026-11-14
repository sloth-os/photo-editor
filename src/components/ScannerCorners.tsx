import { useEffect, useRef, useState, type PointerEvent } from "react";
import { validScanQuad } from "../lib/scanner";
import type { ScanPoint, ScanQuad } from "../lib/scanner-types";

const names = ["top left", "top right", "bottom right", "bottom left"];
export default function ScannerCorners({
  source,
  corners,
  onChange,
}: {
  source: HTMLCanvasElement;
  corners: ScanQuad;
  onChange: (corners: ScanQuad) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    image = useRef<HTMLCanvasElement>(null),
    magnifier = useRef<HTMLCanvasElement>(null),
    drag = useRef<{ index: number; before: ScanQuad } | null>(null),
    [size, setSize] = useState({ width: 0, height: 0 }),
    [lens, setLens] = useState<ScanPoint | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(
      size.width / source.width,
      size.height / source.height,
    ),
    width = source.width * scale,
    height = source.height * scale;
  useEffect(() => {
    if (!image.current) return;
    const scale = Math.min(1, 1400 / Math.max(source.width, source.height));
    image.current.width = Math.round(source.width * scale);
    image.current.height = Math.round(source.height * scale);
    image.current
      .getContext("2d")!
      .drawImage(source, 0, 0, image.current.width, image.current.height);
  }, [source]);
  useEffect(() => {
    if (!lens || !magnifier.current || !width) return;
    const c = magnifier.current,
      ctx = c.getContext("2d")!,
      zone = (36 * source.width) / width;
    c.width = c.height = 110;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 110, 110);
    ctx.drawImage(
      source,
      lens.x * source.width - zone / 2,
      lens.y * source.height - zone / 2,
      zone,
      zone,
      0,
      0,
      110,
      110,
    );
    ctx.strokeStyle = "#213019";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(42, 55);
    ctx.lineTo(68, 55);
    ctx.moveTo(55, 42);
    ctx.lineTo(55, 68);
    ctx.stroke();
    ctx.strokeStyle = "#d1f49d";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [lens, source, width]);
  function move(index: number, point: ScanPoint) {
    const next = corners.map((p, i) => (i === index ? point : p)) as ScanQuad;
    if (validScanQuad(next)) {
      onChange(next);
      setLens(point);
    }
  }
  function pointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    move(drag.current.index, {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    });
  }
  return (
    <div className="scan-corner-stage" ref={root}>
      <div
        className="scan-corner-photo"
        style={{ width, height }}
        role="group"
        aria-label="Document corner editor"
      >
        <canvas ref={image} aria-label="Original document photograph" />
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="scan-outside"
            d={`M0 0H1000V1000H0Z M${corners.map((p) => `${p.x * 1000},${p.y * 1000}`).join("L")}Z`}
            fillRule="evenodd"
          />
          <polygon
            points={corners.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")}
          />
        </svg>
        {corners.map((point, i) => (
          <button
            key={i}
            className="scan-corner"
            aria-label={`Document ${names[i]} corner`}
            title="Drag to adjust. Arrow keys move one pixel; Shift moves ten."
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              drag.current = { index: i, before: corners };
              setLens(point);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={pointerMove}
            onPointerUp={() => {
              drag.current = null;
              setLens(null);
            }}
            onPointerCancel={() => {
              if (drag.current) onChange(drag.current.before);
              drag.current = null;
              setLens(null);
            }}
            onKeyDown={(e) => {
              const key = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[e.key];
              if (!key) return;
              e.preventDefault();
              const step = e.shiftKey ? 10 : 1;
              move(i, {
                x: Math.max(
                  0,
                  Math.min(1, point.x + (key[0] * step) / source.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, point.y + (key[1] * step) / source.height),
                ),
              });
              setLens(null);
            }}
          >
            <span />
          </button>
        ))}
        {lens && (
          <canvas
            ref={magnifier}
            className="scan-magnifier"
            aria-label="Magnified document corner"
            style={{
              left: Math.max(56, Math.min(width - 56, lens.x * width)),
              top:
                lens.y * height > 135
                  ? lens.y * height - 78
                  : lens.y * height + 78,
            }}
          />
        )}
      </div>
    </div>
  );
}
