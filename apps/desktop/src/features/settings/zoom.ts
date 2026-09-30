import type { Settings } from "@/ipc/bindings";

/** The zoom limits, in percent. Rust keeps the setting inside the same range. */
export const zoomRange = { min: 80, max: 200 } as const;

/** The levels Ctrl+= and Ctrl+− move between: the same ones browsers use. */
const zoomLevels = [80, 90, 100, 110, 125, 150, 175, 200] as const;

/** The zoom after one step in or out from `current`. */
export function nextZoom(current: Settings["appearance"]["zoom"], direction: "in" | "out"): number {
  const next =
    direction === "in"
      ? zoomLevels.find((level) => level > current)
      : zoomLevels.findLast((level) => level < current);
  return next ?? (direction === "in" ? zoomRange.max : zoomRange.min);
}
