import { useRef, useState } from "react";
import {
  Upload,
  Scissors,
  ScanFace,
  Type,
  WandSparkles,
  FlipHorizontal2,
  FlipVertical2,
  Palette,
} from "lucide-react";
import { type Edit, type Tool, visibleControls } from "../lib/catalog";
import { ACCEPT } from "../lib/files";
import { Slider } from "./ui";

type Props = {
  tool: Tool;
  edit: Edit;
  setParam: (key: string, value: number | string) => void;
  onExpand: () => void;
  onOverlay: (file: File) => void;
  onCollage: (files: File[]) => void;
  onAnalyze: (kind: "face" | "subject") => void;
  onAuto: () => void;
};
/** One large adjustment at a time keeps the photograph available for touch work. */
export default function TouchAdjustments({
  tool,
  edit,
  setParam,
  onExpand,
  onOverlay,
  onCollage,
  onAnalyze,
  onAuto,
}: Props) {
  const [selected, setSelected] = useState(""),
    input = useRef<HTMLInputElement>(null),
    controls = visibleControls(tool, edit),
    control = controls.find((c) => c.key === selected) || controls[0],
    p = edit.params;
  let action:
    { label: string; icon: typeof Upload; run: () => void } | undefined;
  if (tool.id === "collage")
    action = {
      label: "Add photos",
      icon: Upload,
      run: () => input.current?.click(),
    };
  else if (tool.id === "double")
    action = {
      label: "Add second photo",
      icon: Upload,
      run: () => input.current?.click(),
    };
  else if (tool.id === "background")
    action = {
      label: edit.mask ? "Recalculate cutout" : "Remove background",
      icon: Scissors,
      run: () => onAnalyze("subject"),
    };
  else if (["portrait", "skin", "head-pose"].includes(tool.id))
    action = {
      label: "Detect faces automatically",
      icon: ScanFace,
      run: () => onAnalyze("face"),
    };
  else if (tool.id === "text")
    action = { label: "Edit words", icon: Type, run: onExpand };
  else if (tool.id === "sticker")
    action = {
      label: "Choose sticker or overlay",
      icon: Palette,
      run: onExpand,
    };
  else if (tool.id === "lut")
    action = { label: "Import LUT", icon: Upload, run: onExpand };
  else if (tool.id === "tune")
    action = { label: "Auto adjust", icon: WandSparkles, run: onAuto };
  return (
    <div className="touch-adjustments">
      <input
        hidden
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={tool.id === "collage"}
        data-testid="touch-asset-files"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) {
            if (tool.id === "collage") onCollage(files);
            else onOverlay(files[0]);
          }
          e.target.value = "";
        }}
      />
      {control ? (
        <Slider
          control={control}
          value={Number(p[control.key] ?? control.value)}
          onChange={(v) => setParam(control.key, v)}
          labelSlot={
            <div className="touch-parameter">
              <select
                aria-label="Choose adjustment"
                value={control.key}
                onChange={(e) => setSelected(e.target.value)}
              >
                {controls.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              {action && (
                <button
                  className="touch-tool-action"
                  aria-label={action.label}
                  title={action.label}
                  onClick={action.run}
                >
                  <action.icon size={20} />
                </button>
              )}
            </div>
          }
        />
      ) : tool.id === "flip" ? (
        <div className="touch-flips">
          <button
            aria-pressed={!!p.flipX}
            onClick={() => setParam("flipX", p.flipX ? 0 : 1)}
          >
            <FlipHorizontal2 size={20} /> Mirror
          </button>
          <button
            aria-pressed={!!p.flipY}
            onClick={() => setParam("flipY", p.flipY ? 0 : 1)}
          >
            <FlipVertical2 size={20} /> Flip
          </button>
        </div>
      ) : (
        <button className="secondary-button full" onClick={onExpand}>
          Show controls
        </button>
      )}
    </div>
  );
}
