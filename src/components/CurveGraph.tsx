import { useRef, useState, useEffect, type PointerEvent } from "react";
import type { Params } from "../lib/catalog";
type Point = [number, number];
export default function CurveGraph({
  params: p,
  onChange,
}: {
  params: Params;
  onChange: (key: string, value: number | string) => void;
}) {
  const keys = ["blacks", "shadows", "midtones", "highlights", "whites"],
    channel = String(p.channel || "rgb"),
    key =
      channel === "rgb"
        ? "curveRGB"
        : `curve${channel[0].toUpperCase() + channel.slice(1)}`;
  let points: Point[] = keys.map((k, i) => [
    i / 4,
    Math.max(0, Math.min(1, i / 4 + Number(p[k] || 0) / 300)),
  ]);
  try {
    if (p[key]) points = JSON.parse(String(p[key]));
  } catch {}
  const drag = useRef<{ index: number; points: Point[] } | null>(null),
    [selected, setSelected] = useState<number | null>(null);
  useEffect(() => setSelected(null), [channel]);
  function save(next: Point[]) {
    for (const k of keys) if (p[k]) onChange(k, 0);
    onChange(key, JSON.stringify(next));
  }
  function position(e: PointerEvent<SVGSVGElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(1, (((e.clientX - rect.left) / rect.width) * 260 - 20) / 220),
      ),
      Math.max(
        0,
        Math.min(1, (180 - ((e.clientY - rect.top) / rect.height) * 200) / 160),
      ),
    ];
  }
  function down(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const target = position(e);
    let index = points.reduce(
        (best, point, i) =>
          Math.hypot(
            (point[0] - target[0]) * 220,
            (point[1] - target[1]) * 160,
          ) <
          Math.hypot(
            (points[best][0] - target[0]) * 220,
            (points[best][1] - target[1]) * 160,
          )
            ? i
            : best,
        0,
      ),
      next = points.map((point) => [...point] as Point);
    if (
      Math.hypot(
        (points[index][0] - target[0]) * 220,
        (points[index][1] - target[1]) * 160,
      ) > 15 &&
      points.length < 64 &&
      target[0] > 0.005 &&
      target[0] < 0.995
    ) {
      next.push(target);
      next.sort((a, b) => a[0] - b[0]);
      index = next.indexOf(target);
    }
    drag.current = { index, points: next };
    setSelected(index);
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    const point = position(e),
      index = current.index,
      next = current.points.map((point) => [...point] as Point);
    point[0] =
      index === 0
        ? 0
        : index === next.length - 1
          ? 1
          : Math.max(
              next[index - 1][0] + 0.003,
              Math.min(next[index + 1][0] - 0.003, point[0]),
            );
    next[index] = point;
    current.points = next;
    save(next);
  }
  function remove(index: number) {
    if (index === 0 || index === points.length - 1) return;
    save(points.filter((_, i) => i !== index));
    setSelected(null);
  }
  return (
    <>
      <svg
        className="curve-graph"
        style={{ touchAction: "none", cursor: "crosshair" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        viewBox="0 0 260 200"
        aria-label="Interactive tone curve"
      >
        <path
          d="M20 20V180H240M20 140H240M20 100H240M20 60H240M75 20V180M130 20V180M185 20V180M240 20V180"
          stroke="#ffffff12"
          fill="none"
        />
        <path d="M20 180L240 20" stroke="#ffffff25" strokeDasharray="3 4" />
        <polyline
          points={points
            .map((point) => `${20 + point[0] * 220},${180 - point[1] * 160}`)
            .join(" ")}
          stroke={
            channel === "red"
              ? "#ed9c9c"
              : channel === "green"
                ? "#afcb8c"
                : channel === "blue"
                  ? "#9abcec"
                  : "#d1e5a6"
          }
          strokeWidth="2"
          fill="none"
        />
        {points.map((point, i) => (
          <circle
            key={i}
            cx={20 + point[0] * 220}
            cy={180 - point[1] * 160}
            r={selected === i ? 5 : 3.5}
            fill="#d1e5a6"
            stroke={selected === i ? "#fff" : "none"}
            role="slider"
            tabIndex={0}
            aria-label={`Curve point ${i + 1}`}
            aria-valuenow={Math.round(point[1] * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            onFocus={() => setSelected(i)}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                remove(i);
              }
              if (
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                  e.key,
                )
              ) {
                e.preventDefault();
                const next = points.map((p) => [...p] as Point),
                  axis =
                    e.key === "ArrowLeft" || e.key === "ArrowRight" ? 0 : 1,
                  delta =
                    e.key === "ArrowDown" || e.key === "ArrowLeft"
                      ? -0.01
                      : 0.01;
                if (axis === 1)
                  next[i][1] = Math.max(0, Math.min(1, next[i][1] + delta));
                else if (i > 0 && i < next.length - 1)
                  next[i][0] = Math.max(
                    next[i - 1][0] + 0.003,
                    Math.min(next[i + 1][0] - 0.003, next[i][0] + delta),
                  );
                save(next);
              }
            }}
          />
        ))}
      </svg>
      <div className="curve-actions">
        <small>Tap to add a point. Drag to shape the light.</small>
        <button
          className="text-button"
          disabled={
            selected === null ||
            selected === 0 ||
            selected === points.length - 1
          }
          onClick={() => selected !== null && remove(selected)}
        >
          Remove point
        </button>
      </div>
    </>
  );
}
