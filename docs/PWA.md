# PWA implementation and verification

Production builds generate a relative manifest and Workbox service worker. HTTPS is required in production; localhost is a secure-context exception.

## Offline assets and data

The production precache includes HTML/styles/scripts, lazy QR/ZIP code, local font/sample/icons/licenses, the LibRaw decoder, MediaPipe runtime and models, and ONNX Runtime/Depth Anything V2 Small. The initial cache is about 61 MB. Model files are part of the repository and checked against pinned SHA-256 values during preparation. Inference fetches no remote model or image API.

Original source Blobs, RAW bytes, edit stacks, collage/overlay images, embedded masks/depth/landmarks, saved Looks, and community caches/outbox are stored in IndexedDB. Saving is reported only after transaction completion. Clearing site data, private-mode restrictions, storage pressure, or browser eviction can remove this data; export important work.

Collage/stitching, built-in vector stickers, imported overlays, text rotation, flip/mirror, skin retouching, and learned background removal all work offline. Cutouts retain alpha through transforms and PNG/WebP export. Camera selection requires a browser-exposed camera and permission, but no network service.

New versions precache separately and wait for the update prompt. Updates are accepted after the current local-save status reports success; recovery reopens the saved project. Development mode intentionally does not register a service worker.

## File Handling

The manifest declares supported raster/RAW extensions with relative action `./`; start URL and scope are also relative. `launch_handler.client_mode` requests an existing client when supported.

The early `launchQueue.setConsumer` reads only supplied handles through `getFile()`, then uses the regular validation/import path. Generation tokens prevent sample/project recovery from overwriting an incoming file. Multiple files open a chooser with a batch action. Source handles are never written or overwritten automatically; exports create a copy or use the user's explicit Save As selection.

OS association requires an installed PWA, supported desktop Chromium, and browser permission. Safari/iOS/Firefox and non-installed sessions retain file picking, drop/paste, and camera options. Install instructions cover the platform differences.

## Repository paths

`BASE_PATH` comes from `actions/configure-pages` for deployment. Public URLs use Vite's `BASE_URL`, manifests use relative URLs, workers receive the deployed base, and their runtime/model paths stay within that scope. A repository build under `/photo-editor/` must not request workers/models from the account root.

## Validation and remaining manual checks

Production-browser tests disable networking before reloading and then run actual face detection, subject segmentation, learned depth inference, edits, project recovery, and export. Other checks simulate an OS launch queue, validate manifest associations, exercise incoming images, and verify mobile geometry without horizontal overflow.

A simulated launch does not verify OS registration. On each target desktop, install over HTTPS, choose **Open with Still**, accept the browser permission, and try both an existing client and multiple files. Then disconnect and edit/export. After deploying an update, verify the prompt and restored project. These manual browser/OS checks are not performed automatically.

The optional community service is outside the precached editor. Its cached feed remains browsable offline; reviewed publishes queue locally and retry on reconnection with idempotency keys. External service hosting is separate from Pages.
