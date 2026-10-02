import { render, screen } from "@testing-library/react";

import { Slider } from "./slider";

import "@/styles/global.css";

describe("Slider", () => {
  it("is a thin track with an upright thumb, half as wide as it is tall", () => {
    render(
      <>
        <span id="zoom">Zoom</span>
        <Slider aria-labelledby="zoom" min={80} max={200} value={[100]} />
      </>,
    );
    const thumb = screen.getByRole("slider", { name: "Zoom" }).getBoundingClientRect();
    const track = document.querySelector("[data-slot=slider-track]")?.getBoundingClientRect();

    expect(thumb.height).toBe(thumb.width * 2);
    expect(track?.height).toBeLessThanOrEqual(2);
  });
});
