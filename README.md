# Still

A mobile-friendly, Snapseed-inspired photo editor. A quiet olive workspace, a large photo canvas, expressive Looks, and **36 editing tools**. Processing happens locally, without accounts, uploads, ads, or watermarks.

## Run

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

```sh
npm test                   # color processing, LUTs, and preset validation
npm run build             # TypeScript, production assets, and offline service worker
npx playwright install chromium
npm run test:e2e           # production browser tests
npm run preview           # serve the production app
```

The development server intentionally does not register a service worker. Use the production preview to test installation and offline behavior. The app ships a bundled sample photo, so it is usable immediately.

## What is included

- Responsive desktop workspace and mobile editing sheet; touch painting, crop handles, pinch zoom, and panning.
- Tone, detail, white balance with neutral-point sampling, editable RGB/channel curves, HSL, color grading, and RAW imports decoded on-device by LibRaw WebAssembly.
- Crop, rotate, flip, perspective, expansion, selective color/radial adjustments, exposure/saturation/warmth brushes, and feathered clone healing.
- HDR, glamour glow, tonal contrast, drama, vintage, grainy film, retrolux, grunge, black and white, noir, motion blur, bloom, and halation.
- Manual portrait and head-pose adjustments, circular/linear lens blur, vignette, blended double exposure, multiline text, and frames.
- Non-destructive edit stack, 60 undo transitions, original comparison, and automatic IndexedDB project recovery.
- Ten starter Looks, saved custom Looks, JSON and QR sharing/import, basic Camera Raw XMP tone import, .cube and Hald PNG LUTs, and ZIP look packs.
- JPG, PNG, and WebP export with size/quality controls; native Save As when available; batch edits of up to 10 photos exported as a ZIP.
- Installable PWA, complete offline asset precaching including RAW decoding, and **PWA File Handling** through `file_handlers` and `launchQueue`.
- Opening by file picker, drop, paste, or mobile camera capture.

This is an independent browser implementation. It **does not reproduce every proprietary Snapseed capability or output**. In particular, subject/depth AI masking, automatic facial landmarks and 3D face reconstruction, content-aware expansion/healing, Google Discover/community services, native camera live styles, Snapseed's private QR format, and full Adobe XMP semantics are not implemented. Local alternatives and exact differences are documented in [feature coverage](docs/FEATURES.md).

## GitHub Pages

1. Push this project to a GitHub repository on `main` or `master`.
2. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. The included [Pages workflow](.github/workflows/deploy.yml) tests, builds, and publishes the `dist` artifact. It can also be run manually from Actions.

The workflow obtains the correct base path from `actions/configure-pages`, supporting both repository sites (`/repository/`) and root/custom-domain sites. No token secret is needed: deployment uses the workflow's scoped `GITHUB_TOKEN` and OIDC permissions. A separate PR workflow runs build and browser checks.

For a manual subpath build:

```sh
BASE_PATH=/photo-editor/ npm run build
```

No deployment is performed by installing or building locally. Publishing occurs only when the configured workflow is triggered on GitHub.

## PWA and file handling

Open once online and wait for installation to finish. The complete application, sample, font, icons, modules, and RAW decoder are then available offline. Your current source photo and edit stack are stored in IndexedDB on the device. Export important work; clearing site data removes local projects and Looks.

Install from Chrome/Edge's address bar, or on iOS through **Safari → Share → Add to Home Screen**. In supported **desktop Chromium** browsers, installed Still can be selected in the OS **Open with** menu for supported image/RAW extensions. OS registration and permission prompts are browser-dependent. File pickers remain available on all browsers. See [PWA implementation and verification](docs/PWA.md).

## Limits

- Working images are capped at 6000 px on the longest side, 40 MP on input, and 100 MB encoded file size. Very large RAW files are decoded at half size. Canvas allocations are limited to 48 MP and 16,384 px on either side.
- Editing/export uses browser Canvas 2D in 8-bit sRGB; original EXIF/GPS/ICC metadata is not preserved. PNG retains transparency, JPG flattens through the browser encoder. GIF/animated WebP opens as a still.
- RAW tool adjustments run after LibRaw's camera-WB-to-sRGB development. Camera/codec support depends on the bundled LibRaw build.
- Local storage can be unavailable, full, or evicted. The UI reports saving failures; downloads remain available.
- An initial online visit is required before offline use. Operating-system PWA registration still needs manual verification on each target OS/browser.

See [research and design](docs/DESIGN.md) and [third-party notices](public/THIRD_PARTY_NOTICES.txt).

Validation results and desktop/mobile screenshots are in [the validation report](docs/VALIDATION.md).
