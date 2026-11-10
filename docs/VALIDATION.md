# Validation

Validated in the supplied workspace on November 10, 2026.

| Check                                | Result                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and Vite production build | Passed                                                                                                                                   |
| Unit tests                           | 14 passed: tone math, HSL roundtrips, LUT interpolation/domains, malformed presets                                                       |
| Chromium browser tests               | 16 passed, including actual pixel changes across all 36 tools                                                                            |
| Export                               | Downloaded PNG header and full working dimensions verified; JPG offline export verified                                                  |
| Local tools                          | Real brush/healing strokes, crop/rotate geometry, text rendering, undo/redo/compare verified                                             |
| Presets                              | JSON validation, saved Looks, QR roundtrip, .cube import, Hald PNG import, XMP and ZIP pack import verified                              |
| Batch                                | Two edited PNG files extracted and verified from the downloaded ZIP                                                                      |
| Offline                              | Browser networking disabled; reload, restored source/edits, pixel adjustment, and export passed                                          |
| PWA File Handling                    | Manifest extensions/scope and simulated initial OS file launch passed                                                                    |
| RAW                                  | Real 30.3 MB Sony ARW decoded locally; working image 6000 × 4008                                                                         |
| GitHub Pages path                    | Separate build with `BASE_PATH=/photo-editor/`; all asset/worker URLs correctly scoped                                                   |
| Offline RAW at repository subpath    | Real Sony ARW opened after disabling networking; no runtime errors or failed requests                                                    |
| Responsive layout                    | No horizontal overflow observed at widths 320, 375, 390, 430, 768, 820, 1024, 1366, and 1920; mobile photo stays above the editing sheet |
| Landscape phone                      | 740 × 390 fits the viewport; adjustments open alongside the photo                                                                        |
| Dependency audit                     | Production dependency audit reported zero vulnerabilities                                                                                |
| Formatting                           | Prettier check passed                                                                                                                    |

OS-level PWA installation/association and a live GitHub Pages deployment were not performed. The launch-queue browser test simulates file handles; actual OS association remains a manual check on each target platform. Tests do not establish proprietary Snapseed output equivalence.

## Screenshots

Desktop:

![Still desktop workspace](screenshots/desktop.png)

Mobile workspace and adjustments:

![Still mobile workspace](screenshots/mobile.png)

![Still mobile adjustment sheet](screenshots/mobile-adjust.png)
