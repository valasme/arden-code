/** Waits until an element and everything inside it has finished animating, so it can be measured. */
export async function animationsDone(element: Element): Promise<void> {
  await Promise.all(
    element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
  );
}
