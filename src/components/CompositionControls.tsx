import { useRef } from "react";
import {
  Upload,
  ArrowLeft,
  ArrowRight,
  Trash2,
  FlipHorizontal2,
  FlipVertical2,
  Scissors,
} from "lucide-react";
import type { Edit } from "../lib/catalog";
import { ACCEPT } from "../lib/files";
import { compositionOrder, stickers } from "../lib/composition";

type Props = {
  edit: Edit;
  thumbnail: string;
  setParam: (key: string, value: string | number) => void;
  onPatch: (patch: Partial<Edit>) => void;
  onOverlay: (file: File) => void;
  onCollageFiles: (files: File[]) => void;
  onAnalyze: () => void;
};
export default function CompositionControls({
  edit,
  thumbnail,
  setParam,
  onPatch,
  onOverlay,
  onCollageFiles,
  onAnalyze,
}: Props) {
  const input = useRef<HTMLInputElement>(null),
    { params: p } = edit;
  const select = (key: string, label: string, options: [string, string][]) => (
    <div className="choice-section">
      <label className="field-label" htmlFor={`compose-${key}`}>
        {label}
      </label>
      <select
        id={`compose-${key}`}
        value={String(p[key] ?? options[0][0])}
        onChange={(e) => setParam(key, e.target.value)}
      >
        {options.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
  const color = (label: string) => (
    <div className="color-field">
      <label htmlFor="composition-color">{label}</label>
      <input
        id="composition-color"
        type="color"
        value={String(p.color || "#f3f0e8")}
        onChange={(e) => setParam("color", e.target.value)}
      />
    </div>
  );
  const flips = (
    <div
      className="composition-flips"
      role="group"
      aria-label="Flip and mirror"
    >
      <button
        className={p.flipX ? "selected" : ""}
        aria-pressed={!!p.flipX}
        onClick={() => setParam("flipX", p.flipX ? 0 : 1)}
      >
        <FlipHorizontal2 size={17} /> Mirror horizontally
      </button>
      <button
        className={p.flipY ? "selected" : ""}
        aria-pressed={!!p.flipY}
        onClick={() => setParam("flipY", p.flipY ? 0 : 1)}
      >
        <FlipVertical2 size={17} /> Flip vertically
      </button>
    </div>
  );
  if (edit.tool === "flip") return flips;
  if (edit.tool === "collage") {
    const images = edit.images || [],
      order = compositionOrder(images.length + 1, p.order);
    const move = (at: number, direction: number) => {
      const next = [...order];
      [next[at], next[at + direction]] = [next[at + direction], next[at]];
      setParam("order", JSON.stringify(next));
    };
    return (
      <div className="composition-controls">
        <input
          hidden
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          data-testid="collage-files"
          onChange={(e) => {
            if (e.target.files?.length)
              onCollageFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <button
          className="secondary-button full"
          disabled={images.length >= 8}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} /> Add photos · {images.length + 1}/9
        </button>
        <ol className="collage-sources" aria-label="Collage photos">
          {order.map((index, at) => (
            <li key={index}>
              <img
                src={index === 0 ? thumbnail : images[index - 1]}
                alt={index === 0 ? "Current edit" : `Photo ${index + 1}`}
              />
              <div>
                <span>
                  {index === 0 ? "Current edit" : `Photo ${index + 1}`}
                </span>
                <div className="collage-source-actions">
                  <button
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={at === 0}
                    onClick={() => move(at, -1)}
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={at === order.length - 1}
                    onClick={() => move(at, 1)}
                  >
                    <ArrowRight size={14} />
                  </button>
                  {index > 0 && (
                    <button
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() =>
                        onPatch({
                          images: images.filter((_, i) => i !== index - 1),
                          params: {
                            ...p,
                            order: JSON.stringify(
                              order
                                .filter((i) => i !== index)
                                .map((i) => (i > index ? i - 1 : i)),
                            ),
                          },
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {select("layout", "Layout", [
          ["grid", "Collage grid"],
          ["horizontal", "Stitch horizontally"],
          ["vertical", "Stitch vertically"],
        ])}
        {p.layout === "grid" && (
          <>
            {select("columns", "Columns", [
              ["1", "One"],
              ["2", "Two"],
              ["3", "Three"],
              ["4", "Four"],
            ])}
            {select("ratio", "Canvas ratio", [
              ["1:1", "Square · 1:1"],
              ["4:5", "Portrait · 4:5"],
              ["3:2", "Landscape · 3:2"],
              ["16:9", "Wide · 16:9"],
              ["original", "Original ratio"],
            ])}
            {select("fit", "Photo fit", [
              ["cover", "Fill each cell"],
              ["contain", "Show entire photo"],
            ])}
          </>
        )}
        {color("Canvas color")}
        {images.length === 0 && (
          <p className="analysis-note">
            Add a photo to start your composition. Your current edit stays in
            the collage.
          </p>
        )}
      </div>
    );
  }
  if (edit.tool === "background")
    return (
      <div className="composition-controls">
        <button className="secondary-button full" onClick={onAnalyze}>
          <Scissors size={16} />
          {edit.mask ? "Recalculate cutout" : "Remove background"}
        </button>
        {edit.mask && (
          <p className="analysis-note">
            Background removed on this device. Refine the edge below.
          </p>
        )}
        {select("fill", "New background", [
          ["transparent", "Transparent"],
          ["color", "Solid color"],
          ["image", "Another photo"],
        ])}
        {p.fill === "color" && color("Background color")}
        {p.fill === "image" && (
          <>
            <input
              hidden
              ref={input}
              type="file"
              accept={ACCEPT}
              data-testid="background-file"
              onChange={(e) => {
                if (e.target.files?.[0]) onOverlay(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <button
              className="secondary-button full"
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              {edit.image
                ? "Replace background photo"
                : "Choose background photo"}
            </button>
          </>
        )}
      </div>
    );
  if (edit.tool === "sticker")
    return (
      <div className="composition-controls">
        <span className="field-label">Sticker collection</span>
        <div className="sticker-picker" role="group" aria-label="Stickers">
          {stickers.map((sticker) => (
            <button
              key={sticker.id}
              aria-label={sticker.name}
              aria-pressed={!edit.image && p.sticker === sticker.id}
              className={
                !edit.image && p.sticker === sticker.id ? "selected" : ""
              }
              onClick={() =>
                onPatch({
                  image: undefined,
                  params: { ...p, sticker: sticker.id },
                })
              }
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <path d={sticker.path} />
              </svg>
            </button>
          ))}
        </div>
        <input
          hidden
          ref={input}
          type="file"
          accept={ACCEPT}
          data-testid="overlay-file"
          onChange={(e) => {
            if (e.target.files?.[0]) onOverlay(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <button
          className="secondary-button full"
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {edit.image ? "Replace image overlay" : "Import image overlay"}
        </button>
        {!edit.image && color("Sticker color")}
        {select("blend", "Overlay blend", [
          ["normal", "Normal"],
          ["screen", "Screen"],
          ["multiply", "Multiply"],
          ["overlay", "Overlay"],
        ])}
        {flips}
      </div>
    );
  return null;
}
