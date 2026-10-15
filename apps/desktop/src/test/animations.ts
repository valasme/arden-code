import { waitFor } from "@testing-library/react";

/** Waits until an element and everything inside it has finished animating, so it can be measured. */
export async function animationsDone(element: Element): Promise<void> {
  await Promise.all(
    element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
  );
}

/**
 * Waits until nothing Motion moves inside an element is still on its way (ADR 0054): a row in its
 * place and fully drawn, and a row that was leaving gone. Motion draws its moves itself, frame by
 * frame, so the browser's own list of animations does not hold them.
 */
export async function motionDone(element: Element): Promise<void> {
  await waitFor(() => {
    for (const moved of element.querySelectorAll<HTMLElement>(
      "[style*=transform], [style*=opacity]",
    )) {
      const style = getComputedStyle(moved);
      expect(style.transform === "none" && style.opacity === "1", "still moving").toBe(true);
    }
  });
}

/**
 * Waits until no menu is left, once its closing animation is over. Until then, Radix keeps the rest
 * of the page hidden from the accessibility tree; with a live region on the page, it hides the
 * page's parts one by one, so a landmark can be back before the controls in it are.
 */
export async function menuClosed(): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector("[role=menu]")).toBeNull();
  });
}
