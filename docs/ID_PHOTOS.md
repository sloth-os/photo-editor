# ID photo sizes

Open **Tools → ID photo**, or **Export → Choose an ID photo size**. Pick a size and print resolution, then drag the image and adjust Subject size to frame the face. The framing guide is visible only in the editor. Apply and export at full working resolution to keep the selected pixel dimensions.

| Preset          | Physical size             | Pixels at 300 dpi |
| --------------- | ------------------------- | ----------------- |
| Common passport | 35 × 45 mm                | 413 × 531         |
| US passport     | 2 × 2 in (50.8 × 50.8 mm) | 600 × 600         |
| Canada passport | 50 × 70 mm                | 591 × 827         |
| China passport  | 33 × 48 mm                | 390 × 567         |
| China ID        | 26 × 32 mm                | 307 × 378         |
| 1-inch photo    | 25 × 35 mm                | 295 × 413         |
| 2-inch photo    | 35 × 49 mm                | 413 × 579         |
| Other ID        | 30 × 40 mm                | 354 × 472         |

150 and 600 dpi are also available. Pixel dimensions round to the nearest whole pixel. Export adds EXIF resolution tags, PNG pHYs, and JPEG JFIF density so print software can interpret the physical size. Resolution tags are included even when camera metadata preservation is off; camera/GPS tags require that separate option.

Use **Remove background** with a white/color fill if the photo needs another backdrop. The size presets do not validate official face proportions, expression, lighting, or eligibility; check the issuing authority's requirements. Resampling sets dimensions but cannot restore missing image detail.

Export can convert to JPG/PNG/WebP, reduce pixels by percentage or custom dimensions, and limit encoded file size. ID-photo file limits adjust JPG/WebP quality without automatically shrinking its dimensions; a limit too small for those dimensions returns a clear error. PNG is lossless, so a tight limit may require JPG instead. Explicit pixel resizing also updates the embedded print density to retain physical dimensions.
