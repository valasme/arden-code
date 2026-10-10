import { render } from "@testing-library/react";
import type { LucideIcon } from "lucide-react";

/** What an icon draws: its shapes, whatever its size or color. */
export function drawingOf(Icon: LucideIcon): string {
  const { container, unmount } = render(<Icon />);
  const drawing = container.querySelector("svg")?.innerHTML ?? "";
  unmount();
  return drawing;
}

/** What the first icon inside an element draws. */
export function drawingIn(element: Element): string {
  return element.querySelector("svg")?.innerHTML ?? "";
}

/** What each icon inside an element draws. */
export function drawingsIn(element: Element): string[] {
  return [...element.querySelectorAll("svg")].map((svg) => svg.innerHTML);
}
