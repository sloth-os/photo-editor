/// <reference lib="webworker" />
import { detectDocument, renderDocument } from "./scanner";
import type { ScanQuad, ScanSettings } from "./scanner-types";
type Request = {
  id: number;
  operation: "detect" | "render";
  data: ArrayBuffer;
  width: number;
  height: number;
  corners?: ScanQuad;
  settings?: ScanSettings;
  max?: number;
};
self.onmessage = (event: MessageEvent<Request>) => {
  const m = event.data;
  try {
    const pixels = new Uint8ClampedArray(m.data);
    if (m.operation === "detect")
      self.postMessage({
        id: m.id,
        result: detectDocument(pixels, m.width, m.height),
      });
    else {
      const result = renderDocument(
        pixels,
        m.width,
        m.height,
        m.corners!,
        m.settings!,
        m.max,
      );
      self.postMessage(
        {
          id: m.id,
          result: {
            width: result.width,
            height: result.height,
            data: result.data.buffer,
          },
        },
        [result.data.buffer],
      );
    }
  } catch (e) {
    self.postMessage({
      id: m.id,
      error: e instanceof Error ? e.message : "Could not process this page.",
    });
  }
};
