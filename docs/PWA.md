# PWA implementation and verification

## Install and work offline

Production builds generate `manifest.webmanifest`, `sw.js`, and Workbox runtime code. The app is served over HTTPS in production; localhost is a secure-context exception for development.

Workbox precaches the HTML shell, styles, JavaScript (including lazy QR/ZIP modules), local font, sample image, icons, credits/licenses, and all LibRaw JavaScript/WASM files. No runtime CDN, font server, API, or image-host request is required. The service worker claims the first controlled page after initial installation. A first online load must finish caching before the app is available offline.

Photo source Blobs, the visible edit stack, and saved Looks live in IndexedDB, not in the service-worker cache. Transactions report success only when complete. Clearing site data, private browsing restrictions, storage quotas, or browser eviction can remove them. Export important work. There is no cloud backup or multi-tab conflict resolution.

New versions precache separately and wait for the app's update prompt. Update is allowed only after the current local-save status reports success. A refresh restores the saved project.

## OS File Handling

`vite.config.ts` declares relative `file_handlers` actions in the web app manifest. Accepted extensions include JPG/JPEG/JFIF, PNG, WebP, AVIF, BMP, GIF, and common camera RAW formats. The handler's action and the manifest's start URL/scope are `./`, resolved relative to the deployed manifest. `launch_handler.client_mode` focuses an existing installed client when supported.

`src/App.tsx` registers `window.launchQueue.setConsumer` early. File-system handles are converted to `File` objects through `getFile()`, then passed to the same validation/decode pipeline as the regular picker. A generation token prevents project recovery/sample loading from overwriting an incoming file. Multiple files open a chooser instead of being silently discarded. Handle or decode failures produce a message. The app never writes to an incoming handle or automatically overwrites its source.

OS association requires an installed PWA, browser/OS support, and user permission. The standardized file handler is currently a desktop Chromium feature. Safari, iOS, Firefox, and non-installed browser sessions use the ordinary picker; drag/drop and paste are also supported when available. Installation controls are offered through `beforeinstallprompt` where supported; other platforms have explicit instructions in Help.

## Subpath deployment

Vite receives the correct GitHub Pages base path from `actions/configure-pages`. Public fetches/dynamic RAW imports use `import.meta.env.BASE_URL`, manifest entries use relative URLs, and the service worker is generated relative to its deployment scope. This avoids accidentally loading a repository-hosted app's worker or file-handler action from the account's root site.

## Checks

Automated production-browser tests cover:

- The manifest's file extension declarations and relative action/scope.
- A simulated OS launch queue and startup race with a supplied image handle.
- Offline reload, source/edit recovery, pixel editing, and downloaded export with browser networking disabled.
- Mobile no-overflow layout and the full photo remaining above the adjustment sheet.
- No external requests during normal app load.

The launch-queue simulation validates app code, not OS registration. Manually verify on each target desktop:

1. Deploy over HTTPS, open online, and install Still in Chrome or Edge.
2. Find an image in the OS file browser, choose **Open with Still**, and accept the browser's permission prompt.
3. Confirm the correct filename/image opens; repeat with an already-open Still window and multiple files.
4. Wait for local saving, disconnect, relaunch the installed app, edit, and export.
5. Deploy a new build; verify the update prompt, saved project recovery, and continued file associations.

No automatic deployment or OS installation is performed by these tests.
