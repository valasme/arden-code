import { waitFor } from "@testing-library/react";

/** Waits until an element and everything inside it has finished animating, so it can be measured. */
export async function animationsDone(element: Element): Promise<void> {
  await Promise.all(
    element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
  );
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
