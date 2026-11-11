/// <reference lib="webworker" />
import { inpaintPixels } from "../lib/inpaint";
self.onmessage = ({
  data,
}: {
  data: {
    pixels: Uint8ClampedArray;
    mask: Uint8Array;
    width: number;
    height: number;
  };
}) => {
  try {
    const pixels = inpaintPixels(
      data.pixels,
      data.mask,
      data.width,
      data.height,
    );
    self.postMessage({ pixels }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Content-aware fill failed.",
    });
  }
};
