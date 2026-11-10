# Feature coverage

Still is inspired by Snapseed; its algorithms and preset formats are independent. “Included” means an actual pixel-processing operation, not only a UI control.

| Tool            | Included implementation                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Tune image      | Brightness, contrast, saturation, ambiance, highlights, shadows, warmth; histogram-guided auto adjust |
| Details         | Local contrast/structure and unsharp sharpening                                                       |
| Curves          | Five draggable tonal anchors, per-channel RGB/red/green/blue curves, sliders                          |
| White balance   | Temperature/tint and neutral-point sampling                                                           |
| Crop            | Free crop, common ratios, draggable corners, numeric margins                                          |
| Rotate          | Quarter turns, straightening, horizontal/vertical flips                                               |
| Perspective     | Projective horizontal/vertical adjustment with scale; edge replication                                |
| Expand          | Reflected edges, white, or black canvas expansion                                                     |
| Selective       | Tap-positioned radial or similar-color mask; brightness, contrast, saturation                         |
| Brush           | Exposure, dodge, saturation, warmth; feathered normalized touch strokes                               |
| Healing         | Feathered clone from a configurable nearby source                                                     |
| HDR scape       | Local contrast, shadow/highlight compression, brightness, saturation                                  |
| Glamour glow    | Soft blur blend, glow, saturation, warmth                                                             |
| Tonal contrast  | Local-contrast weighting for high, mid, and low tones                                                 |
| Drama           | Strong local contrast, global contrast, saturation                                                    |
| Vintage         | Warm faded tones, brightness, saturation, vignette                                                    |
| Grainy film     | Deterministic film grain and warm tone styling                                                        |
| Retrolux        | Warm aging, light leaks, deterministic scratches                                                      |
| Grunge          | Contrast, deterministic texture, brightness, vignette                                                 |
| Black & white   | Luminance conversion, brightness, contrast, grain                                                     |
| Noir            | Monochrome contrast, grain, wash, vignette                                                            |
| Portrait        | Manually positioned elliptical spotlight, softening, and eye-area brightening                         |
| Head pose       | Manual local 2D warp: turn, tilt, smile, eye scaling, face center and size                            |
| Lens blur       | Circular or rotated linear focus, transition, blur, vignette                                          |
| Vignette        | Tap-positioned center, inner/outer brightness, center size                                            |
| Double exposure | Embedded second image; normal, screen, multiply, overlay, lighten, darken blends                      |
| Text            | Multiline text, serif/sans/mono, regular/bold, color, position, size, opacity                         |
| Frames          | Canvas border size and arbitrary color                                                                |
| RAW develop     | LibRaw WASM imports, camera WB → sRGB, followed by exposure/tone/color adjustments                    |
| Color HSL       | Hue, saturation, luminance for all colors or eight targeted hue ranges                                |
| Color grade     | Independent shadow/midtone/highlight hue and strength; tonal balance                                  |
| Dehaze          | Contrast/shadow and saturation treatment                                                              |
| Motion blur     | Directional multi-sample image blend                                                                  |
| Bloom           | Highlight-thresholded blurred screen glow                                                             |
| Halation        | Highlight-thresholded warm/red light spread                                                           |
| LUT             | Trilinear interpolation for .cube 3D LUTs up to 64³; standard flattened Hald PNG import               |

## Workflow features

| Feature                 | Status and boundaries                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Looks                   | Ten bundled previews plus locally saved edit recipes                                                                        |
| Non-destructive editing | Original source retained; editable/removable stack entries; undo/redo, reset, compare                                       |
| Local recovery          | Current source and all visible edits saved in IndexedDB; recovered after reload, including offline                          |
| Presets                 | Still JSON import/export; basic Adobe Camera Raw XMP tone attributes; no full Lightroom rendering compatibility             |
| QR Looks                | Still's own QR schema, local generation and scanning; not Snapseed's private format; large recipes use JSON                 |
| LUT PNG                 | Standard square flattened Hald CLUT images up to 512×512; tiled/Unreal LUT images are not supported                         |
| Look packs              | ZIP import of 1–20 JSON/XMP/.cube recipes, 12 MB expanded limit                                                             |
| Batch                   | Up to 10 images processed with the current stack; ZIP of edited outputs                                                     |
| Camera                  | Browser/mobile camera capture through the platform image input; desktop opens an image picker                               |
| Export                  | JPG/PNG/WebP, quality and size, download and native Save As where available; original file is not overwritten automatically |
| PWA                     | Installable, complete local asset cache, offline photo editing/export, version-update prompt                                |
| File handling           | Installed desktop Chromium OS associations, launch queue, multiple-file chooser; picker/drop/paste on other browsers        |

## Differences from Snapseed

- No Google Discover feed, accounts, shared community backend, or native camera with live film simulation. The offline starter Looks and shareable files are the local alternative.
- No bundled machine-learning subject/depth segmentation. Selective uses radial or sampled color masks; lens blur uses a positioned focus shape. Neither is advertised as object-aware AI masking.
- Portrait and head pose require manual region placement. No face recognition, landmarks, or 3D face reconstruction are performed.
- Healing clones a feathered nearby source. Expansion uses reflected pixels or solid fill; neither performs content-aware synthesis.
- RAW support depends on LibRaw's available camera codecs. Adjustments operate on decoded 8-bit sRGB rather than sensor-linear RAW. Original RAW bytes are not exported; the developed bitmap is used for recovery.
- Film effects are independent approximations, not copies of Google's film simulations or presets. Dehaze is a contrast-based treatment, not depth reconstruction.
- Export replays the edit stack at the selected source resolution; blur/structure are scaled approximately between preview and export. Resampling and deterministic grain may produce small visual differences at different sizes.
- Animations flatten to a still. EXIF, GPS, and original ICC metadata are not retained. Working images are bounded for browser/mobile memory.

These differences are material: the app provides broad Snapseed-style editing coverage, not exact feature or output parity.
