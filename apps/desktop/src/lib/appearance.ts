import type { Settings } from "@/ipc/bindings";

/** The settings that change how the page is drawn, other than the theme. */
export type Appearance = Pick<
  Settings["appearance"],
  "zoom" | "followTextSize" | "codeFontSize" | "codeLigatures"
>;

/**
 * How much larger than normal the whole interface is: the zoom setting, times the Windows text size
 * when the person follows it. Both are percentages; the result is a factor, 1 being normal.
 */
export function interfaceScale(
  { zoom, followTextSize }: Pick<Appearance, "zoom" | "followTextSize">,
  windowsTextScalePercent: number,
): number {
  const factor = (zoom / 100) * (followTextSize ? windowsTextScalePercent / 100 : 1);
  // Multiplying percentages leaves float noise such as 1.6500000000000001.
  return Math.round(factor * 10_000) / 10_000;
}

/**
 * Puts the appearance on the root element, where the styles read it: `--zoom` scales everything (all
 * sizes are in rem), and `--code-font-size` and `--code-ligatures` style code.
 */
export function paintAppearance(
  root: HTMLElement,
  appearance: Appearance,
  windowsTextScalePercent: number,
) {
  const { codeFontSize, codeLigatures } = appearance;
  root.style.setProperty("--zoom", String(interfaceScale(appearance, windowsTextScalePercent)));
  // Code sizes are set in pixels; rem makes them follow the zoom like everything else.
  root.style.setProperty("--code-font-size", `${codeFontSize / 16}rem`);
  root.style.setProperty("--code-ligatures", codeLigatures ? "normal" : "none");
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

/** Whether Windows asks for fewer animations. */
export const windowsReducesMotion = () => window.matchMedia(reducedMotionQuery).matches;

export function subscribeToWindowsMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Whether motion is reduced, given the setting and what Windows asks for. */
export function motionIsReduced(
  setting: Settings["appearance"]["reduceMotion"],
  systemReduces: boolean,
): boolean {
  return setting === "on" || (setting === "system" && systemReduces);
}

/** Switches animations off (or on) for the whole page; base.css does the rest. */
export function paintMotion(root: HTMLElement, reduce: boolean) {
  root.dataset.motion = reduce ? "reduce" : "full";
}
