# Research and design

Reference review: November 10, 2026.

## Sources

- [Snapseed's official Google Play listing](https://play.google.com/store/apps/details?id=com.niksoftware.snapseed&hl=en): classic and current tools, non-destructive editing, RAW development, batch workflows, Looks/presets/LUTs, motion blur, bloom/halation, HSL, and color grading.
- [Chrome: File Handling API](https://developer.chrome.com/docs/capabilities/web-apis/file-handling): manifest declarations, installed desktop-PWA associations, browser permissions, `launchQueue.setConsumer`, and multiple-file behavior.
- [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation): service-worker lifecycle and cache-first application assets.
- [LibRaw-Wasm](https://github.com/ybouane/LibRaw-Wasm): locally bundled worker/decoder, camera white balance, sRGB output, limits, and decoder disposal.
- [GitHub: Deploy a custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): Pages permissions, artifact upload, and deployment environments.

## Interaction model

The photograph is the center of attention. Editing uses Snapseed's recognizable **Looks → Tools → Apply/Cancel → Export** model. Controls preview immediately, applying commits an editable stack entry, and canceling returns to the last committed state. Switching tools applies the pending adjustment. Original comparison never alters the stack.

On desktop, the left rail switches editing context, the center holds the photo and a horizontal Look strip, and the right side hosts one focused tool. All tools are searchable in a categorized modal. A real image histogram gives tonal context without crowding the photograph.

On phones, the rail becomes a bottom toolbar. Adjustments open in a bounded, scrollable bottom sheet; the canvas resizes above the sheet so the entire photo remains visible. Touch input supports brush strokes, crop corners, local-control placement, pinch zoom, and panning. Dialogs fit the viewport and trap keyboard focus. Inputs, range sliders, selected states, and icon buttons have accessible names; reduced-motion preferences are honored.

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
