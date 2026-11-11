import CurveGraph from "./CurveGraph";
import {
  Upload,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  WandSparkles,
  CircleDot,
  ScanFace,
  Wand,
  Layers,
} from "lucide-react";
import { useRef } from "react";
import { type Edit, type Tool } from "../lib/catalog";
import { Slider } from "./ui";

type Props = {
  tool: Tool;
  edit: Edit;
  setParam: (key: string, value: number | string) => void;
  onOverlay: (file: File) => void;
  onLut: (file: File) => void;
  onAuto: () => void;
  onCropRatio: (ratio: string) => void;
  onAnalyze: (kind: "subject" | "face" | "depth", mode?: string) => void;
  showMask: boolean;
  onToggleMask: () => void;
  onClearSelection: () => void;
  onClearFace: () => void;
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
  onAnalyze,
  showMask,
  onToggleMask,
  onClearSelection,
  onClearFace,
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
      {["selective", "brush", "lens-blur", "motion"].includes(tool.id) && (
        <div className="intelligence-controls">
          <span className="field-label">Smart selection · on-device</span>
          <div className="choice-row">
            <button
              className={edit.mask && p.mask === "subject" ? "selected" : ""}
              onClick={() => onAnalyze("subject", "subject")}
            >
              <Wand size={13} /> Subject
            </button>
            <button
              className={edit.mask && p.mask === "background" ? "selected" : ""}
              onClick={() => onAnalyze("subject", "background")}
            >
              <Layers size={13} /> Background
            </button>
          </div>
          {edit.mask && (
            <div className="selection-actions">
              <button
                className="text-button"
                aria-pressed={showMask}
                onClick={onToggleMask}
              >
                {showMask ? "Hide selection" : "Preview selection"}
              </button>
              <button className="text-button" onClick={onClearSelection}>
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
      {tool.id === "lens-blur" && (
        <button
          className="secondary-button full"
          onClick={() => onAnalyze("depth")}
        >
          <Layers size={15} />
          {edit.depth ? "Recalculate depth map" : "Estimate scene depth"}
        </button>
      )}
      {["portrait", "head-pose"].includes(tool.id) && (
        <div className="intelligence-controls">
          <button
            className="secondary-button full"
            onClick={() => onAnalyze("face")}
          >
            <ScanFace size={15} />
            {edit.faces?.length
              ? "Detect faces again"
              : "Detect faces automatically"}
          </button>
          {!!edit.faces?.length && (
            <>
              <label className="field-label" htmlFor="face-choice">
                Detected face
              </label>
              <select
                id="face-choice"
                value={String(p.faceIndex || 0)}
                onChange={(e) => setParam("faceIndex", Number(e.target.value))}
              >
                {edit.faces.map((_, i) => (
                  <option value={i} key={i}>
                    Face {i + 1}
                  </option>
                ))}
              </select>
              <p className="analysis-note">
                Face detected on this device.{" "}
                {tool.id === "head-pose"
                  ? "Small changes keep the result natural."
                  : "Lighting and eye adjustments follow this face."}
              </p>
              <button className="text-button" onClick={onClearFace}>
                Use manual placement
              </button>
            </>
          )}
        </div>
      )}
      {tool.id === "healing" &&
        choose("method", ["smart", "clone"], "Healing method", [
          "Content-aware",
          "Clone",
        ])}
      {tool.id === "grain" && (
        <div className="choice-section">
          <label className="field-label" htmlFor="film-stock">
            Film stock
          </label>
          <select
            id="film-stock"
            value={String(p.stock || "neutral")}
            onChange={(e) => setParam("stock", e.target.value)}
          >
            <option value="neutral">Neutral analog</option>
            <option value="portrait">Portrait 160 · soft and warm</option>
            <option value="cinema">Cinema 400 · rich contrast</option>
            <option value="tungsten">Tungsten 800 · cool shadows</option>
            <option value="mono">Mono 400 · silver tones</option>
          </select>
        </div>
      )}
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
          {choose(
            "channel",
            ["rgb", "red", "green", "blue", "luma"],
            "Channel",
            ["RGB", "R", "G", "B", "L"],
          )}
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
        choose(
          "shape",
          [
            "radial",
            "linear",
            ...(edit.mask ? ["subject"] : []),
            ...(edit.depth ? ["depth"] : []),
          ],
          "Focus shape",
          [
            "Circular",
            "Linear",
            ...(edit.mask ? ["Subject"] : []),
            ...(edit.depth ? ["Depth"] : []),
          ],
        )}
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
        choose("fill", ["smart", "mirror", "white", "black"], "Fill", [
          "Smart",
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
      {tool.id === "lut" &&
        p.lutPng &&
        choose("lutLayout", ["hald", "tiled"], "PNG layout", [
          "Hald",
          "Tiled / Unreal",
        ])}
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
        {tool.controls
          .filter(
            (control) =>
              !(
                tool.id === "healing" &&
                p.method === "smart" &&
                control.key.startsWith("offset")
              ) &&
              !(
                edit.faces?.length &&
                ["centerX", "centerY", "radius"].includes(control.key)
              ),
          )
          .map((control) => (
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
