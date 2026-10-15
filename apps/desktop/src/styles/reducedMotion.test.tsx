import { render, screen } from "@testing-library/react";

import "@/styles/global.css";

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute("data-motion");
});

describe("Reduced motion", () => {
  it("stops every animation but a spinner, which keeps turning while something is waited on", async () => {
    root.dataset["motion"] = "reduce";
    render(
      <>
        <output aria-label="Refreshing" className="animate-spin" />
        <p className="animate-in fade-in-0">Opening</p>
        <p style={{ transition: "opacity 1s" }}>Fading</p>
      </>,
    );

    const spinner = getComputedStyle(await screen.findByRole("status", { name: "Refreshing" }));
    expect(spinner.animationName).toBe("spin");
    expect(spinner.animationDuration).toBe("1s");
    expect(spinner.animationIterationCount).toBe("infinite");

    const other = getComputedStyle(screen.getByText("Opening"));
    expect(Number.parseFloat(other.animationDuration)).toBeLessThan(0.001);
    expect(other.animationIterationCount).toBe("1");
    const fading = getComputedStyle(screen.getByText("Fading"));
    expect(Number.parseFloat(fading.transitionDuration)).toBeLessThan(0.001);
  });
});
