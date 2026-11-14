# Research and design

Reference review: November 10, 2026.

## Sources

- [Snapseed's official Google Play listing](https://play.google.com/store/apps/details?id=com.niksoftware.snapseed&hl=en): classic and current tools, non-destructive editing, RAW development, batch workflows, Looks/presets/LUTs, motion blur, bloom/halation, HSL, and color grading.
- [Chrome: File Handling API](https://developer.chrome.com/docs/capabilities/web-apis/file-handling): manifest declarations, installed desktop-PWA associations, browser permissions, `launchQueue.setConsumer`, and multiple-file behavior.
- [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation): service-worker lifecycle and cache-first application assets.
- [LibRaw-Wasm](https://github.com/ybouane/LibRaw-Wasm): locally bundled worker/decoder, camera white balance, sRGB output, limits, and decoder disposal.
- [GitHub: Deploy a custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): Pages permissions, artifact upload, and deployment environments.
- [Tesseract.js](https://github.com/naptha/tesseract.js) and [tessdata_fast 4.1.0](https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0): browser LSTM recognition, local worker/core/language paths, progress/cancellation, and Apache-licensed fast language models.

## Interaction model

The photograph is the center of attention. Editing uses Snapseed's recognizable **Looks → Tools → Apply/Cancel → Export** model. Controls preview immediately, applying commits an editable stack entry, and canceling returns to the last committed state. Switching tools applies the pending adjustment. Original comparison never alters the stack.

On desktop, the left rail switches editing context, the center holds the photo and a horizontal Look strip, and the right side hosts one focused tool. All tools are searchable in a categorized modal. A real image histogram gives tonal context without crowding the photograph.

On phones and coarse-pointer devices, the photograph fills the available width and the rail becomes a bottom toolbar. The default adjustment dock is 184 px tall and presents one large slider with a parameter chooser. More controls opens the full inspector; More photo restores the compact view. Wide landscape tablets place the full inspector at the side. The canvas resizes around either panel. Decorative Looks and metadata rows give way to photo space, while save status stays by the filename.

Expanded preview fills the viewport and preserves pending adjustments. It uses an in-app view so it also works in installed PWAs and browsers without a fullscreen API. Pinch zoom is anchored at the gesture midpoint; two-finger panning works in every tool and cancels tentative brush marks from the first contact. One-finger strokes and taps remain available, and an explicit Pan button supports other pointing devices. Zoom is bounded to 1–8× and panning keeps the photo in reach. Touch sliders, important buttons, and crop handles have 44 px hit areas, with 24 px slider thumbs. Dialogs fit the viewport and trap keyboard focus; reduced-motion preferences and device safe areas are honored.

## Visual direction

Still has its own identity rather than using Google's marks: a shutter symbol, a compact lowercase wordmark, charcoal/olive surfaces, warm off-white typography, and a pale sage accent. DM Sans is bundled for offline use. A restrained border and spacing system keeps the canvas calm. The photo is real, bundled, and credited; Look thumbnails use the user's current photo.

## Technical decisions

- React, TypeScript, and Vite; static hosting with no backend requirement.
- Deterministic Canvas 2D operations replayed from an immutable edit stack. Noise uses position-based hashing so re-renders and exports do not flicker.
- A 1400 px preview limits work while export replays edits from the full working source. Normalized brush points and local coordinates scale to export and batch images.
- LibRaw runs in a dedicated worker, entirely from bundled local assets. Expensive Canvas effects remain on the main thread; future optimization should move the common renderer to OffscreenCanvas without changing the stack format.
- IndexedDB stores a source Blob, current edits, and Looks. Storage success is reported only after transaction completion.
- Workbox precaches all production assets, including lazy modules and the RAW worker/WASM. New app versions prompt before activation so a saving edit is not interrupted.
- Relative manifest URLs, Vite's configurable base, and `BASE_URL` for public assets support GitHub Pages repository subpaths.

## Scope and parity

The intent is a complete, usable browser editing workspace covering Snapseed's classic tools and newer editing categories. Proprietary processing, private preset formats, social services, and AI models cannot be inferred from the reference UI. The app uses honest local equivalents and documents those differences rather than labeling manual tools as AI. See [feature coverage](FEATURES.md).

## Completed advanced workflows

The follow-up implementation bundles learned segmentation, face landmarks, and
relative scene depth. Analysis runs in workers; masks and geometry are saved
with edits. Model origins, licenses, and checksums are recorded in
`public/models/SOURCES.md`. Content-aware texture synthesis runs in its own
worker. Dehaze uses an atmospheric-light/dark-channel model rather than a global
contrast substitute.

RAW input is developed as 16-bit linear RGB before display conversion, with the
original bytes retained for subsequent changes. Export offers optional metadata
preservation without reattaching an incompatible original ICC profile.

Camera capture uses actual video frames with editable live Looks. Discover has
a bundled offline collection and an optional independent community service.
Sharing always requires an explicit user publish action; original source files
are not sent. Both batch processing and reusing an AI Look regenerate analysis
for each target photo.

Native Snapseed QR support is limited to operators verified against a public
payload. Unknown operators are disclosed and preserved, rather than assigned
unverified meanings. XMP carries compatible fields plus a complete Still recipe
extension. These choices make interoperability inspectable while retaining clear
boundaries around proprietary processing.

## Composition and retouching

Collages keep the current edit as one source and embed up to eight additional
photos in a stack entry. Source order and layout parameters remain editable.
Grids offer crop-to-fill or entire-photo fit; horizontal and vertical stitching
preserve source ratios. The final longest edge follows the working image, so
preview and export share proportions without multiplying mobile canvas memory.
Embedded assets are capped at 2400 px and preserve alpha when present.

Built-in stickers use bundled vector paths. Raster overlays and text rotate
around normalized positions; each applied layer can be re-edited or removed.
Background removal refines learned foreground confidence into alpha, with
transparent, solid, and imported-image destinations. Transforms preserve alpha.
Skin retouching combines a soft skin-chroma mask with a manual/detected face
region, luminance-aware smoothing, and landmark eye/lip protection.

Camera selection first requests an exact front/back camera, falls back on
devices without facing constraints, and offers enumerated physical lenses after
permission. Switching and closing stop previous tracks. Selfie mirroring is
applied before Look rendering in both preview and the captured editable stack.

## Safari rendering and output

WebKit reproduces the original Look failure: `CanvasRenderingContext2D.filter`
is undefined, and assigning brightness/contrast filters leaves image pixels
unchanged. Starter Looks now use sRGB pixel operations on every browser, and
their thumbnails are rendered by the same pipeline. A three-box separable blur
provides a fallback for saved effects when native canvas filtering is absent.

Text has a pointer-captured move box and rotation handle around its normalized
center. The edit stores only position and angle, so overlays never enter the
exported raster. The same controls support fingers, mice, and keyboard angles.

Export measures the final stack geometry before choosing dimensions, then
renders at the necessary scale and encodes the actual requested MIME type.
Custom dimensions retain proportions. Byte limits binary-search lossy quality
and optionally reduce pixels; print/ID output keeps the selected dimensions.
ID presets set exact pixel sizes from millimeters and dpi. EXIF resolution,
JPEG JFIF density, and PNG pHYs preserve physical print size independently of
whether original camera metadata is included.

## Drawing, privacy, fill, and text recognition

Drawing stores normalized marks with immutable style snapshots, so changing the
active color or brush affects the next stroke. Paths, quadratic curves, arrows,
filled shapes, and numbered steps replay through the same renderer for preview,
recovery, recipes, and export. Textured crayon uses a stable per-mark seed.
Highlighter uses multiply compositing to preserve dark lettering. A layer-local
eraser removes ink without damaging the source. Per-mark history supports undo,
redo, clear, delete, and moving a selection. Two-finger gestures roll back the
first tentative mark and its number counter before navigating the photo.

Privacy selections use a rectangle, ellipse, or painted mask. Blur processes a
padded region with the portable pixel blur; pixelation downsamples and enlarges
without smoothing. Redaction forces opaque coverage. Spotlight unions multiple
selected regions before dimming their surroundings. Bucket fill scans connected
horizontal runs, compares premultiplied RGBA within tolerance, and supports
disconnected matching colors, entire-canvas fills, and true transparent clearing.

OCR snapshots the visible edit stack, including privacy effects, at up to
3200 px/8 MP. Tesseract runs in a dedicated local worker with ten checksum-pinned
fast models and no remote language downloads. Jobs are serialized; cancellation
prevents stale results and releases the worker. A selected crop, editable text,
optional word boxes, copy/TXT output, and a text-layer action fit into a responsive
dialog. The OCR UI and drawing renderer load on demand and are precached for
offline use.

## Document scanner

The scanner follows the capture, corner correction, cleanup, organization, and export workflow researched in CamScanner and Microsoft Lens. It uses a separate local document draft and a large touch crop view. Image detection/rectification run in a worker; the PDF module loads only when exporting and is cached for offline use. The photo editor supplies annotations and privacy edits through explicit page replacement. See [scanner research, implementation, and limits](DOCUMENT_SCANNER.md).
