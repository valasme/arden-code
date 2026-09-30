/**
 * The areas of the window that F6 and Shift+F6 move between, in the order Windows apps use: the
 * title bar first, then across the window from left to right, and the status bar last.
 */
export const areaOrder = [
  "titlebar",
  "sidebar",
  "session",
  "messagebox",
  "inspector",
  "statusbar",
] as const;

export type Area = (typeof areaOrder)[number];

/**
 * The area after (or before) `current`, among the areas that are there now. `current` may be an
 * area that has just gone away, such as a closed inspector: the next one in the order is used.
 */
export function nextArea(
  present: readonly Area[],
  current: Area | undefined,
  direction: 1 | -1,
): Area | undefined {
  if (present.length === 0) return undefined;
  const first = present[0];
  const last = present.at(-1);
  if (current === undefined) return direction === 1 ? first : last;

  const position = areaOrder.indexOf(current);
  const ahead = present.find((area) => areaOrder.indexOf(area) > position);
  const behind = present.findLast((area) => areaOrder.indexOf(area) < position);
  if (direction === 1) return ahead ?? first;
  return behind ?? last;
}

const tabbable =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const element = (area: Area) => document.querySelector<HTMLElement>(`[data-area="${area}"]`);

/** The areas that are on screen now, in order. */
export function presentAreas(): Area[] {
  return areaOrder.filter((area) => element(area)?.checkVisibility() === true);
}

/** The area that has the keyboard focus, if any. */
export function focusedArea(): Area | undefined {
  const name = document.activeElement?.closest("[data-area]")?.getAttribute("data-area");
  return areaOrder.find((area) => area === name);
}

/** Moves the focus into an area: to its first control, or to the area itself when it has none. */
export function focusArea(area: Area) {
  const region = element(area);
  if (!region) return;
  const inside = region.querySelector<HTMLElement>(tabbable);
  if (inside) {
    inside.focus();
    return;
  }
  // A region with nothing to press can still hold the focus, once it is allowed to.
  if (!region.hasAttribute("tabindex")) region.tabIndex = -1;
  region.focus();
}

/** F6 and Shift+F6: moves the focus to the next (or previous) area. */
export function moveToArea(direction: 1 | -1) {
  const target = nextArea(presentAreas(), focusedArea(), direction);
  if (target) focusArea(target);
}
