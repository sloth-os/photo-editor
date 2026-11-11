import type { Params } from "./catalog";
export function normalizeRotation(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
export function textFont(params: Params, size: number) {
  return `${params.style === "bold" ? "700" : "400"} ${size}px ${params.font === "sans" ? '"DM Sans", sans-serif' : params.font === "mono" ? "monospace" : "Georgia, serif"}`;
}
