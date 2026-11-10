import {
  Upload,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  WandSparkles,
  CircleDot,
} from "lucide-react";
import { useRef } from "react";
import { type Edit, type Params, type Tool } from "../lib/catalog";
import { Slider } from "./ui";

type Props = {
  tool: Tool;
  edit: Edit;
  setParam: (key: string, value: number | string) => void;
  onOverlay: (file: File) => void;
  onLut: (file: File) => void;
  onAuto: () => void;
  onCropRatio: (ratio: string) => void;
};

function Choices({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="choice-section">
      <label className="field-label">{label}</label>
      <div className="choice-row">
        {items.map((item) => (
          <button
            key={item.value}
            className={value === item.value ? "selected" : ""}
            aria-pressed={value === item.value}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ToolControls({
  tool,
  edit,
  setParam,
  onOverlay,
  onLut,
  onAuto,
  onCropRatio,
}: Props) {
  const { params: p } = edit,
    overlayInput = useRef<HTMLInputElement>(null),
    lutInput = useRef<HTMLInputElement>(null);
  const choose = (
    key: string,
    items: string[],
    label: string,
    labels?: string[],
  ) => (
    <Choices
      label={label}
      value={String(p[key] || items[0])}
      onChange={(v) => setParam(key, v)}
      items={items.map((value, i) => ({ value, label: labels?.[i] || value }))}
    />
  );
  return (
    <>
      {tool.id === "tune" && (
        <button className="auto-button" onClick={onAuto}>
          <WandSparkles size={15} />
          <span>Auto adjust</span>
          <span className="key-hint">A</span>
        </button>
      )}
      {tool.id === "curves" && (
        <>
          <CurveGraph params={p} onChange={setParam} />
          {choose("channel", ["rgb", "red", "green", "blue"], "Channel", [
            "RGB",
            "R",
            "G",
            "B",
          ])}
        </>
      )}
      {tool.id === "white-balance" && (
        <button
          className={`secondary-button full ${p.pick ? "selected" : ""}`}
          onClick={() => setParam("pick", p.pick ? 0 : 1)}
        >
          <CircleDot size={15} />
          {p.pick ? "Tap a neutral area in your photo" : "Pick a neutral color"}
        </button>
      )}
      {tool.id === "lens-blur" &&
        choose("shape", ["radial", "linear"], "Focus shape", [
          "Circular",
          "Linear",
        ])}
      {tool.id === "crop" && (
        <div className="choice-section">
          <label className="field-label">Aspect ratio</label>
          <div className="choice-row wrap">
            {[
              "Free",
              "Original",
              "1:1",
              "4:3",
              "3:2",
              "16:9",
              "9:16",
              "4:5",
            ].map((r) => (
              <button
                key={r}
                className={p.ratio === r ? "selected" : ""}
                onClick={() => onCropRatio(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
      {tool.id === "rotate" && (
        <div className="transform-buttons">
          {[
            {
              icon: RotateCcw,
              label: "Rotate left",
              key: "turns",
              value: Number(p.turns) - 1,
            },
            {
              icon: RotateCw,
              label: "Rotate right",
              key: "turns",
              value: Number(p.turns) + 1,
            },
            {
              icon: FlipHorizontal2,
              label: "Flip horizontal",
              key: "flipX",
              value: p.flipX ? 0 : 1,
            },
            {
              icon: FlipVertical2,
              label: "Flip vertical",
              key: "flipY",
              value: p.flipY ? 0 : 1,
            },
          ].map(({ icon: Icon, label, key, value }) => (
            <button
              key={label}
              title={label}
              aria-label={label}
              onClick={() => setParam(key, value)}
            >
              <Icon size={19} />
            </button>
          ))}
        </div>
      )}
      {tool.id === "expand" &&
        choose("fill", ["mirror", "white", "black"], "Fill", [
          "Reflect",
          "White",
          "Black",
        ])}
      {tool.id === "selective" &&
        choose("mask", ["radial", "color"], "Selection", [
          "Radial",
          "Similar colors",
        ])}
      {tool.id === "brush" &&
        choose(
          "mode",
          ["exposure", "dodge", "saturation", "temperature"],
          "Brush mode",
          ["Exposure", "Dodge", "Saturation", "Warmth"],
        )}
      {tool.id === "double" && (
        <>
          <input
            hidden
            ref={overlayInput}
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) onOverlay(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            className="secondary-button full"
            onClick={() => overlayInput.current?.click()}
          >
            <Upload size={16} />
            {edit.image ? "Replace second photo" : "Add second photo"}
          </button>
          {choose(
            "blend",
            ["screen", "multiply", "overlay", "lighten", "darken", "normal"],
            "Blend mode",
            ["Screen", "Multiply", "Overlay", "Lighten", "Darken", "Normal"],
          )}
        </>
      )}
      {tool.id === "lut" && (
        <>
          <input
            hidden
            ref={lutInput}
            type="file"
            accept=".cube,image/png"
            onChange={(e) => {
              if (e.target.files?.[0]) onLut(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <button
            className="secondary-button full"
            onClick={() => lutInput.current?.click()}
          >
            <Upload size={16} />
            {p.lutName ? String(p.lutName) : "Import .cube / Hald PNG"}
          </button>
        </>
      )}
      {tool.id === "hsl" && (
        <div className="color-ranges" role="group" aria-label="Color range">
          {[
            "all",
            "red",
            "orange",
            "yellow",
            "green",
            "aqua",
            "blue",
            "purple",
            "magenta",
          ].map((color) => (
            <button
              key={color}
              aria-label={`${color} colors`}
              aria-pressed={p.range === color}
              title={color}
              className={p.range === color ? "selected" : ""}
              style={{
                background:
                  color === "all"
                    ? "conic-gradient(red,yellow,lime,aqua,blue,magenta,red)"
                    : color,
              }}
              onClick={() => setParam("range", color)}
            />
          ))}
        </div>
      )}
      {tool.id === "text" && (
        <>
          <label className="field-label" htmlFor="photo-text">
            Your words
          </label>
          <textarea
            id="photo-text"
            value={String(p.text || "")}
            maxLength={300}
            rows={3}
            onChange={(e) => setParam("text", e.target.value)}
            placeholder="A moment, kept."
          />
          {choose("font", ["serif", "sans", "mono"], "Typeface", [
            "Editorial",
            "Modern",
            "Typewriter",
          ])}
          {choose("style", ["plain", "bold"], "Weight", ["Regular", "Bold"])}
        </>
      )}
      {(tool.id === "text" || tool.id === "frames") && (
        <div className="color-field">
          <label htmlFor="tool-color">
            {tool.id === "frames" ? "Frame color" : "Text color"}
          </label>
          <input
            id="tool-color"
            type="color"
            value={String(p.color || "#ffffff")}
            onChange={(e) => setParam("color", e.target.value)}
          />
        </div>
      )}
      <div className="sliders">
        {tool.controls.map((control) => (
          <Slider
            key={control.key}
            control={control}
            value={Number(p[control.key] ?? control.value)}
            onChange={(v) => setParam(control.key, v)}
          />
        ))}
      </div>
      {tool.hint && (
        <div className="tool-hint">
          <CircleDot size={15} />
          <p>{tool.hint}</p>
        </div>
      )}
      {["brush", "healing"].includes(tool.id) && (
        <p className="stroke-count">
          {edit.points?.length
            ? `${edit.points.length} brush points`
            : "Your photo is your canvas."}
        </p>
      )}
    </>
  );
}

function CurveGraph({
  params: p,
  onChange,
}: {
  params: Params;
  onChange: (key: string, value: number) => void;
}) {
  const keys = ["blacks", "shadows", "midtones", "highlights", "whites"],
    points = keys.map(
      (key, i) =>
        `${20 + i * 55},${180 - Math.max(0, Math.min(1, i / 4 + Number(p[key] || 0) / 300)) * 160}`,
    );
  const drag = useRef<number | null>(null);
  function update(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect(),
      x = ((e.clientX - rect.left) / rect.width) * 260,
      y = ((e.clientY - rect.top) / rect.height) * 200,
      index =
        drag.current ?? Math.max(0, Math.min(4, Math.round((x - 20) / 55)));
    drag.current = index;
    const value = Math.max(
      -100,
      Math.min(100, Math.round(((180 - y) / 160 - index / 4) * 300)),
    );
    onChange(keys[index], value);
  }
  return (
    <svg
      className="curve-graph"
      style={{ touchAction: "none", cursor: "crosshair" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (drag.current !== null) update(e);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      viewBox="0 0 260 200"
      role="img"
      aria-label="Tone curve. Drag a control point or use the tone sliders below."
    >
      <path
        d="M20 20V180H240M20 140H240M20 100H240M20 60H240M75 20V180M130 20V180M185 20V180M240 20V180"
        stroke="#ffffff12"
        fill="none"
      />
      <path d="M20 180L240 20" stroke="#ffffff25" strokeDasharray="3 4" />
      <polyline
        points={points.join(" ")}
        stroke={
          p.channel === "red"
            ? "#ed9c9c"
            : p.channel === "green"
              ? "#afcb8c"
              : p.channel === "blue"
                ? "#9abcec"
                : "#d1e5a6"
        }
        strokeWidth="2"
        fill="none"
      />
      {points.map((point, i) => (
        <circle
          key={i}
          cx={point.split(",")[0]}
          cy={point.split(",")[1]}
          r="4"
          fill="#d1e5a6"
        />
      ))}
    </svg>
  );
}
