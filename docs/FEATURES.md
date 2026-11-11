# Feature coverage

Still is an independent Snapseed-inspired implementation. Included features operate on real pixels; its algorithms, model outputs, and preset semantics are not identical to Google's or Adobe's.

| Area                                       | Implementation                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tune / white balance                       | Brightness, contrast, saturation, ambiance, highlights, shadows, warmth, temperature/tint, neutral-point sampling, auto adjustment                      |
| Details / curves                           | Structure/sharpening; add, drag, remove, or keyboard-adjust curve points; RGB, red, green, blue, luminance; tonal sliders                               |
| Geometry                                   | Free/ratio crop with handles; quarter turns, flips, straightening; projective perspective and scaling                                                   |
| Flip / mirror                              | Dedicated horizontal mirror and vertical flip controls, combinable and independently undoable; transparency retained                                    |
| Collage / stitching                        | Current editable image plus up to eight embedded sources; reordered grids, horizontal/vertical strips, spacing, ratios, cover/contain fit, canvas color |
| Expand / healing                           | Worker-based exemplar-guided texture synthesis; reflected/solid expansion; clone mode and source offsets                                                |
| Selective / brush                          | Radial/color selection and learned subject/background segmentation; exposure/dodge/saturation/warmth strokes, optionally constrained to the selection   |
| HDR / tonal contrast / drama               | Local contrast and tonal processing with actual adjustable strengths                                                                                    |
| Film / vintage / grain / retrolux / grunge | Independent film responses, grain, aging/leaks/scratches/texture, and vignette treatment                                                                |
| Monochrome / noir                          | Luminance conversion, contrast, brightness, grain, wash                                                                                                 |
| Portrait                                   | Automatic local face landmarks, face-aware light/skin/eye regions, multiple-face choice, manual fallback                                                |
| Skin retouch                               | Skin-chroma selection, edge-aware smoothing, whitening, automatic face/manual placement, landmark-based eye/lip protection                              |
| Background removal                         | Local learned foreground segmentation, adjustable threshold/soft edge, true alpha, solid-color or imported-image replacement backgrounds                |
| Head pose                                  | 3D landmark mesh rotation/reprojection, eye size, smile, manual fallback                                                                                |
| Lens blur                                  | Circular, linear, subject-aware, and learned relative-depth focus with adjustable blur/transition                                                       |
| Vignette                                   | Positioned center, inner/outer brightness, center size                                                                                                  |
| Double exposure                            | Embedded second image with normal, screen, multiply, overlay, lighten, or darken compositing                                                            |
| Text / frames                              | Multiline serif/sans/mono, regular/bold, position, size, opacity, color, arbitrary rotation and quarter-turn buttons; adjustable borders                |
| Stickers / overlays                        | Six bundled vector shapes, embedded transparent raster overlays, positioning, rotation, opacity, mirror/flip, normal/screen/multiply/overlay blends     |
| RAW develop                                | LibRaw 16-bit linear output; exposure/WB/tone before sRGB conversion; original RAW source retained for later development                                |
| HSL / grading                              | Targeted hue ranges; independent shadow/midtone/highlight color and balance                                                                             |
| Dehaze                                     | Dark-channel transmission recovery and atmospheric-light estimation                                                                                     |
| Motion blur                                | Directional sampling over the scene, subject, or background                                                                                             |
| Glow / bloom / halation                    | Softening, thresholded highlight bloom, warm/red light spread                                                                                           |
| LUT                                        | Trilinear 3D sampling, .cube up to 64³, Hald and tiled PNG layouts                                                                                      |

## Workflows

| Feature                   | Status                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-destructive editing   | Original source, editable/removable stack, undo/redo, reset, compare                                                                                                               |
| Recovery                  | Source, RAW bytes, edits, collage/overlay images, masks, depth, and landmarks stored locally; no running process is required for restoration                                       |
| Looks / Discover          | Ten starter Looks, six offline Discover Looks, local recipes, optional shared community                                                                                            |
| JSON / QR                 | Complete Still JSON import/export; Still QR within QR size limits; large recipes use files                                                                                         |
| Native Snapseed QR        | Local gzip/protobuf decoding of verified Tune image and Curves operators; supported export; original native QR retained for unchanged re-export                                    |
| XMP                       | Exposure/tone/WB, curves, HSL, grading, detail, crop, dehaze, vignette, grain; export includes compatible fields and a complete Still recipe extension for exact Still round-trips |
| Packs / LUT PNG           | ZIP packs of JSON/XMP/.cube; flattened Hald and tiled/Unreal-style PNG layouts selectable after import                                                                             |
| Camera                    | Real live camera frames and Looks; explicit front/back choice, enumerated lens picker, released tracks on switch/close, single-camera fallback, editable mirrored capture          |
| Batch / reusable AI Looks | Up to ten photos per ZIP; subject/depth/face analysis recomputed against each target photo rather than copied from the creator's scene                                             |
| Export / metadata         | JPG/PNG/WebP, size/quality, download/native Save As; optional EXIF in each format, corrected orientation/dimensions; common RAW shooting tags                                      |
| Community                 | Optional self-hosted accounts, searchable feed, publishing, likes/comments, author deletion, cached browsing and idempotent offline outbox                                         |
| PWA / file handling       | Fully cached local inference/editing; install/update flow; desktop Chromium OS associations with picker/drop/paste fallbacks                                                       |

## Material boundaries

- Google's community/account backend is not exposed by this app. Still's optional community service is independent and needs its own HTTPS host. No external service is provisioned automatically.
- Snapseed QR's complete private operator schema is not published. Verified operator IDs `70516243` (Tune image) and `139220080` (Curves) are supported. Other operators are reported explicitly, retained in the original native payload, and not guessed or silently treated as supported.
- XMP profile/DCP rendering, proprietary Adobe masks and adjustments, and every Lightroom processing semantic are not reproduced. The Still recipe extension preserves Still tools during XMP round-trips; another application may ignore that extension.
- Segmentation covers the categories learned by DeepLab. Low-confidence/unrecognized subjects can require manual selection. Learned depth is relative, not a calibrated distance measurement.
- Face pose projects an estimated single-image 3D mesh. It does not generate an unseen side of the face; large changes can expose texture/occlusion artifacts. It does not recognize identities.
- Smart healing/expansion propagates matching surrounding texture. It is content-aware image synthesis, not a generative scene model; large missing regions can show repetition or seams. Manual/clone/reflection alternatives remain available.
- Film responses are independently designed rather than copies of proprietary film presets. Processing can differ slightly between preview/export resolutions. Pixel math and seeded grain are deterministic for a given resolution.
- After RAW development, display operations and exports use 8-bit sRGB. Camera support follows the bundled LibRaw codecs. Unsupported original color profiles/manufacturer tags are not reattached to converted pixels; PNG transparency is retained and JPEG transparency is flattened onto white.
- Browser memory, local-storage availability, camera permissions, and installed-PWA OS support remain platform constraints. Offline use requires the first installation to finish.
