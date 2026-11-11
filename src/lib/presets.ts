import type { Recipe } from "./files";
import { defaults, type Edit, type Params } from "./catalog";
const CRS = "http://ns.adobe.com/camera-raw-settings/1.0/",
  STILL = "https://still.photo/ns/1.0/";
const bounded = (n: number, min = -100, max = 100) =>
  Math.max(min, Math.min(max, n));
export function parseXmp(text: string): Recipe {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error(
      "XMP documents with external declarations are not supported.",
    );
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Invalid XMP file.");
  const embedded = xml.getElementsByTagNameNS(STILL, "Recipe")[0]?.textContent;
  if (embedded) {
    try {
      return JSON.parse(embedded);
    } catch {
      throw new Error("The embedded Still recipe is invalid.");
    }
  }
  const values = new Map<string, string>();
  for (const el of Array.from(xml.getElementsByTagName("*"))) {
    for (const attr of Array.from(el.attributes))
      if (attr.namespaceURI === CRS || attr.prefix === "crs")
        values.set(attr.localName, attr.value);
    if (
      el.namespaceURI === CRS &&
      !el.children.length &&
      el.textContent?.trim()
    )
      values.set(el.localName, el.textContent.trim());
  }
  const n = (key: string) => {
      const value = Number(values.get(key));
      return Number.isFinite(value) ? value : 0;
    },
    has = (...keys: string[]) => keys.some((key) => values.has(key)),
    edits: Edit[] = [];
  const add = (tool: string, params: Params) =>
    edits.push({
      id: crypto.randomUUID(),
      tool,
      params: { ...defaults(tool), ...params },
    });
  if (
    has(
      "Exposure2012",
      "Exposure",
      "Temperature",
      "Tint",
      "Highlights2012",
      "Shadows2012",
      "Saturation",
      "Contrast2012",
      "Contrast",
      "Vibrance",
      "Whites2012",
      "Blacks2012",
    )
  ) {
    const p: Params = {
      exposure: bounded(
        n(values.has("Exposure2012") ? "Exposure2012" : "Exposure") * 50,
      ),
      temperature: values.has("Temperature")
        ? bounded((n("Temperature") - 5500) / 50)
        : 0,
      tint: bounded(n("Tint")),
      highlights: bounded(n("Highlights2012")),
      shadows: bounded(n("Shadows2012")),
      saturation: bounded(n("Saturation")),
      contrast: bounded(
        n(values.has("Contrast2012") ? "Contrast2012" : "Contrast"),
      ),
      ambiance: bounded(n("Vibrance")),
      whites: bounded(n("Whites2012")),
      blacks: bounded(n("Blacks2012")),
    };
    add("raw", p);
  }
  const curves: Params = { channel: "rgb" };
  let curveCount = 0;
  for (const [name, key] of [
    ["ToneCurvePV2012", "curveRGB"],
    ["ToneCurvePV2012Red", "curveRed"],
    ["ToneCurvePV2012Green", "curveGreen"],
    ["ToneCurvePV2012Blue", "curveBlue"],
    ["ToneCurve", "curveRGB"],
  ]) {
    const element = xml.getElementsByTagNameNS(CRS, name)[0];
    if (!element || curves[key]) continue;
    const points = Array.from(
      element.getElementsByTagNameNS(
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "li",
      ),
    ).map((item) => (item.textContent || "").split(",").map(Number));
    if (
      points.length >= 2 &&
      points.length <= 64 &&
      points.every(
        (point) =>
          point.length === 2 &&
          point.every((v) => Number.isFinite(v) && v >= 0 && v <= 255),
      )
    ) {
      points.sort((a, b) => a[0] - b[0]);
      curves[key] = JSON.stringify(
        points.map((point) => point.map((v) => v / 255)),
      );
      curveCount++;
    }
  }
  if (curveCount) add("curves", curves);
  if (has("Sharpness", "Clarity2012", "Clarity", "Texture"))
    add("details", {
      sharpening: bounded(n("Sharpness"), 0),
      structure: bounded(
        n("Clarity2012") * 0.7 + n("Clarity") * 0.7 + n("Texture") * 0.3,
        0,
      ),
    });
  for (const color of [
    "Red",
    "Orange",
    "Yellow",
    "Green",
    "Aqua",
    "Blue",
    "Purple",
    "Magenta",
  ])
    if (
      has(
        `HueAdjustment${color}`,
        `SaturationAdjustment${color}`,
        `LuminanceAdjustment${color}`,
      )
    )
      add("hsl", {
        range: color.toLowerCase(),
        hue: bounded(n(`HueAdjustment${color}`)),
        saturation: bounded(n(`SaturationAdjustment${color}`)),
        luminance: bounded(n(`LuminanceAdjustment${color}`)),
      });
  if (
    has(
      "SplitToningShadowHue",
      "SplitToningHighlightHue",
      "ColorGradeMidtoneHue",
    )
  )
    add("color-grade", {
      shadowHue: bounded(n("SplitToningShadowHue"), 0, 360),
      shadowSat: bounded(n("SplitToningShadowSaturation"), 0),
      midHue: bounded(n("ColorGradeMidtoneHue"), 0, 360),
      midSat: bounded(n("ColorGradeMidtoneSat"), 0),
      highHue: bounded(n("SplitToningHighlightHue"), 0, 360),
      highSat: bounded(n("SplitToningHighlightSaturation"), 0),
      balance: bounded(n("SplitToningBalance")),
    });
  if (has("Dehaze")) add("dehaze", { amount: bounded(n("Dehaze")) });
  if (has("PostCropVignetteAmount", "VignetteAmount"))
    add("vignette", {
      outer: bounded(
        n(
          values.has("PostCropVignetteAmount")
            ? "PostCropVignetteAmount"
            : "VignetteAmount",
        ),
      ),
      size: values.has("PostCropVignetteMidpoint")
        ? bounded(n("PostCropVignetteMidpoint"), 5, 95)
        : 50,
    });
  if (has("GrainAmount"))
    add("grain", { grain: bounded(n("GrainAmount"), 0), strength: 0 });
  if (n("CropAngle"))
    add("rotate", { angle: bounded(n("CropAngle"), -45, 45) });
  if (
    values.get("HasCrop")?.toLowerCase() === "true" &&
    has("CropLeft", "CropRight", "CropTop", "CropBottom")
  )
    add("crop", {
      left: bounded(n("CropLeft") * 100, 0, 90),
      right: bounded(
        (1 - (values.has("CropRight") ? n("CropRight") : 1)) * 100,
        0,
        90,
      ),
      top: bounded(n("CropTop") * 100, 0, 90),
      bottom: bounded(
        (1 - (values.has("CropBottom") ? n("CropBottom") : 1)) * 100,
        0,
        90,
      ),
    });
  if (!edits.length)
    throw new Error(
      "No supported tone, color, curve, detail, crop, or lens settings were found in this XMP.",
    );
  const name = xml.getElementsByTagNameNS(CRS, "Name")[0]?.textContent?.trim();
  return { version: 1, name: name?.slice(0, 100) || "Imported XMP", edits };
}
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function exportXmp(recipe: Recipe): string {
  const attributes: Record<string, string> = {
      ProcessVersion: "11.0",
      PresetType: "Normal",
    },
    curves: string[] = [];
  for (const edit of recipe.edits) {
    const p = edit.params,
      n = (key: string) => Number(p[key] || 0);
    if (edit.tool === "raw" || edit.tool === "tune") {
      const map = {
        contrast: "Contrast2012",
        highlights: "Highlights2012",
        shadows: "Shadows2012",
        saturation: "Saturation",
        ambiance: "Vibrance",
        whites: "Whites2012",
        blacks: "Blacks2012",
        tint: "Tint",
      };
      for (const [key, target] of Object.entries(map))
        if (key in p) attributes[target] = String(n(key));
      if ("exposure" in p) attributes.Exposure2012 = String(n("exposure") / 50);
      if (n("temperature") || n("warmth"))
        attributes.Temperature = String(
          Math.round(5500 + (n("temperature") + n("warmth")) * 50),
        );
    }
    if (edit.tool === "hsl") {
      const range = String(p.range || "all");
      if (range !== "all") {
        const color = range[0].toUpperCase() + range.slice(1);
        attributes[`HueAdjustment${color}`] = String(n("hue"));
        attributes[`SaturationAdjustment${color}`] = String(n("saturation"));
        attributes[`LuminanceAdjustment${color}`] = String(n("luminance"));
      }
    }
    if (edit.tool === "details") {
      attributes.Sharpness = String(n("sharpening"));
      attributes.Clarity2012 = String(n("structure"));
    }
    if (edit.tool === "dehaze") attributes.Dehaze = String(n("amount"));
    if (edit.tool === "vignette") {
      attributes.PostCropVignetteAmount = String(n("outer"));
      attributes.PostCropVignetteMidpoint = String(n("size"));
    }
    if (edit.tool === "grain") attributes.GrainAmount = String(n("grain"));
    if (edit.tool === "color-grade")
      for (const [key, target] of Object.entries({
        shadowHue: "SplitToningShadowHue",
        shadowSat: "SplitToningShadowSaturation",
        midHue: "ColorGradeMidtoneHue",
        midSat: "ColorGradeMidtoneSat",
        highHue: "SplitToningHighlightHue",
        highSat: "SplitToningHighlightSaturation",
        balance: "SplitToningBalance",
      }))
        attributes[target] = String(n(key));
    if (edit.tool === "rotate") attributes.CropAngle = String(n("angle"));
    if (edit.tool === "crop") {
      attributes.HasCrop = "True";
      attributes.CropLeft = String(n("left") / 100);
      attributes.CropRight = String(1 - n("right") / 100);
      attributes.CropTop = String(n("top") / 100);
      attributes.CropBottom = String(1 - n("bottom") / 100);
    }
    if (edit.tool === "curves")
      for (const [key, name] of [
        ["curveRGB", "ToneCurvePV2012"],
        ["curveRed", "ToneCurvePV2012Red"],
        ["curveGreen", "ToneCurvePV2012Green"],
        ["curveBlue", "ToneCurvePV2012Blue"],
      ]) {
        const points = p[key]
          ? JSON.parse(String(p[key]))
          : [
              [0, 0],
              [0.25, 0.25],
              [0.5, 0.5],
              [0.75, 0.75],
              [1, 1],
            ];
        curves.push(
          `<crs:${name}><rdf:Seq>${points.map((point: number[]) => `<rdf:li>${Math.round(point[0] * 255)}, ${Math.round(point[1] * 255)}</rdf:li>`).join("")}</rdf:Seq></crs:${name}>`,
        );
      }
  }
  return `<?xpacket begin="\ufeff"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="${CRS}" xmlns:still="${STILL}" ${Object.entries(
    attributes,
  )
    .map(([k, v]) => `crs:${k}="${escape(v)}"`)
    .join(
      " ",
    )}><crs:Name><rdf:Alt><rdf:li xml:lang="x-default">${escape(recipe.name)}</rdf:li></rdf:Alt></crs:Name>${curves.join("")}<still:Recipe>${escape(JSON.stringify(recipe))}</still:Recipe></rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
}
