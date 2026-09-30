import type { Settings } from "@/ipc/bindings";

/** The settings that change how the page is drawn, other than the theme. */
export type Appearance = Pick<Settings["appearance"], "zoom" | "codeFontSize" | "codeLigatures">;

/**
 * Puts the appearance on the root element, where the styles read it: `--zoom` scales everything (all
 * sizes are in rem), and `--code-font-size` and `--code-ligatures` style code.
 */
export function paintAppearance(
  root: HTMLElement,
  { zoom, codeFontSize, codeLigatures }: Appearance,
) {
  root.style.setProperty("--zoom", String(zoom / 100));
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
