import { render, screen } from "@testing-library/react";

import { Slider } from "./slider";

import "@/styles/global.css";

describe("Slider", () => {
  it("is a thin rounded track with a round thumb", () => {
    render(
      <>
        <span id="zoom">Zoom</span>
        <Slider aria-labelledby="zoom" min={80} max={200} value={[100]} />
      </>,
    );
    const thumb = screen.getByRole("slider", { name: "Zoom" }).getBoundingClientRect();
    const track = document.querySelector("[data-slot=slider-track]")?.getBoundingClientRect();

    const thumbStyle = getComputedStyle(screen.getByRole("slider", { name: "Zoom" }));

    expect(thumb.height).toBe(thumb.width);
    expect(thumbStyle.borderTopLeftRadius).not.toBe("0px");
    expect(track?.height).toBeLessThanOrEqual(4);
  });
});
