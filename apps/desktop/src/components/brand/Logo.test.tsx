import { render, screen } from "@testing-library/react";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { Logo, Mark, Wordmark } from "./Logo";

import "@/styles/global.css";

const paint = (element: Element) => getComputedStyle(element).fill;

function setTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
}

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
});

describe("the logo components", () => {
  it("name themselves for screen readers", () => {
    render(<Logo />);

    expect(screen.getByRole("img", { name: "Arden Code" })).toBeVisible();
  });

  it("can be hidden from screen readers when the name is written next to them", () => {
    const { container } = render(<Mark decorative />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <div>
        <Logo />
        <Logo orientation="stacked" />
        <Mark />
        <Wordmark />
      </div>,
    );

    await expectNoAccessibilityViolations(container);
  });

  it("stacks the mark above the wordmark on request", () => {
    render(
      <>
        <Logo data-testid="horizontal" />
        <Logo orientation="stacked" data-testid="stacked" />
      </>,
    );
    const horizontal = screen.getByTestId("horizontal").getBoundingClientRect();
    const stacked = screen.getByTestId("stacked").getBoundingClientRect();

    expect(horizontal.width / horizontal.height).toBeGreaterThan(3);
    expect(stacked.width / stacked.height).toBeLessThan(2);
  });

  it("paints the wordmark dark in the light theme and light in the dark theme", () => {
    const { container } = render(<Wordmark />);
    const letters = container.querySelector("path");
    if (!letters) throw new Error("the wordmark has no outline");

    setTheme("light");
    const inLight = paint(letters);
    setTheme("dark");
    const inDark = paint(letters);

    expect(inLight).not.toBe(inDark);
  });

  it("keeps the mark the same orange in both themes", () => {
    const { container } = render(<Mark />);
    const shape = container.querySelector("path");
    if (!shape) throw new Error("the mark has no outline");

    setTheme("light");
    const inLight = paint(shape);
    setTheme("dark");
    const inDark = paint(shape);

    expect(inLight).toBe(inDark);
    expect(inLight).not.toBe("rgb(0, 0, 0)");
  });
});
