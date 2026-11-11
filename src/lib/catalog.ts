import type { LucideIcon } from "lucide-react";
import {
  SlidersHorizontal,
  Focus,
  Spline,
  Thermometer,
  Crop,
  RotateCw,
  Scan,
  Expand,
  CircleDot,
  Paintbrush,
  Eraser,
  Mountain,
  Sparkles,
  SunMoon,
  CloudLightning,
  Camera,
  Film,
  History,
  Layers,
  CircleDashed,
  Eclipse,
  UserRound,
  ScanFace,
  Radius,
  Blend,
  Type,
  Frame,
  Aperture,
  FileImage,
  Palette,
  CircleGauge,
  CloudSun,
  Wind,
  Sun,
  Flame,
  Box,
  FlipHorizontal2,
  LayoutGrid,
  Sticker,
  Scissors,
  Smile,
} from "lucide-react";

export type Params = Record<string, number | string>;
export type StrokePoint = {
  x: number;
  y: number;
  radius: number;
  amount: number;
};
export type Edit = {
  id: string;
  tool: string;
  params: Params;
  points?: StrokePoint[];
  image?: string;
  images?: string[];
  mask?: string;
  depth?: string;
  faces?: { x: number; y: number; z: number }[][];
  mesh?: [number, number, number][];
};
export type Control = {
  key: string;
  label: string;
  min: number;
  max: number;
  value: number;
  step?: number;
};
export type Tool = {
  id: string;
  name: string;
  icon: LucideIcon;
  group: string;
  description: string;
  controls: Control[];
  hint?: string;
};
const c = (
  key: string,
  label: string,
  value = 0,
  min = -100,
  max = 100,
  step = 1,
): Control => ({ key, label, min, max, value, step });

export const tools: Tool[] = [
  {
    id: "tune",
    name: "Tune image",
    icon: SlidersHorizontal,
    group: "Essentials",
    description: "Find a little balance.",
    controls: [
      c("brightness", "Brightness"),
      c("contrast", "Contrast"),
      c("saturation", "Saturation"),
      c("ambiance", "Ambiance"),
      c("highlights", "Highlights"),
      c("shadows", "Shadows"),
      c("warmth", "Warmth"),
    ],
  },
  {
    id: "details",
    name: "Details",
    icon: Focus,
    group: "Essentials",
    description: "Bring the little things into focus.",
    controls: [
      c("structure", "Structure", 0, 0),
      c("sharpening", "Sharpening", 0, 0),
    ],
  },
  {
    id: "curves",
    name: "Curves",
    icon: Spline,
    group: "Essentials",
    description: "Shape the light, tone by tone.",
    controls: [
      c("blacks", "Blacks"),
      c("shadows", "Shadows"),
      c("midtones", "Midtones"),
      c("highlights", "Highlights"),
      c("whites", "Whites"),
    ],
    hint: "Each point controls a tonal range. Choose a channel below.",
  },
  {
    id: "white-balance",
    name: "White balance",
    icon: Thermometer,
    group: "Essentials",
    description: "Make every color feel right.",
    controls: [c("temperature", "Temperature"), c("tint", "Tint")],
  },
  {
    id: "crop",
    name: "Crop",
    icon: Crop,
    group: "Transform",
    description: "Keep what matters.",
    controls: [
      c("left", "Left", 0, 0, 45),
      c("right", "Right", 0, 0, 45),
      c("top", "Top", 0, 0, 45),
      c("bottom", "Bottom", 0, 0, 45),
    ],
  },
  {
    id: "rotate",
    name: "Rotate",
    icon: RotateCw,
    group: "Transform",
    description: "A fresh perspective starts here.",
    controls: [c("angle", "Straighten", 0, -45, 45)],
  },
  {
    id: "flip",
    name: "Flip & mirror",
    icon: FlipHorizontal2,
    group: "Transform",
    description: "See the other side of your moment.",
    controls: [],
    hint: "Mirror left to right, flip top to bottom, or combine both. Apply to keep the change editable.",
  },
  {
    id: "collage",
    name: "Collage & stitch",
    icon: LayoutGrid,
    group: "Transform",
    description: "A few moments, together.",
    controls: [c("gap", "Spacing", 2, 0, 10)],
    hint: "Create a collage grid or choose horizontal or vertical stitching. Your current edit is the first photo. Add up to eight more and reorder them. Everything stays editable in the stack.",
  },
  {
    id: "perspective",
    name: "Perspective",
    icon: Scan,
    group: "Transform",
    description: "Give your lines a little direction.",
    controls: [
      c("horizontal", "Horizontal"),
      c("vertical", "Vertical"),
      c("scale", "Scale", 0, 0, 50),
    ],
  },
  {
    id: "expand",
    name: "Expand",
    icon: Expand,
    group: "Transform",
    description: "A little more room to breathe.",
    controls: [c("amount", "Border size", 10, 0, 50)],
    hint: "Smart fill synthesizes nearby texture to extend the scene. Reflect and solid fills are also available.",
  },
  {
    id: "selective",
    name: "Selective",
    icon: CircleDot,
    group: "Local adjustments",
    description: "Put the light exactly where you want it.",
    controls: [
      c("brightness", "Brightness", 25),
      c("contrast", "Contrast"),
      c("saturation", "Saturation"),
      c("radius", "Selection size", 25, 5, 75),
    ],
    hint: "Tap your photo to position the control point.",
  },
  {
    id: "brush",
    name: "Brush",
    icon: Paintbrush,
    group: "Local adjustments",
    description: "Paint in your finishing touches.",
    controls: [c("amount", "Strength", 30), c("size", "Brush size", 8, 1, 40)],
    hint: "Paint on the photo. Change the brush mode below.",
  },
  {
    id: "healing",
    name: "Healing",
    icon: Eraser,
    group: "Local adjustments",
    description: "Let the distractions disappear.",
    controls: [
      c("size", "Brush size", 5, 1, 20),
      c("offsetX", "Source offset X", 12, -40, 40),
      c("offsetY", "Source offset Y", 0, -40, 40),
    ],
    hint: "Paint over a small distraction. Content-aware healing matches surrounding texture; Clone uses a chosen source offset.",
  },
  {
    id: "hdr",
    name: "HDR scape",
    icon: Mountain,
    group: "Creative",
    description: "Every highlight. Every hidden detail.",
    controls: [
      c("strength", "Filter strength", 35, 0),
      c("brightness", "Brightness"),
      c("saturation", "Saturation"),
    ],
  },
  {
    id: "glamour",
    name: "Glamour glow",
    icon: Sparkles,
    group: "Creative",
    description: "A soft light, a little daydream.",
    controls: [
      c("glow", "Glow", 40, 0),
      c("saturation", "Saturation"),
      c("warmth", "Warmth"),
    ],
  },
  {
    id: "tonal",
    name: "Tonal contrast",
    icon: SunMoon,
    group: "Creative",
    description: "Depth in every shade.",
    controls: [
      c("high", "High tones", 30, 0),
      c("mid", "Mid tones", 35, 0),
      c("low", "Low tones", 30, 0),
    ],
  },
  {
    id: "drama",
    name: "Drama",
    icon: CloudLightning,
    group: "Creative",
    description: "Let the moment make a statement.",
    controls: [
      c("strength", "Filter strength", 50, 0),
      c("saturation", "Saturation", -20),
    ],
  },
  {
    id: "vintage",
    name: "Vintage",
    icon: Camera,
    group: "Creative",
    description: "A memory in the making.",
    controls: [
      c("strength", "Style strength", 55, 0),
      c("brightness", "Brightness"),
      c("saturation", "Saturation", -15),
      c("vignette", "Vignette", 25, 0),
    ],
  },
  {
    id: "grain",
    name: "Grainy film",
    icon: Film,
    group: "Creative",
    description: "That imperfect, analog feeling.",
    controls: [
      c("grain", "Grain", 35, 0),
      c("strength", "Style strength", 30, 0),
    ],
  },
  {
    id: "retrolux",
    name: "Retrolux",
    icon: History,
    group: "Creative",
    description: "A little light from another time.",
    controls: [
      c("strength", "Style strength", 45, 0),
      c("leaks", "Light leaks", 30, 0),
      c("scratches", "Scratches", 15, 0),
    ],
  },
  {
    id: "grunge",
    name: "Grunge",
    icon: Layers,
    group: "Creative",
    description: "Beautifully rough around the edges.",
    controls: [
      c("strength", "Style strength", 45, 0),
      c("texture", "Texture", 35, 0),
      c("brightness", "Brightness"),
    ],
  },
  {
    id: "bw",
    name: "Black & white",
    icon: CircleDashed,
    group: "Creative",
    description: "Less color. More feeling.",
    controls: [
      c("brightness", "Brightness"),
      c("contrast", "Contrast", 20),
      c("grain", "Grain", 0, 0),
    ],
  },
  {
    id: "noir",
    name: "Noir",
    icon: Eclipse,
    group: "Creative",
    description: "Find the story in the shadows.",
    controls: [
      c("brightness", "Brightness", -10),
      c("contrast", "Contrast", 40),
      c("grain", "Grain", 20, 0),
      c("wash", "Wash", 20, 0),
    ],
  },
  {
    id: "portrait",
    name: "Portrait",
    icon: UserRound,
    group: "Portrait",
    description: "A little light for the person in frame.",
    controls: [
      c("spotlight", "Face spotlight", 25, 0),
      c("smooth", "Skin smoothing", 30, 0),
      c("eyes", "Eye clarity", 20, 0),
      c("centerX", "Face center X", 50, 0),
      c("centerY", "Face center Y", 40, 0),
      c("radius", "Face size", 25, 5, 60),
    ],
    hint: "Detect faces on-device for precise face and eye adjustments, or position the face area manually.",
  },
  {
    id: "skin",
    name: "Skin retouch",
    icon: Smile,
    group: "Portrait",
    description: "A softer finish, with texture intact.",
    controls: [
      c("smooth", "Skin smoothing", 35, 0),
      c("whiten", "Skin whitening", 0, 0),
      c("centerX", "Face center X", 50, 0),
      c("centerY", "Face center Y", 40, 0),
      c("radius", "Face size", 25, 5, 60),
    ],
    hint: "Detect a face or tap to place the retouch area. Smoothing and whitening target skin tones, with edges, eyes, and lips protected.",
  },
  {
    id: "head-pose",
    name: "Head pose",
    icon: ScanFace,
    group: "Portrait",
    description: "Make a subtle shift.",
    controls: [
      c("yaw", "Turn"),
      c("pitch", "Tilt"),
      c("smile", "Smile", 0, 0),
      c("pupils", "Eye size", 0, 0),
      c("centerX", "Face center X", 50, 0),
      c("centerY", "Face center Y", 40, 0),
      c("radius", "Face size", 25, 5, 60),
    ],
    hint: "Detect a face to rotate its estimated 3D mesh and refine eyes or smile. Small pose changes preserve the most detail; manual placement remains available.",
  },
  {
    id: "lens-blur",
    name: "Lens blur",
    icon: Radius,
    group: "Finishing",
    description: "Bring your subject into its own.",
    controls: [
      c("strength", "Blur strength", 40, 0),
      c("transition", "Transition", 35, 0),
      c("size", "Focus size", 30, 5, 80),
      c("angle", "Focus angle", 0, -180, 180),
      c("vignette", "Vignette", 15, 0),
    ],
    hint: "Tap the photo to position the focus area.",
  },
  {
    id: "vignette",
    name: "Vignette",
    icon: Aperture,
    group: "Finishing",
    description: "Draw the eye to the heart of it.",
    controls: [
      c("outer", "Outer brightness", -45),
      c("inner", "Inner brightness", 0),
      c("size", "Center size", 50, 5, 95),
    ],
    hint: "Tap the photo to position the center.",
  },
  {
    id: "double",
    name: "Double exposure",
    icon: Blend,
    group: "Finishing",
    description: "Two moments, one new story.",
    controls: [c("opacity", "Opacity", 50, 0)],
    hint: "Add a second photo and choose how the two blend.",
  },
  {
    id: "sticker",
    name: "Stickers & overlay",
    icon: Sticker,
    group: "Finishing",
    description: "Make the moment your own.",
    controls: [
      c("size", "Size", 25, 2, 150),
      c("rotation", "Rotation", 0, -180, 180),
      c("opacity", "Opacity", 100, 0),
      c("positionX", "Horizontal", 50, 0),
      c("positionY", "Vertical", 50, 0),
    ],
    hint: "Choose an offline sticker or import a transparent image. Tap the photo to position it. Apply, then add another layer.",
  },
  {
    id: "background",
    name: "Remove background",
    icon: Scissors,
    group: "Local adjustments",
    description: "Keep your subject. Set a new scene.",
    controls: [
      c("edge", "Edge refinement", 0, -30, 30),
      c("feather", "Edge softness", 15, 0, 100),
    ],
    hint: "Background removal runs on this device. Keep transparency, choose a color, or add a new photo. Export PNG or WebP to retain transparency.",
  },
  {
    id: "text",
    name: "Text",
    icon: Type,
    group: "Finishing",
    description: "Give your moment a few words.",
    controls: [
      c("size", "Size", 10, 2, 40),
      c("rotation", "Text rotation", 0, -180, 180),
      c("opacity", "Opacity", 100, 0),
      c("positionX", "Horizontal", 50, 0),
      c("positionY", "Vertical", 50, 0),
    ],
  },
  {
    id: "frames",
    name: "Frames",
    icon: Frame,
    group: "Finishing",
    description: "The perfect little finishing touch.",
    controls: [c("width", "Frame width", 5, 1, 20)],
  },
  {
    id: "raw",
    name: "RAW develop",
    icon: FileImage,
    group: "Essentials",
    description: "Start with the finest foundation.",
    controls: [
      c("exposure", "Exposure"),
      c("highlights", "Highlights"),
      c("shadows", "Shadows"),
      c("temperature", "Temperature"),
      c("tint", "Tint"),
      c("saturation", "Saturation"),
    ],
    hint: "Camera RAW files develop locally in 16-bit linear RGB. Exposure, white balance, and tone adjustments apply before conversion to the display image. Original RAW bytes are kept for re-editing.",
  },
  {
    id: "hsl",
    name: "Color HSL",
    icon: Palette,
    group: "Essentials",
    description: "Every color has a story.",
    controls: [
      c("hue", "Hue"),
      c("saturation", "Saturation"),
      c("luminance", "Luminance"),
    ],
    hint: "Choose a color range to adjust independently.",
  },
  {
    id: "color-grade",
    name: "Color grade",
    icon: CircleGauge,
    group: "Creative",
    description: "Set a mood in three tones.",
    controls: [
      c("shadowHue", "Shadow hue", 210, 0, 360),
      c("shadowSat", "Shadow color", 20, 0),
      c("midHue", "Midtone hue", 30, 0, 360),
      c("midSat", "Midtone color", 10, 0),
      c("highHue", "Highlight hue", 45, 0, 360),
      c("highSat", "Highlight color", 15, 0),
      c("balance", "Balance"),
    ],
  },
  {
    id: "dehaze",
    name: "Dehaze",
    icon: CloudSun,
    group: "Essentials",
    description: "See a little further.",
    controls: [c("amount", "Amount", 35), c("saturation", "Saturation")],
  },
  {
    id: "motion",
    name: "Motion blur",
    icon: Wind,
    group: "Creative",
    description: "Let the moment keep moving.",
    controls: [
      c("strength", "Distance", 30, 0),
      c("angle", "Direction", 0, -180, 180),
    ],
  },
  {
    id: "bloom",
    name: "Bloom",
    icon: Sun,
    group: "Creative",
    description: "Let your highlights wander.",
    controls: [
      c("strength", "Strength", 40, 0),
      c("radius", "Softness", 40, 1),
      c("threshold", "Highlight threshold", 65, 0),
    ],
  },
  {
    id: "halation",
    name: "Halation",
    icon: Flame,
    group: "Creative",
    description: "A warm echo around the light.",
    controls: [
      c("strength", "Strength", 40, 0),
      c("radius", "Spread", 20, 1),
      c("threshold", "Highlight threshold", 65, 0),
    ],
  },
  {
    id: "lut",
    name: "LUT",
    icon: Box,
    group: "Creative",
    description: "Your signature color, in one step.",
    controls: [c("strength", "Strength", 100, 0)],
    hint: "Import a standard .cube 3D LUT (up to 64³). It stays on your device.",
  },
];

export function matchesTool(tool: Tool, query: string) {
  const text =
    `${tool.name} ${tool.group} ${tool.description} ${tool.hint || ""} ${tool.controls.map((control) => control.label).join(" ")}`.toLowerCase();
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export function visibleControls(tool: Tool, edit: Edit) {
  return tool.controls.filter(
    (control) =>
      !(
        tool.id === "healing" &&
        edit.params.method === "smart" &&
        control.key.startsWith("offset")
      ) &&
      !(
        edit.faces?.length &&
        ["centerX", "centerY", "radius"].includes(control.key)
      ),
  );
}

export function defaults(id: string): Params {
  const params: Params = Object.fromEntries(
    (tools.find((t) => t.id === id)?.controls || []).map((c) => [
      c.key,
      c.value,
    ]),
  );
  if (id === "curves") params.channel = "rgb";
  if (id === "rotate") Object.assign(params, { turns: 0, flipX: 0, flipY: 0 });
  if (id === "flip") Object.assign(params, { flipX: 0, flipY: 0 });
  if (id === "collage")
    Object.assign(params, {
      layout: "grid",
      columns: 2,
      ratio: "1:1",
      fit: "cover",
      color: "#f3f0e8",
    });
  if (id === "sticker")
    Object.assign(params, {
      sticker: "heart",
      color: "#e6aca4",
      blend: "normal",
      flipX: 0,
      flipY: 0,
    });
  if (id === "background")
    Object.assign(params, { fill: "transparent", color: "#f3f0e8" });
  if (id === "expand") params.fill = "mirror";
  if (id === "healing") params.method = "smart";
  if (id === "brush") params.mode = "exposure";
  if (["selective", "lens-blur", "vignette"].includes(id))
    Object.assign(params, { x: 50, y: 50 });
  if (id === "double") params.blend = "screen";
  if (id === "text")
    Object.assign(params, {
      text: "A moment, kept.",
      color: "#ffffff",
      font: "serif",
      style: "plain",
    });
  if (id === "frames") params.color = "#ffffff";
  if (id === "hsl") params.range = "all";
  if (id === "lens-blur") params.shape = "radial";
  return params;
}

export const looks = [
  {
    id: "original",
    name: "Original",
    filter: "none",
    tag: "The way you saw it",
  },
  {
    id: "portrait",
    name: "Portrait",
    filter: "saturate(.8) sepia(.12) brightness(1.08)",
    tag: "Soft & natural",
  },
  {
    id: "smooth",
    name: "Smooth",
    filter: "contrast(.85) saturate(.75) brightness(1.08)",
    tag: "A softer side",
  },
  {
    id: "pop",
    name: "Pop",
    filter: "contrast(1.18) saturate(1.4)",
    tag: "A little more life",
  },
  {
    id: "accentuate",
    name: "Accentuate",
    filter: "contrast(1.3) saturate(.9)",
    tag: "Every detail",
  },
  {
    id: "faded",
    name: "Faded glow",
    filter: "sepia(.25) saturate(.7) contrast(.8) brightness(1.12)",
    tag: "Like a memory",
  },
  {
    id: "morning",
    name: "Morning",
    filter: "sepia(.25) saturate(1.1) brightness(1.1)",
    tag: "First light",
  },
  {
    id: "bright",
    name: "Bright",
    filter: "brightness(1.18) saturate(.9)",
    tag: "Let the light in",
  },
  {
    id: "fine-art",
    name: "Fine art",
    filter: "grayscale(1) contrast(1.25)",
    tag: "A timeless feeling",
  },
  {
    id: "silhouette",
    name: "Silhouette",
    filter: "grayscale(1) contrast(1.7) brightness(.8)",
    tag: "Shape & shadow",
  },
];
