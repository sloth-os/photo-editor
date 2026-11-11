import { analyze } from "./intelligence";
import { renderImage } from "./engine";
import type { Edit } from "./catalog";
import type { Photo } from "./files";
/** Rebuild scene-dependent selections against each new photo, in stack order. */
export async function prepareBatchEdits(
  photo: Photo,
  edits: Edit[],
  prefix: Edit[] = [],
): Promise<Edit[]> {
  const prepared: Edit[] = [...prefix];
  for (const edit of edits) {
    let next = { ...edit, params: { ...edit.params } };
    if (edit.mask || edit.depth || edit.faces?.length) {
      const source = await renderImage(
        photo.image,
        prepared,
        1000,
        photo.rawSource,
      );
      if (edit.mask) next = { ...next, ...(await analyze(source, "subject")) };
      if (edit.depth) next = { ...next, ...(await analyze(source, "depth")) };
      if (edit.faces?.length)
        next = {
          ...next,
          ...(await analyze(source, "face")),
          params: { ...next.params, faceIndex: 0 },
        };
    }
    prepared.push(next);
  }
  return prepared.slice(prefix.length);
}
