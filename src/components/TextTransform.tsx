import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCw } from "lucide-react";
import type { Params } from "../lib/catalog";
import { normalizeRotation, textFont } from "../lib/text";

export default function TextTransform({
  params,
  width,
  height,
  zoom,
  onChange,
}: {
  params: Params;
  width: number;
  height: number;
  zoom: number;
  onChange: (patch: Params) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    drag = useRef<{
      id: number;
      mode: "move" | "rotate";
      x: number;
      y: number;
      cx: number;
      cy: number;
      angle: number;
      rotation: number;
      positionX: number;
      positionY: number;
      photoWidth: number;
      photoHeight: number;
    } | null>(null);
  const bounds = useMemo(() => {
    const ctx = document.createElement("canvas").getContext("2d")!,
      size = (Math.min(width, height) * Number(params.size || 10)) / 100,
      lines = String(params.text || "")
        .split("\n")
        .slice(0, 8);
    ctx.font = textFont(params, size);
    return {
      width: Math.max(
        width * 0.05,
        Math.min(
          width * 0.9,
          Math.max(...lines.map((line) => ctx.measureText(line).width)),
        ),
      ),
      height: Math.max(size * 1.25, lines.length * size * 1.25),
    };
  }, [params.text, params.size, params.font, params.style, width, height]);
  function start(e: ReactPointerEvent<HTMLElement>, mode: "move" | "rotate") {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = root.current!.getBoundingClientRect(),
      photo = root.current!.parentElement!.getBoundingClientRect(),
      cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    drag.current = {
      id: e.pointerId,
      mode,
      x: e.clientX,
      y: e.clientY,
      cx,
      cy,
      angle: Math.atan2(e.clientY - cy, e.clientX - cx),
      rotation: Number(params.rotation || 0),
      positionX: Number(params.positionX ?? 50),
      positionY: Number(params.positionY ?? 50),
      photoWidth: photo.width,
      photoHeight: photo.height,
    };
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    e.stopPropagation();
    if (d.mode === "rotate")
      onChange({
        rotation: Math.round(
          normalizeRotation(
            d.rotation +
              ((Math.atan2(e.clientY - d.cy, e.clientX - d.cx) - d.angle) *
                180) /
                Math.PI,
          ),
        ),
      });
    else
      onChange({
        positionX: Math.max(
          0,
          Math.min(100, d.positionX + ((e.clientX - d.x) / d.photoWidth) * 100),
        ),
        positionY: Math.max(
          0,
          Math.min(
            100,
            d.positionY + ((e.clientY - d.y) / d.photoHeight) * 100,
          ),
        ),
      });
  }
  return (
    <div
      ref={root}
      className="text-transform"
      role="group"
      aria-label="Text placement and rotation"
      style={{
        left: `${params.positionX ?? 50}%`,
        top: `${params.positionY ?? 50}%`,
        width: `${(bounds.width / width) * 100}%`,
        height: `${(bounds.height / height) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${params.rotation || 0}deg)`,
      }}
      onPointerDown={(e) => start(e, "move")}
      onPointerMove={move}
      onPointerUp={(e) => {
        e.stopPropagation();
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
    >
      <button
        className="text-rotation-handle"
        aria-label="Rotate text by dragging"
        title="Drag to rotate text; arrow keys rotate by 1°"
        style={{ transform: `translateX(-50%) scale(${1 / zoom})` }}
        onPointerDown={(e) => start(e, "rotate")}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            onChange({
              rotation: normalizeRotation(
                Number(params.rotation || 0) +
                  (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 15 : 1),
              ),
            });
          }
        }}
      >
        <RotateCw size={20} />
      </button>
      <span className="text-rotation-value">
        {Math.round(Number(params.rotation || 0))}°
      </span>
    </div>
  );
}
