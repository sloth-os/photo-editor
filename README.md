# Still

A mobile-friendly, Snapseed-inspired photo studio with **42 tools**, non-destructive editing, local AI, camera Looks, and offline operation. Original photos and image processing stay on your device. An optional, separately hosted community adds shared Looks and accounts.

## Run and check

Requires Node.js 24 and npm. All model files are included in the repository; setup verifies their checksums.

```sh
npm ci
npm run dev
```

```sh
npm test                     # pixel math, formats, metadata, and community API tests
npm run build                # TypeScript, production build, offline precache
npx playwright install --with-deps chromium webkit
npm run test:e2e             # actual production-browser workflows
npm run preview              # installation/offline testing
```

Development intentionally does not register a service worker. Use production preview to test offline behavior. The first online visit caches approximately **61 MB**, including the RAW decoder, learned models, and their runtimes. Once installation completes, editing, inference, capture effects, imports, and exports work without a server connection.

## Editing

- Touch layouts prioritize an edge-to-edge photo, a compact single-adjustment dock, and 44 px controls. **More controls** opens the full inspector; **More photo** returns to the compact dock. Wide touch tablets use a side inspector. **Expand photo preview** hides the editor chrome for inspection without losing edits.
- Pinch up to 8× and pan with two fingers in every tool. One finger still paints with Brush/Healing; **Pan photo** provides an explicit navigation mode. Pinching cancels the first contact's tentative brush stroke.
- Text can be moved directly on the photo and rotated by dragging its round handle with a finger or mouse. Arrow keys on the handle rotate by 1°; Shift changes the step to 15°.
- ID photos include eight common passport/ID sizes, editable framing, and 150/300/600 dpi output. JPG, PNG, and WebP carry print-resolution metadata; PNG also includes pHYs and JPG includes JFIF density. See [ID photo sizes](docs/ID_PHOTOS.md).
- Tone, white balance with neutral-point sampling, arbitrary RGB/channel/luminance curves, HSL, grading, detail, and dark-channel dehaze.
- Crop handles/ratios, straightening/flips/perspective, smart texture expansion, selective adjustments, local brushes, and content-aware healing or clone mode.
- Dedicated horizontal mirror and vertical flip controls; collage grids and horizontal/vertical stitching with up to nine photos, editable order, spacing, fit, and canvas color.
- HDR, glow, tonal contrast, drama, vintage, film responses, grain, retrolux, grunge, monochrome/noir, motion blur, bloom, and halation.
- Local subject/background segmentation for Selective, Brush, Motion Blur, and Lens Blur. Learned scene depth for depth-aware focus.
- Automatic face landmarks, face-aware portrait lighting/eyes, and 3D mesh pose/eye/smile adjustments. Manual placement remains available. No identity recognition is performed.
- Face-aware skin smoothing and whitening, with skin-tone selection and eye/lip protection; manual placement when face detection is unavailable.
- Local background removal with refined alpha edges, transparent/color/photo backgrounds, and PNG/WebP transparency export.
- Six offline vector stickers, transparent image overlays, rotation/position/opacity/blends, multiline typography with arbitrary rotation, frames, and adjustable 3D LUTs in .cube, flattened Hald PNG, or tiled PNG layouts.
- **16-bit linear RAW development** before display conversion; original RAW bytes survive local recovery and later development changes.
- Editable/removable stack entries, undo/redo, original comparison, and automatic project recovery in IndexedDB.
- Ten starter Looks, six offline Discover Looks, saved recipes, JSON/QR/XMP sharing, ZIP packs, and supported native Snapseed QR operators.
- Looks and their thumbnails share portable pixel processing, including on iPhone Safari. A separable blur fallback supports Safari effects without Canvas.filter.
- Live camera preview with built-in or saved Looks; front/back selection, physical-lens picker, single-camera fallback, and consistent selfie mirroring. Capture retains an editable source and Look. Camera permission and device availability are browser-dependent.
- JPG/PNG/WebP export with size/quality and optional EXIF preservation. GPS is included when present in supported source EXIF and preservation is selected. Batch export regenerates AI selections for each photo and downloads a ZIP.
- Convert between supported formats, use custom pixel dimensions or a percentage, or set an actual KB limit. Proportions remain locked and regular resizing never enlarges the image. File limits adjust quality and, when needed, dimensions; ID-photo compression keeps dimensions fixed. The output summary shows the filename, pixels, and print resolution before saving.

The app has its own algorithms and output. [Feature coverage](docs/FEATURES.md) identifies compatibility limits, including private Snapseed QR operators, Adobe-only profiles/settings, and single-image face reconstruction.

## GitHub Pages

1. Push to `main` or `master`.
2. Set **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. The [Pages workflow](.github/workflows/deploy.yml) validates the editor, obtains the repository base path, builds, and deploys `dist`. It also supports manual runs. PRs have a separate check workflow.

No personal token is required; the workflow uses scoped Pages/OIDC permissions. Root sites, custom-domain sites, and repository sites such as `/photo-editor/` use the appropriate base path.

```sh
BASE_PATH=/photo-editor/ npm run build
```

Local builds do not publish. The GitHub workflow deploys when triggered on GitHub.

## PWA File Handling

Install from Chrome/Edge's address bar, or **Safari → Share → Add to Home Screen** on iOS. Supported **desktop Chromium** installations can register Still in the OS **Open with** menu for supported raster and RAW files. `file_handlers`, relative manifest URLs, and an early `launchQueue` consumer share the ordinary validated import pipeline. Multiple incoming files open a chooser with a batch option. Pickers, drop, paste, and camera input remain available elsewhere.

See [PWA details and manual OS checks](docs/PWA.md). Actual OS associations require browser permission and cannot be established by a simulated launch-queue test.

## Optional community

**Explore looks → Discover** always includes a local collection. To share Looks, connect a self-hosted community service in Discover. The included Node 24/SQLite service provides accounts, searchable Looks, likes, comments, ownership, and duplicate-safe offline publishing. It receives reviewed recipes and small previews. Imported collage photos, overlays, and replacement backgrounds embedded in a shared recipe are also included; the primary source and original RAW file are not uploaded.

```sh
npm run community:server
```

Public use needs separate HTTPS hosting and persistent storage; GitHub Pages cannot run the backend. [Community deployment instructions](server/README.md) include Node/container options. No hosted account or service is created automatically.

## Practical limits

Working images are limited to 6000 px on the longest side, 40 MP on import, and 100 MB encoded size. Large RAW inputs can develop at half size. Individual canvas allocations are limited to 48 MP/16,384 px. Final display edits and exports use 8-bit sRGB; incompatible original ICC profiles are not copied onto converted pixels. RAW exports preserve common shooting tags; original manufacturer-specific metadata and original RAW files are not rewritten. Animated input opens as a still.

Imported collage/overlay images are normalized to at most 2400 px and retain transparency. A composition's longest edge follows the current working image. Stitching preserves each photo's aspect ratio; grid layouts offer fill or fit. JPG fills transparent areas with white; PNG and WebP retain alpha.

Local projects and Looks can be removed by storage eviction or clearing site data. Export important work. A first online installation must complete before offline use. Models may take longer on older devices; analysis can be cancelled. Community operations require the optional backend, with an outbox for reviewed offline posts.

[Research/design](docs/DESIGN.md) · [Validation and screenshots](docs/VALIDATION.md) · [Credits](public/THIRD_PARTY_NOTICES.txt) · [Model sources/checksums](public/models/SOURCES.md)
