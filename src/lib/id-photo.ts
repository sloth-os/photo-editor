import type { Params } from "./catalog";
export const idPhotoSizes = [
  { id: "35x45", name: "35 × 45 mm · common passport", width: 35, height: 45 },
  { id: "us-2x2", name: "2 × 2 in · US passport", width: 50.8, height: 50.8 },
  { id: "50x70", name: "50 × 70 mm · Canada passport", width: 50, height: 70 },
  { id: "33x48", name: "33 × 48 mm · China passport", width: 33, height: 48 },
  { id: "26x32", name: "26 × 32 mm · China ID", width: 26, height: 32 },
  { id: "25x35", name: "25 × 35 mm · 1-inch photo", width: 25, height: 35 },
  { id: "35x49", name: "35 × 49 mm · 2-inch photo", width: 35, height: 49 },
  { id: "30x40", name: "30 × 40 mm · ID photo", width: 30, height: 40 },
];
export function idPhotoDimensions(params: Params) {
  const preset =
      idPhotoSizes.find((size) => size.id === params.preset) || idPhotoSizes[0],
    dpi = [150, 300, 600].includes(Number(params.dpi))
      ? Number(params.dpi)
      : 300;
  return {
    width: Math.round((preset.width / 25.4) * dpi),
    height: Math.round((preset.height / 25.4) * dpi),
    dpi,
    preset,
  };
}
