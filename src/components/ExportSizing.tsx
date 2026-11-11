import { Slider } from "./ui";
import type { Dimensions } from "../lib/output";
export default function ExportSizing({
  size,
  mode,
  setMode,
  width,
  height,
  setWidth,
  setHeight,
  percent,
  setPercent,
  limit,
  setLimit,
  targetKB,
  setTargetKB,
  idPhoto,
}: {
  size: Dimensions;
  mode: string;
  setMode: (mode: string) => void;
  width: string;
  height: string;
  setWidth: (value: string) => void;
  setHeight: (value: string) => void;
  percent: number;
  setPercent: (value: number) => void;
  limit: boolean;
  setLimit: (value: boolean) => void;
  targetKB: string;
  setTargetKB: (value: string) => void;
  idPhoto: boolean;
}) {
  return (
    <>
      <div className="export-field">
        <label className="field-label" htmlFor="export-size">
          Image size
        </label>
        <select
          id="export-size"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="original">
            Full working resolution · {size.width} × {size.height} px
          </option>
          <option value="2048">Large · up to 2048 px</option>
          <option value="1080">Social · up to 1080 px</option>
          <option value="720">Small · up to 720 px</option>
          <option value="percent">Reduce by percentage</option>
          <option value="custom">Custom dimensions</option>
        </select>
        {mode === "custom" && (
          <>
            <div className="export-dimensions">
              <label>
                Width (px)
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="6000"
                  aria-label="Export width"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <span aria-hidden="true">×</span>
              <label>
                Height (px)
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="6000"
                  aria-label="Export height"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </label>
            </div>
            <p className="analysis-note">
              Proportions stay locked. Resizing never enlarges the photo.
            </p>
          </>
        )}
        {mode === "percent" && (
          <>
            <div className="choice-row export-percent">
              {[25, 50, 75].map((value) => (
                <button
                  key={value}
                  aria-pressed={percent === value}
                  className={percent === value ? "selected" : ""}
                  onClick={() => setPercent(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
            <Slider
              control={{
                key: "percent",
                label: "Size percentage",
                min: 1,
                max: 100,
                value: 50,
              }}
              value={percent}
              onChange={setPercent}
            />
          </>
        )}
      </div>
      <label className="inline-check export-limit">
        <input
          type="checkbox"
          checked={limit}
          onChange={(e) => setLimit(e.target.checked)}
        />{" "}
        Limit file size
      </label>
      {limit && (
        <>
          <label className="field-label" htmlFor="export-kb">
            Maximum file size (KB)
          </label>
          <input
            id="export-kb"
            type="number"
            inputMode="numeric"
            min="1"
            max="50000"
            className="text-input"
            value={targetKB}
            onChange={(e) => setTargetKB(e.target.value)}
          />
          <p className="analysis-note">
            {idPhoto
              ? "ID photo dimensions stay fixed. JPG usually produces the smallest file."
              : "Quality adjusts to fit the limit. Dimensions may reduce further if needed; PNG stays lossless."}
          </p>
        </>
      )}
    </>
  );
}
