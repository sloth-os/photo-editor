import {
  Pencil,
  Highlighter,
  ArrowUpRight,
  Minus,
  Spline,
  Square,
  RectangleHorizontal,
  Circle,
  Triangle,
  Star,
  Hash,
  MousePointer2,
  Undo2,
  Trash2,
} from "lucide-react";
import type { Edit } from "../lib/catalog";
type Props = {
  edit: Edit;
  setParam: (key: string, value: number | string) => void;
  onAction: (action: "undo" | "clear" | "delete") => void;
  selected: boolean;
};
const modes = [
  ["pen", "Pen", Pencil],
  ["highlighter", "Highlighter", Highlighter],
  ["arrow", "Arrow", ArrowUpRight],
  ["line", "Line", Minus],
  ["curve", "Curve", Spline],
  ["rectangle", "Rectangle", Square],
  ["rounded-rectangle", "Rounded box", RectangleHorizontal],
  ["ellipse", "Ellipse", Circle],
  ["triangle", "Triangle", Triangle],
  ["star", "Star", Star],
  ["number", "Number", Hash],
  ["select", "Select / move", MousePointer2],
] as const;
const swatches = [
  ["Red", "#ef6351"],
  ["Orange", "#f6a545"],
  ["Yellow", "#ffe48a"],
  ["Green", "#73bd8c"],
  ["Blue", "#579be7"],
  ["Purple", "#b189df"],
  ["White", "#ffffff"],
  ["Black", "#111111"],
];
export default function DrawingControls({
  edit,
  setParam,
  onAction,
  selected,
}: Props) {
  const p = edit.params,
    drawing = edit.tool === "draw" || edit.tool === "brush",
    mode = String(p.drawMode || "pen"),
    erasing = ["pen", "highlighter"].includes(mode) && p.brush === "eraser";
  const choices = (key: string, label: string, items: [string, string][]) => (
    <div className="choice-section">
      <label className="field-label" htmlFor={`draw-${key}`}>
        {label}
      </label>
      <select
        id={`draw-${key}`}
        value={String(p[key] || items[0][0])}
        onChange={(e) => setParam(key, e.target.value)}
      >
        {items.map(([value, text]) => (
          <option value={value} key={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
  const paint = (key: string, label: string) => (
    <div className="color-field">
      <label htmlFor={`draw-${key}`}>{label}</label>
      <input
        id={`draw-${key}`}
        type="color"
        value={String(p[key] || "#ef6351")}
        onChange={(e) => setParam(key, e.target.value)}
      />
    </div>
  );
  return (
    <div className="drawing-controls">
      {drawing && (
        <>
          <span className="field-label">
            {edit.tool === "brush" ? "Color brush" : "Drawing tool"}
          </span>
          <div className="drawing-modes" role="group" aria-label="Drawing tool">
            {modes
              .filter(
                ([value]) =>
                  edit.tool !== "brush" ||
                  ["pen", "highlighter"].includes(value),
              )
              .map(([value, label, Icon]) => (
                <button
                  key={value}
                  className={mode === value ? "selected" : ""}
                  aria-pressed={mode === value}
                  onClick={() => {
                    setParam("drawMode", value);
                    if (value === "highlighter") {
                      setParam("opacity", 35);
                      setParam("color", "#ffe48a");
                    } else if (mode === "highlighter") setParam("opacity", 100);
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
          </div>
          {["pen", "highlighter"].includes(mode) &&
            choices("brush", "Brush type", [
              ["round", "Round pen"],
              ["square", "Square tip"],
              ["marker", "Marker"],
              ["airbrush", "Airbrush"],
              ["calligraphy", "Calligraphy nib"],
              ["crayon", "Crayon"],
              ["eraser", "Eraser · this layer"],
            ])}
          {mode === "number" && (
            <div className="choice-section">
              <label className="field-label" htmlFor="next-number">
                Next number
              </label>
              <input
                id="next-number"
                className="text-input"
                type="number"
                inputMode="numeric"
                min="1"
                max="999"
                value={Number(p.nextNumber || 1)}
                onChange={(e) =>
                  setParam(
                    "nextNumber",
                    Math.max(1, Math.min(999, Number(e.target.value) || 1)),
                  )
                }
              />
            </div>
          )}
          {[
            "line",
            "arrow",
            "curve",
            "rectangle",
            "rounded-rectangle",
            "ellipse",
            "triangle",
            "star",
          ].includes(mode) && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!!p.dashed}
                onChange={(e) => setParam("dashed", e.target.checked ? 1 : 0)}
              />{" "}
              Dashed stroke
            </label>
          )}
          {mode === "arrow" && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!!p.twoHeads}
                onChange={(e) => setParam("twoHeads", e.target.checked ? 1 : 0)}
              />{" "}
              Arrowheads at both ends
            </label>
          )}
          {[
            "rectangle",
            "rounded-rectangle",
            "ellipse",
            "triangle",
            "star",
          ].includes(mode) && (
            <>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={!!p.filled}
                  onChange={(e) => setParam("filled", e.target.checked ? 1 : 0)}
                />{" "}
                Fill shape
              </label>
              {!!p.filled && paint("fillColor", "Shape fill color")}
            </>
          )}
        </>
      )}
      {edit.tool === "privacy" && (
        <>
          <label className="field-label" htmlFor="privacy-effect">
            Effect
          </label>
          <select
            id="privacy-effect"
            value={String(p.effect || "blur")}
            onChange={(e) => {
              const value = e.target.value;
              setParam("effect", value);
              setParam("opacity", value === "highlight" ? 35 : 100);
              if (value === "highlight") setParam("color", "#ffe48a");
              if (value === "redact") setParam("color", "#111111");
              if (value === "spotlight") setParam("strength", 65);
            }}
          >
            <option value="blur">Blur</option>
            <option value="pixelate">Pixelate</option>
            <option value="redact">Redact · opaque cover</option>
            <option value="highlight">Highlight</option>
            <option value="spotlight">Spotlight</option>
          </select>
          {choices("region", "Selection shape", [
            ["rectangle", "Rectangle"],
            ["ellipse", "Ellipse"],
            ["brush", "Paint selection"],
          ])}
        </>
      )}
      {edit.tool === "fill" && (
        <>
          {choices("scope", "Fill area", [
            ["connected", "Connected area"],
            ["matching", "Matching colors"],
            ["canvas", "Entire image"],
          ])}
          {choices("fillMode", "Fill mode", [
            ["color", "Color"],
            ["clear", "Clear to transparency"],
          ])}
        </>
      )}
      {((drawing && mode !== "select" && !erasing) ||
        (edit.tool === "fill" && p.fillMode !== "clear") ||
        (edit.tool === "privacy" &&
          ["redact", "highlight"].includes(String(p.effect)))) && (
        <>
          {paint(
            "color",
            drawing
              ? "Brush color"
              : edit.tool === "fill"
                ? "Fill color"
                : "Effect color",
          )}
          <div
            className="drawing-swatches"
            role="group"
            aria-label="Paint colors"
          >
            {swatches.map(([name, color]) => (
              <button
                key={name}
                aria-label={`${name} paint`}
                aria-pressed={p.color === color}
                style={{ background: color }}
                onClick={() => setParam("color", color)}
              />
            ))}
          </div>
        </>
      )}
      {selected && (
        <button
          className="secondary-button full"
          onClick={() => onAction("delete")}
        >
          <Trash2 size={15} /> Delete selected mark
        </button>
      )}
      <div className="drawing-actions">
        <button
          className="secondary-button"
          disabled={!edit.marks?.length}
          onClick={() => onAction("undo")}
        >
          <Undo2 size={15} /> Undo mark
        </button>
        <button
          className="secondary-button"
          disabled={!edit.marks?.length}
          onClick={() => onAction("clear")}
        >
          <Trash2 size={15} /> Clear layer
        </button>
      </div>
      <p className="analysis-note">
        {edit.marks?.length || 0} {edit.marks?.length === 1 ? "mark" : "marks"}{" "}
        · colors and styles stay with each mark.
      </p>
      {erasing && (
        <p className="analysis-note">
          Erase removes marks from this drawing layer. Reopen an applied drawing
          in Edits to erase it.
        </p>
      )}
    </div>
  );
}
