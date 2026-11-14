# Document scanner

Open **Scan** in the desktop rail or phone toolbar, or find **Document scanner**
in Tools. Processing, OCR, and PDF creation run on your device and work offline
after the app finishes its first installation.

## Capture and organize

**Camera** opens a live document view with front/back and physical-lens choices.
Camera light appears when the browser exposes torch support. Document text stays
unmirrored. The outline follows detected edges; **Auto capture when steady**
captures a stable, sharp page and waits for movement before another capture.
The shutter also works manually. **Done** returns to the captured pages.

**Add photos** imports multiple images. **Use current photo** adds the visible
photo-editor result, including pending edits. Photos can be dropped onto the
scanner. If live camera access fails, use the device-camera fallback or import.

Documents hold up to 20 pages. Thumbnails select a page; arrow buttons move it
earlier/later. Deletion has an undo action. The latest scan autosaves separately
from the photo project and resumes when Scan opens. Wait for **Saved on this
device** before reloading. **New document** asks before replacing that draft.

## Frame and clean

Corners shows the working photo and four handles. Drag them with a finger or
mouse; a magnifier helps placement. Arrow keys move a focused handle by one source
pixel; Shift moves ten. Corners cannot cross. **Find edges** tries again; **Full
image** restores the frame. The phone crop view gives space to the photo.
**Scan** shows the corrected result and adjustment controls. The expand button
enlarges either preview; the return button or Escape restores the controls.

Choose **Original**, **Clean color**, **Grayscale**, **Black & white**, or
**Whiteboard**. Clean color levels uneven paper illumination; Whiteboard retains
colored marker strokes. More scan settings includes cleanup strength, the B&W
ink threshold, and page proportions. Follow the crop estimates proportions from
the photographed edges. Choose A4, Letter, or the ID-card ratio when the intended
shape is known. Rotation changes the corrected page in quarter turns.

## Annotate and redact

**Edit a copy** opens a corrected page in Still's photo editor. Use text, drawing,
numbering, stickers, highlights, or privacy tools. Reopen Scan, select the page
to update, then choose **More scan settings → Replace page with current photo**.
The replacement includes visible pending edits, keeps page order, clears old
OCR, and offers undo. **Use current photo** adds a new page instead.

## OCR and export

Text/OCR recognizes one page or every page using the existing local models.
English, simplified/traditional Chinese, Japanese, Korean, Spanish, French,
German, Arabic, and Hindi are available, plus a combined profile. Select the
appropriate language and review results. Copy page text or save recognized pages
as UTF-8 TXT. Changes to a page's image, crop, filter, or rotation clear old OCR.

- **PDF** saves pages in order. A4, US Letter, US Legal, and native scan size at
  150 dpi are available. Fixed paper sizes fit the image without clipping and
  follow its portrait/landscape orientation.
- **Searchable PDF with OCR** recognizes pages still missing text during export.
  It retains the scanned appearance and adds selectable/searchable Unicode text,
  including Chinese/Japanese, without downloading a font.
- **JPG or PNG** saves one image for a single/current page, or a numbered ZIP for
  multiple pages. Compact, Standard, and High quality are bounded to 1400, 2200,
  and 3200 pixels.

Exports can be cancelled without producing a partial download. Pages already
imported remain in the document.

## Research and implementation

Reference review: November 14, 2026.

| Reference workflow                       | Still implementation                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Capture/import with live page edges      | Local camera frames and images; Sobel edges and gradient-directed Hough line voting in a worker     |
| Adjust boundaries and remove perspective | Convex four-corner control, projective homography, bilinear sampling, bounded allocation            |
| Enhance documents and whiteboards        | Local paper-white estimation, illumination normalization, grayscale and paper-relative thresholding |
| Review, reorder, rotate, annotate        | Filmstrip, rotation, deletion/undo, retained working photos, and the photo-editor copy/replace flow |
| OCR and share documents                  | Local Tesseract, TXT, PDF, Unicode search layers, JPG/PNG and ZIP                                   |

Sources:

- [CamScanner overview](https://www.camscanner.com/): batch scanning, edge and
  perspective correction, enhancement, OCR, and PDF organization.
- [Microsoft Lens for Android](https://support.microsoft.com/en-us/lens/microsoft-lens-for-android)
  and [Lens for iOS](https://support.microsoft.com/en-us/lens/microsoft-lens-for-ios):
  document/whiteboard/photo modes, capture/import, boundaries, review, rotation,
  reordering, annotation, and PDF/OCR. These are workflow references;
  [Microsoft's notice](https://support.microsoft.com/en-us/lens/retirement-of-microsoft-lens)
  records Lens's 2026 retirement.
- [pdf-lib](https://pdf-lib.js.org/): local image embedding and PDF generation.
  Search layers use embedded blank Type 3 glyphs, ToUnicode maps, and ActualText
  spans. PDF.js tests verify extraction; the reader is a development dependency.

Working photos are normalized to at most 3200 px/8 MP. Export processes pages
sequentially. Scanner code, its worker, PDF code, and OCR assets are precached.
The separate IndexedDB draft stores source Blobs, geometry/settings, thumbnails,
and OCR. Exports contain processed images and selected text, with no attached
working photos or edit history.

This scanner corrects flat pages. Weak boundaries may need manual corners.
Curled-book dewarping, finger/glare reconstruction, cloud document libraries,
existing-PDF import, and reconstructed Word/Excel output are outside this feature.
OCR accuracy depends on print clarity, layout, and language. Browser storage can
be cleared or evicted; keep downloaded copies of important scans.
